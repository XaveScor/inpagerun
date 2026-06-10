import { describe, expect, it } from "vitest";
import { runCode } from "../src/run-code";
import type { RunFileConsoleMessage } from "../src/run-file";
import { getCaseDir, readCaseCode, type TestCaseName } from "./helpers/cases";
import { startDevServer } from "./helpers/dev-server";

describe("runCode", () => {
  it.each([
    ["console-log", "console-log-ok"],
    ["static-import", "static-import-ok"],
    ["dynamic-import", "dynamic-import-ok"],
  ] as const)("runs the %s case", async (caseName, expectedText) => {
    const messages = await runSuccessfulCase(caseName);

    expect(messages).toEqual([{ type: "log", text: expectedText }]);
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

    expect(messages).toEqual([{ type: "log", text: "csp-header-ok" }]);
  });
});

async function runSuccessfulCase(
  caseName: TestCaseName,
  headers?: Record<string, string>,
): Promise<RunFileConsoleMessage[]> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ headers, root: caseDir });
  const messages: RunFileConsoleMessage[] = [];

  try {
    await runCode({
      code,
      cwd: caseDir,
      onConsole(message) {
        messages.push(message);
      },
      url: server.url,
    });
  } finally {
    await server.close();
  }

  return messages;
}

async function runFailingCase(caseName: TestCaseName): Promise<void> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ root: caseDir });

  try {
    await runCode({ code, cwd: caseDir, url: server.url });
  } finally {
    await server.close();
  }
}
