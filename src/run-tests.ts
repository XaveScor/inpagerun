import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { type Page, chromium } from "playwright";
import { closeDetachedBrowser, connectDetachedBrowser, startDetachedBrowser } from "./browser-host";
import { bundle } from "./bundle";
import { type RunFileConsoleMessage, createRunFileCallbackNames, runFileInPage } from "./run-file";
import type { ExtensionState } from "./state";
import { normalizePageUrl } from "./url";

export interface TestRunError {
  name: string;
  message: string;
  stack?: string;
}

export interface TestCaseResult {
  name: string;
  status: "passed" | "failed";
  error?: TestRunError;
}

export interface TestUrlResult {
  url: string;
  tests: TestCaseResult[];
}

export interface TestFileResult {
  file: string;
  urls: TestUrlResult[];
  error?: TestRunError;
}

export interface TestRunResult {
  files: TestFileResult[];
}

export interface RunTestFilesOptions {
  cwd?: string;
  extensions?: ExtensionState[];
  files?: string[];
  headed?: boolean;
  onConsole?: (message: RunFileConsoleMessage) => Promise<void> | void;
  tmpdir?: string;
}

interface DiscoveryResult {
  suites: {
    suiteIndex: number;
    urls: string[];
    tests: { name: string; testIndex: number }[];
  }[];
}

interface ExecutionResult {
  url: string;
  tests: {
    name: string;
    status: "passed" | "failed";
    suiteIndex: number;
    testIndex: number;
    error?: TestRunError;
  }[];
}

const DEFAULT_TEST_FILE_PATTERN = /\.inpagerun\.test\.tsx?$/;
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".coverage"]);

export async function runTestFiles(options: RunTestFilesOptions = {}): Promise<TestRunResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const files = await resolveTestFiles(cwd, options.files ?? []);
  const executionBrowser = await startExecutionBrowser({
    extensions: options.extensions ?? [],
    headed: options.headed === true,
    tmpdir: options.tmpdir,
  });

  await using browserHandle = {
    async [Symbol.asyncDispose]() {
      await executionBrowser.close();
    },
  };

  void browserHandle;

  const results: TestFileResult[] = [];

  for (const file of files) {
    const relativeFile = path.relative(cwd, file) || file;

    try {
      const code = await readFile(file, "utf8");
      const discovery = await discoverFileTests({ code, file, onConsole: options.onConsole });
      const urls = uniqueUrls(discovery);

      if (urls.length === 0 || countDiscoveredTests(discovery) === 0) {
        results.push({
          error: {
            message: "No tests registered. Use createTest(...urls).",
            name: "Error",
          },
          file: relativeFile,
          urls: [],
        });
        continue;
      }

      const urlResults: TestUrlResult[] = [];

      for (const url of urls) {
        const page = await executionBrowser.newPage();

        try {
          await page.goto(normalizePageUrl(url), { waitUntil: "load" });
          const execution = await executeFileTests({
            code,
            file,
            onConsole: options.onConsole,
            page,
            url,
          });

          urlResults.push({
            tests: execution.tests.map((test) => ({
              error: test.error,
              name: test.name,
              status: test.status,
            })),
            url,
          });
        } catch (error) {
          urlResults.push({
            tests: [
              {
                error: normalizeError(error),
                name: "runtime",
                status: "failed",
              },
            ],
            url,
          });
        } finally {
          await page.close().catch(() => {});
        }
      }

      results.push({ file: relativeFile, urls: urlResults });
    } catch (error) {
      results.push({ error: normalizeError(error), file: relativeFile, urls: [] });
    }
  }

  return { files: results };
}

