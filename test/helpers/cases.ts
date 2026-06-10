import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type TestCaseName =
  | "console-log"
  | "static-import"
  | "dynamic-import"
  | "typescript-file-import"
  | "typescript-nested-type-import"
  | "incorrect-static-import"
  | "incorrect-dynamic-import"
  | "csp-header";

export function getCaseDir(name: TestCaseName): string {
  return fileURLToPath(new URL(`../cases/${name}`, import.meta.url));
}

export async function readCaseCode(name: TestCaseName): Promise<string> {
  return await readFile(join(getCaseDir(name), "code.ts"), "utf8");
}
