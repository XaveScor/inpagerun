import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { inpagerunDynamicImportPlugin } from "./inpagerun-dynamic-import-plugin";
import { inpagerunResolvePlugin, USER_MODULE_ID } from "./inpagerun-resolve-plugin";

export type BundleOptions = {
  code: string;
  cwd?: string;
  consoleFunctionName?: string;
  doneFunctionName?: string;
  mode?: "run" | "test-discovery" | "test-execution";
  testUrl?: string;
};

export type BundleArtifact = {
  file: string;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

const BUNDLE_FILE_NAME = "bundle.js";
const USER_MODULE_FILE_NAME = "__inpagerun_user_code__.ts";
const require = createRequire(import.meta.url);

export async function bundle(options: BundleOptions): Promise<BundleArtifact> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), "inpagerun-"));
  const outDir = join(tempDir, "dist");
  const entryFile = join(tempDir, "entry.ts");
  const userModuleFile = join(cwd, USER_MODULE_FILE_NAME);

  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(
      entryFile,
      createEntrySource({
        consoleFunctionName: options.consoleFunctionName ?? "__inpagerunConsole",
        doneFunctionName: options.doneFunctionName ?? "__inpagerunDone",
        mode: options.mode ?? "run",
        testUrl: options.testUrl,
      }),
    );

    await build({
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      publicDir: false,
      root: cwd,
      plugins: [
        inpagerunResolvePlugin({ code: options.code, userModuleFile }),
        inpagerunDynamicImportPlugin(),
      ],
      resolve: {
        alias: {
          chai: require.resolve("chai"),
        },
      },
      build: {
        dynamicImportVarsOptions: {
          exclude: [/.*/],
        },
        emptyOutDir: true,
        lib: {
          entry: entryFile,
          fileName: () => BUNDLE_FILE_NAME,
          formats: ["es"],
        },
        minify: false,
        outDir,
        rolldownOptions: {
          output: {
            codeSplitting: false,
          },
        },
        sourcemap: false,
        target: "esnext",
        write: true,
      },
    });
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true });
    throw error;
  }

  let disposed = false;

  const dispose = async () => {
    if (disposed) {
      return;
    }

    disposed = true;
    await rm(tempDir, { force: true, recursive: true });
  };

  return {
    file: join(outDir, BUNDLE_FILE_NAME),
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

function createEntrySource(options: {
  consoleFunctionName: string;
  doneFunctionName: string;
  mode: "run" | "test-discovery" | "test-execution";
  testUrl?: string;
}): string {
  if (options.mode === "run") {
    return createRunEntrySource(options);
  }

  return createTestEntrySource({
    consoleFunctionName: options.consoleFunctionName,
    doneFunctionName: options.doneFunctionName,
    mode: options.mode,
    testUrl: options.testUrl,
  });
}

function createRunEntrySource(options: {
  consoleFunctionName: string;
  doneFunctionName: string;
}): string {
  return `
const doneFunctionName = ${JSON.stringify(options.doneFunctionName)};
const consoleFunctionName = ${JSON.stringify(options.consoleFunctionName)};

async function runModule() {
  await import("${USER_MODULE_ID}");
}

async function report(payload) {
  await window[doneFunctionName](payload);
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.name + ": " + value.message;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);

    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
  }

  return String(value);
}

async function forwardConsole(type, args) {
  const text = args.map((value) => formatValue(value)).join(" ");
  await window[consoleFunctionName]({ type, text });
}

async function withForwardedConsole(run) {
  const originalConsole = globalThis.console;
  const forwardedConsole = Object.create(originalConsole);
  const pending = new Set();

  for (const type of ["debug", "error", "info", "log", "warn"]) {
    forwardedConsole[type] = (...args) => {
      const task = forwardConsole(type, args);
      pending.add(task);
      void task.finally(() => {
        pending.delete(task);
      });
    };
  }

  globalThis.console = forwardedConsole;

  try {
    await run();
    await Promise.all(pending);
  } finally {
    globalThis.console = originalConsole;
  }
}

void (async () => {
  try {
    await withForwardedConsole(async () => {
      await runModule();
    });
    await report({ ok: true });
  } catch (error) {
    const normalized = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "Error", message: String(error), stack: undefined };

    await report({ ok: false, error: normalized });
  }
})();
`;
}

function createTestEntrySource(options: {
  consoleFunctionName: string;
  doneFunctionName: string;
  mode: "test-discovery" | "test-execution";
  testUrl?: string;
}): string {
  return `
import { expect as chaiExpect } from "chai";

const doneFunctionName = ${JSON.stringify(options.doneFunctionName)};
const consoleFunctionName = ${JSON.stringify(options.consoleFunctionName)};
const testMode = ${JSON.stringify(options.mode)};
const executionUrl = ${JSON.stringify(options.testUrl)};

async function runModule() {
  await import("${USER_MODULE_ID}");
}

async function report(payload) {
  await window[doneFunctionName](payload);
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.name + ": " + value.message;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);

    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
  }

  return String(value);
}

function normalizeError(error) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: "Error", message: String(error), stack: undefined };
}

async function forwardConsole(type, args) {
  const text = args.map((value) => formatValue(value)).join(" ");
  await window[consoleFunctionName]({ type, text });
}

async function withForwardedConsole(run) {
  const originalConsole = globalThis.console;
  const forwardedConsole = Object.create(originalConsole);
  const pending = new Set();

  for (const type of ["debug", "error", "info", "log", "warn"]) {
    forwardedConsole[type] = (...args) => {
      const task = forwardConsole(type, args);
      pending.add(task);
      void task.finally(() => {
        pending.delete(task);
      });
    };
  }

  globalThis.console = forwardedConsole;

  try {
    const value = await run();
    await Promise.all(pending);
    return value;
  } finally {
    globalThis.console = originalConsole;
  }
}

function createRuntime() {
  const suites = [];

  globalThis.expect = chaiExpect;
  globalThis.__inpagerunCreateTest = (...urls) => {
    if (urls.length === 0) {
      throw new Error("createTest requires at least one URL.");
    }

    const normalizedUrls = urls.map((url) => String(url));
    const suite = { urls: normalizedUrls, tests: [] };
    suites.push(suite);

    return (name, fn) => {
      suite.tests.push({ name: String(name), fn });
    };
  };

  return suites;
}

function discoverTests(suites) {
  return {
    suites: suites.map((suite, suiteIndex) => ({
      suiteIndex,
      urls: suite.urls,
      tests: suite.tests.map((test, testIndex) => ({ name: test.name, testIndex })),
    })),
  };
}

async function executeTests(suites) {
  const tests = [];

  for (const [suiteIndex, suite] of suites.entries()) {
    if (!suite.urls.includes(executionUrl)) {
      continue;
    }

    for (const [testIndex, test] of suite.tests.entries()) {
      try {
        await test.fn();
        tests.push({ name: test.name, status: "passed", suiteIndex, testIndex });
      } catch (error) {
        tests.push({
          name: test.name,
          status: "failed",
          suiteIndex,
          testIndex,
          error: normalizeError(error),
        });
      }
    }
  }

  return { tests, url: executionUrl };
}

void (async () => {
  try {
    const value = await withForwardedConsole(async () => {
      const suites = createRuntime();
      await runModule();

      return testMode === "test-discovery" ? discoverTests(suites) : await executeTests(suites);
    });

    await report({ ok: true, value });
  } catch (error) {
    await report({ ok: false, error: normalizeError(error) });
  }
})();
`;
}
