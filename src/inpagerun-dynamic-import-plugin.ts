import type { Plugin } from "vite";

export function inpagerunDynamicImportPlugin(): Plugin {
  return {
    enforce: "post",
    name: "inpagerun-dynamic-import",
    transform(code, _id, options) {
      if (!isJavaScriptModuleType(options?.moduleType)) {
        return null;
      }

      if (!/\bimport\s*\(/.test(code)) {
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

function isJavaScriptModuleType(moduleType: string | undefined): boolean {
  return moduleType === undefined || ["js", "jsx", "ts", "tsx"].includes(moduleType);
}

interface AstNode {
  type?: string;
  source?: AstNode;
  value?: unknown;
  start?: number;
  [key: string]: unknown;
}

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
