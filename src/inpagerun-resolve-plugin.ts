import { builtinModules } from "node:module";
import type { Plugin } from "vite";

export const USER_MODULE_ID = "virtual:inpagerun-user-code";

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
  };
}

function createUserCodeSource(code: string): string {
  return `${code}\n//# sourceURL=inpagerun-user-code-module.js`;
}

function isNodeBuiltin(source: string): boolean {
  return NODE_BUILTINS.has(source);
}