async function startExecutionBrowser(options: {
  extensions: ExtensionState[];
  headed: boolean;
  tmpdir?: string;
}): Promise<{ close: () => Promise<void>; newPage: () => Promise<Page> }> {
  if (options.extensions.length === 0) {
    const browser = await chromium.launch({ headless: !options.headed });

    return {
      async close() {
        await browser.close();
      },
      async newPage() {
        return await browser.newPage({ bypassCSP: true });
      },
    };
  }

  const browserState = await startDetachedBrowser({
    extensions: options.extensions,
    headed: options.headed,
    tmpdir: options.tmpdir,
  });
  const browser = await connectDetachedBrowser(browserState);

  return {
    async close() {
      await browser.close().catch(() => {});
      await closeDetachedBrowser(browserState);
    },
    async newPage() {
      const context = browser.contexts()[0];

      if (!context) {
        throw new Error("Chromium extension browser did not expose a default context.");
      }

      return await context.newPage();
    },
  };
}

async function discoverFileTests(options: {
  code: string;
  file: string;
  onConsole?: (message: RunFileConsoleMessage) => Promise<void> | void;
}): Promise<DiscoveryResult> {
  const callbackNames = createRunFileCallbackNames();
  await using artifact = await bundle({
    code: options.code,
    consoleFunctionName: callbackNames.consoleFunctionName,
    cwd: path.dirname(options.file),
    doneFunctionName: callbackNames.doneFunctionName,
    mode: "test-discovery",
  });

  const browser = await chromium.launch();

  await using browserHandle = {
    async [Symbol.asyncDispose]() {
      await browser.close();
    },
  };

  void browserHandle;

  const page = await browser.newPage({ bypassCSP: true });

  try {
    await page.goto("about:blank", { waitUntil: "load" });
    return await runFileInPage<DiscoveryResult>({
      callbackNames,
      file: artifact.file,
      onConsole: options.onConsole,
      page,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function executeFileTests(options: {
  code: string;
  file: string;
  onConsole?: (message: RunFileConsoleMessage) => Promise<void> | void;
  page: Page;
  url: string;
}): Promise<ExecutionResult> {
  const callbackNames = createRunFileCallbackNames();
  await using artifact = await bundle({
    code: options.code,
    consoleFunctionName: callbackNames.consoleFunctionName,
    cwd: path.dirname(options.file),
    doneFunctionName: callbackNames.doneFunctionName,
    mode: "test-execution",
    testUrl: options.url,
  });

  return await runFileInPage<ExecutionResult>({
    callbackNames,
    file: artifact.file,
    onConsole: options.onConsole,
    page: options.page,
  });
}

async function resolveTestFiles(cwd: string, patterns: string[]): Promise<string[]> {
  const allFiles = await walkFiles(cwd);
  const files =
    patterns.length === 0
      ? allFiles.filter((file) => DEFAULT_TEST_FILE_PATTERN.test(file))
      : allFiles.filter((file) => patterns.some((pattern) => matchesPattern(cwd, file, pattern)));

  return [...new Set(files)].toSorted((left, right) => left.localeCompare(right));
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...(await walkFiles(fullPath)));
      }

      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function matchesPattern(cwd: string, file: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const relativeFile = normalizePath(path.relative(cwd, file));
  const absolutePattern = normalizePath(path.resolve(cwd, pattern));
  const absoluteFile = normalizePath(file);

  if (!hasGlobSyntax(pattern)) {
    return absoluteFile === absolutePattern || relativeFile === normalizedPattern;
  }

  return (
    globToRegExp(normalizedPattern).test(relativeFile) ||
    globToRegExp(absolutePattern).test(absoluteFile)
  );
}

function hasGlobSyntax(pattern: string): boolean {
  return /[*?[{]/.test(pattern);
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`);
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function uniqueUrls(discovery: DiscoveryResult): string[] {
  return [...new Set(discovery.suites.flatMap((suite) => suite.urls))];
}

function countDiscoveredTests(discovery: DiscoveryResult): number {
  return discovery.suites.reduce((count, suite) => count + suite.tests.length, 0);
}

function normalizeError(error: unknown): TestRunError {
  if (error instanceof Error) {
    return { message: error.message, name: error.name, stack: error.stack };
  }

  return { message: String(error), name: "Error" };
}
