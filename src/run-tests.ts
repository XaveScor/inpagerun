import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { bundle } from "./bundle";
import { createRunFileCallbackNames, runFileInPage, type RunFileConsoleMessage } from "./run-file";
import { normalizePageUrl } from "./url";

export type TestRunError = {
  name: string;
  message: string;
  stack?: string;
};

export type TestCaseResult = {
  name: string;
  status: "passed" | "failed";
  error?: TestRunError;
};

export type TestUrlResult = {
  url: string;
  tests: TestCaseResult[];
};

export type TestFileResult = {
  file: string;
  urls: TestUrlResult[];
  error?: TestRunError;
};

export type TestRunResult = {
  files: TestFileResult[];
};

export type RunTestFilesOptions = {
  cwd?: string;
  files?: string[];
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
};

type DiscoveryResult = {
  suites: Array<{
    suiteIndex: number;
    urls: string[];
    tests: Array<{ name: string; testIndex: number }>;
  }>;
};

type ExecutionResult = {
  url: string;
  tests: Array<{
    name: string;
    status: "passed" | "failed";
    suiteIndex: number;
    testIndex: number;
    error?: TestRunError;
  }>;
};

const DEFAULT_TEST_FILE_PATTERN = /\.inpagerun\.test\.tsx?$/;
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".coverage"]);

export async function runTestFiles(options: RunTestFilesOptions = {}): Promise<TestRunResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const files = await resolveTestFiles(cwd, options.files ?? []);
  const browser = await chromium.launch();

  await using browserHandle = {
    async [Symbol.asyncDispose]() {
      await browser.close();
    },
  };

  void browserHandle;

  const results: TestFileResult[] = [];

  for (const file of files) {
    const relativeFile = relative(cwd, file) || file;

    try {
      const code = await readFile(file, "utf8");
      const discovery = await discoverFileTests({ code, file, onConsole: options.onConsole });
      const urls = uniqueUrls(discovery);

      if (urls.length === 0 || countDiscoveredTests(discovery) === 0) {
        results.push({
          file: relativeFile,
          urls: [],
          error: {
            name: "Error",
            message: "No tests registered. Use createTest(...urls).",
          },
        });
        continue;
      }

      const urlResults: TestUrlResult[] = [];

      for (const url of urls) {
        const page = await browser.newPage({ bypassCSP: true });

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
      results.push({ file: relativeFile, urls: [], error: normalizeError(error) });
    }
  }

  return { files: results };
}

async function discoverFileTests(options: {
  code: string;
  file: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
}): Promise<DiscoveryResult> {
  const callbackNames = createRunFileCallbackNames();
  await using artifact = await bundle({
    code: options.code,
    consoleFunctionName: callbackNames.consoleFunctionName,
    cwd: dirname(options.file),
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
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
  page: import("playwright").Page;
  url: string;
}): Promise<ExecutionResult> {
  const callbackNames = createRunFileCallbackNames();
  await using artifact = await bundle({
    code: options.code,
    consoleFunctionName: callbackNames.consoleFunctionName,
    cwd: dirname(options.file),
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

  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        files.push(...(await walkFiles(path)));
      }

      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function matchesPattern(cwd: string, file: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const relativeFile = normalizePath(relative(cwd, file));
  const absolutePattern = normalizePath(resolve(cwd, pattern));
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
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function uniqueUrls(discovery: DiscoveryResult): string[] {
  return [...new Set(discovery.suites.flatMap((suite) => suite.urls))];
}

function countDiscoveredTests(discovery: DiscoveryResult): number {
  return discovery.suites.reduce((count, suite) => count + suite.tests.length, 0);
}

function normalizeError(error: unknown): TestRunError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return { name: "Error", message: String(error) };
}
