import { builtinModules } from "node:module";
import type { Plugin } from "vite";

export const USER_MODULE_ID = "virtual:inpagerun-user-code";
const TEST_MODULE_ID = "\0inpagerun-test-runtime";

const NODE_BUILTINS = new Set(
  builtinModules.flatMap((moduleName) => {
    const normalized = moduleName.startsWith("node:")
      ? moduleName.slice("node:".length)
      : moduleName;
    return [normalized, `node:${normalized}`];
  }),
);

export function inpagerunResolvePlugin(options: { code: string; userModuleFile: string }): Plugin {
  return {
    name: "inpagerun-resolve",
    enforce: "pre",
    resolveId(source) {
      if (source === "inpagerun/test") {
        return TEST_MODULE_ID;
      }

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
      if (id === TEST_MODULE_ID) {
        return `
export function createTest(...urls) {
  return globalThis.__inpagerunCreateTest(...urls);
}
`;
      }

      if (id === options.userModuleFile) {
        return createUserCodeSource(options.code);
      }

      return null;
    },
  };
}

function createUserCodeSource(code: string): string {
  return `${code}\nexport {};\n//# sourceURL=inpagerun-user-code-module.js`;
}

function isNodeBuiltin(source: string): boolean {
  return NODE_BUILTINS.has(source);
}
