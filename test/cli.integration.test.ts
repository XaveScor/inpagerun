import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import { getCaseDir, readCaseCode, type TestCaseName } from "./helpers/cases";
import { startDevServer } from "./helpers/dev-server";
import { createMemoryWritable } from "./helpers/streams";

describe("runCli", () => {
  it.each([
    ["console-log", "console-log-ok"],
    ["static-import", "static-import-ok"],
    ["dynamic-import", "dynamic-import-ok"],
  ] as const)("writes stdout for the %s case", async (caseName, expectedText) => {
    const output = await runCliCase(caseName);

    expect(output.stdout).toBe(`${expectedText}\n`);
    expect(output.stderr).toBe("");
  });

  it("rejects incorrect static imports", async () => {
    await expect(runCliCase("incorrect-static-import")).rejects.toThrow(
      'Node module "node:fs" cannot be imported',
    );
  });

  it("rejects incorrect dynamic imports", async () => {
    await expect(runCliCase("incorrect-dynamic-import")).rejects.toThrow(
      "Dynamic imports must use a string literal",
    );
  });

  it("writes stdout when the page sends a restrictive CSP header", async () => {
    const output = await runCliCase("csp-header", {
      "Content-Security-Policy": "default-src 'self'; script-src 'none'",
    });

    expect(output.stdout).toBe("csp-header-ok\n");
    expect(output.stderr).toBe("");
  });
});

async function runCliCase(
  caseName: TestCaseName,
  headers?: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ headers, root: caseDir });
  const stdout = createMemoryWritable();
  const stderr = createMemoryWritable();

  try {
    await runCli({
      code,
      cwd: caseDir,
      stderr: stderr.stream,
      stdout: stdout.stream,
      url: server.url,
    });
  } finally {
    await server.close();
  }

  return { stderr: stderr.output(), stdout: stdout.output() };
}
