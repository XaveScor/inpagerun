import { builtinModules } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, type Plugin } from "vite";

export type BundleOptions = {
  code: string;
  cwd?: string;
};

export type BundleArtifact = {
  file: string;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

const BUNDLE_FILE_NAME = "bundle.js";
const USER_MODULE_ID = "virtual:inpagerun-user-code";
const USER_MODULE_FILE_NAME = "__inpagerun_user_code__.ts";
const NODE_BUILTINS = new Set(
  builtinModules.flatMap((moduleName) => {
    const normalized = moduleName.startsWith("node:")
      ? moduleName.slice("node:".length)
      : moduleName;
    return [normalized, `node:${normalized}`];
  }),
);

export async function bundle(options: BundleOptions): Promise<BundleArtifact> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), "inpagerun-"));
  const outDir = join(tempDir, "dist");
  const entryFile = join(tempDir, "entry.ts");
  const userModuleFile = join(cwd, USER_MODULE_FILE_NAME);

  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(entryFile, createEntrySource());

    await build({
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      publicDir: false,
      root: cwd,
      plugins: [inpagerunPlugin({ code: options.code, userModuleFile })],
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

function createEntrySource(): string {
  return `
async function runModule() {
  await import("${USER_MODULE_ID}");
}

async function report(payload) {
  await window.__inpagerunDone(payload);
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
  await window.__inpagerunConsole({ type, text });
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

function createUserCodeSource(code: string): string {
  return `${code}\n//# sourceURL=inpagerun-user-code-module.js`;
}

function inpagerunPlugin(options: { code: string; userModuleFile: string }): Plugin {
  return {
    name: "inpagerun",
    enforce: "pre",
    resolveId(source) {
      if (source === USER_MODULE_ID) {
        return options.userModuleFile;
      }

      if (isNodeBuiltin(source)) {
        this.error(
          `Node module "${source}" cannot be imported because inpagerun code runs in the browser page.`,
        );
      }

      return null;
    },
    load(id) {
      if (id === options.userModuleFile) {
        return createUserCodeSource(options.code);
      }

      return null;
    },
    transform(code, _id, options) {
      if (!isJavaScriptModuleType(options?.moduleType)) {
        return null;
      }

      if (!code.includes("import")) {
        return null;
      }

      rejectNonLiteralDynamicImports(this.parse(code), (position) => {
        this.error(
          "Dynamic imports must use a string literal so inpagerun can bundle them before running in the browser.",
          position,
        );
      });

      return null;
    },
  };
}

function isNodeBuiltin(source: string): boolean {
  return NODE_BUILTINS.has(source);
}

function isJavaScriptModuleType(moduleType: string | undefined): boolean {
  return moduleType === undefined || ["js", "jsx", "ts", "tsx"].includes(moduleType);
}

type AstNode = {
  type?: string;
  source?: AstNode;
  value?: unknown;
  start?: number;
  [key: string]: unknown;
};

function rejectNonLiteralDynamicImports(ast: unknown, onError: (position?: number) => never): void {
  walkAst(ast, (node) => {
    if (node.type !== "ImportExpression") {
      return;
    }

    if (node.source?.type === "Literal" && typeof node.source.value === "string") {
      return;
    }

    onError(node.source?.start ?? node.start);
  });
}

function walkAst(node: unknown, visit: (node: AstNode) => void): void {
  if (!isAstNode(node)) {
    return;
  }

  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        walkAst(item, visit);
      }
    } else if (isAstNode(value)) {
      walkAst(value, visit);
    }
  }
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && "type" in value;
}
