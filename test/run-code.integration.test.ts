import { describe, expect, it } from "vitest";
import { runCode } from "../src/run-code";
import type { RunFileConsoleMessage } from "../src/run-file";
import { type TestCaseName, getCaseDir, readCaseCode } from "./helpers/cases";
import { startDevServer } from "./helpers/dev-server";
import { createTestTmpdir } from "./helpers/tmpdir";

describe("runCode", () => {
  it.each([
    ["console-log", "console-log-ok"],
    ["awaited-timeout", "awaited-timeout-ok"],
    ["static-import", "static-import-ok"],
    ["dynamic-import", "dynamic-import-ok"],
  ] as const)("runs the %s case", async (caseName, expectedText) => {
    const messages = await runSuccessfulCase(caseName);

    expect(messages).toEqual([{ text: expectedText, type: "log" }]);
  });

  it("rejects incorrect static imports", async () => {
    await expect(runFailingCase("incorrect-static-import")).rejects.toThrow(
      'Node module "node:fs" cannot be imported',
    );
  });

  it("rejects incorrect dynamic imports", async () => {
    await expect(runFailingCase("incorrect-dynamic-import")).rejects.toThrow(
      "Dynamic imports must use a string literal",
    );
  });

  it("runs when the page sends a restrictive CSP header", async () => {
    const messages = await runSuccessfulCase("csp-header", {
      "Content-Security-Policy": "default-src 'self'; script-src 'none'",
    });

    expect(messages).toEqual([{ text: "csp-header-ok", type: "log" }]);
  });
});

async function runSuccessfulCase(
  caseName: TestCaseName,
  headers?: Record<string, string>,
): Promise<RunFileConsoleMessage[]> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ headers, root: caseDir });
  const tmpdir = await createTestTmpdir();
  const messages: RunFileConsoleMessage[] = [];

  try {
    await runCode({
      code,
      cwd: caseDir,
      onConsole(message) {
        messages.push(message);
      },
      tmpdir: tmpdir.path,
      url: server.url,
    });
  } finally {
    await server.close();
    await tmpdir.close();
  }

  return messages;
}

async function runFailingCase(caseName: TestCaseName): Promise<void> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ root: caseDir });
  const tmpdir = await createTestTmpdir();

  try {
    await runCode({ code, cwd: caseDir, tmpdir: tmpdir.path, url: server.url });
  } finally {
    await server.close();
    await tmpdir.close();
  }
}
