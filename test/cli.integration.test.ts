import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getCliHelp, runCli } from "../src/cli";
import { runCloseCommand } from "../src/commands/close";
import { runOnceCommand } from "../src/commands/once";
import { runOpenCommand } from "../src/commands/open";
import { runPersistentRunCommand } from "../src/commands/run";
import { getCaseDir, readCaseCode, type TestCaseName } from "./helpers/cases";
import { startDevServer } from "./helpers/dev-server";
import { createMemoryWritable } from "./helpers/streams";
import { createTestTmpdir } from "./helpers/tmpdir";

describe("CLI commands", () => {
  it("includes the skill URL in help output", () => {
    expect(getCliHelp()).toContain(
      "Agent and LLM guidance: https://github.com/XaveScor/inpagerun/blob/master/SKILL/inpagerun/SKILL.md",
    );
  });

  it.each([
    [["once", "--help"], "Usage: inpagerun once -u <url> -c <code>"],
    [["open", "--help"], "Usage: inpagerun open [--headed] [--debug] <url>"],
    [["close", "--help"], "Usage: inpagerun close --id <id>"],
    [["--id", "page_000000", "--help"], "Usage: inpagerun --id <id> --code <code>"],
  ] as const)("prints help for %s without throwing", async (argv, expectedText) => {
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();

    await runCli([...argv], {
      stderr: stderr.stream,
      stdout: stdout.stream,
    });

    expect(stdout.output()).toContain(expectedText);
    expect(stderr.output()).toBe("");
  });

  it.each([
    ["console-log", "console-log-ok"],
    ["static-import", "static-import-ok"],
    ["dynamic-import", "dynamic-import-ok"],
    ["typescript-file-import", "typescript-file-import-ok"],
    ["typescript-nested-type-import", "typescript-nested-type-import-ok"],
  ] as const)("writes stdout for the %s case in once mode", async (caseName, expectedText) => {
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

  it("keeps page state between persistent runs", async () => {
    const caseDir = getCaseDir("console-log");
    const server = await startDevServer({ root: caseDir });
    const tmpdir = await createTestTmpdir();
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();

    try {
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      const id = stdout.output().trim();
      expect(id).toMatch(/^page_[a-f0-9]{6}$/);

      await runPersistentRunCommand(
        ["--id", id, "--code", "(globalThis as any).__inpagerunValue = 41;"],
        {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: stdout.stream,
          tmpdir: tmpdir.path,
        },
      );
      await runPersistentRunCommand(
        ["--id", id, "--code", "console.log((globalThis as any).__inpagerunValue + 1);"],
        {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: stdout.stream,
          tmpdir: tmpdir.path,
        },
      );
      await runCloseCommand(["--id", id], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      expect(stdout.output()).toBe(`${id}\n42\n${server.url} has closed\n`);
      expect(stderr.output()).toBe("");
    } finally {
      await server.close();
      await tmpdir.close();
    }
  });

  it("keeps a window value written by an earlier persistent run", async () => {
    const caseDir = getCaseDir("console-log");
    const server = await startDevServer({ root: caseDir });
    const tmpdir = await createTestTmpdir();
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();
    const value = randomUUID();
    let id: string | undefined;

    try {
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      id = stdout.output().trim();

      await runPersistentRunCommand(
        ["--id", id, "--code", `(window as any).inpagerun_test = ${JSON.stringify(value)};`],
        {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: stdout.stream,
          tmpdir: tmpdir.path,
        },
      );
      await runPersistentRunCommand(
        ["--id", id, "--code", "console.log((window as any).inpagerun_test);"],
        {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: stdout.stream,
          tmpdir: tmpdir.path,
        },
      );

      expect(stdout.output()).toBe(`${id}\n${value}\n`);
      expect(stderr.output()).toBe("");
    } finally {
      if (id) {
        await runCloseCommand(["--id", id], {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: createMemoryWritable().stream,
          tmpdir: tmpdir.path,
        }).catch(() => {});
      }

      await server.close();
      await tmpdir.close();
    }
  });

  it("runs persistent code when the page sends a restrictive CSP header", async () => {
    const caseDir = getCaseDir("csp-header");
    const server = await startDevServer({
      headers: {
        "Content-Security-Policy": "default-src 'self'; script-src 'none'",
      },
      root: caseDir,
    });
    const tmpdir = await createTestTmpdir();
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();
    let id: string | undefined;

    try {
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      id = stdout.output().trim();

      await runPersistentRunCommand(["--id", id, "--code", "console.log('persistent-csp-ok');"], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      expect(stdout.output()).toBe(`${id}\npersistent-csp-ok\n`);
      expect(stderr.output()).toBe("");
    } finally {
      if (id) {
        await runCloseCommand(["--id", id], {
          cwd: caseDir,
          stderr: stderr.stream,
          stdout: createMemoryWritable().stream,
          tmpdir: tmpdir.path,
        }).catch(() => {});
      }

      await server.close();
      await tmpdir.close();
    }
  });
});

async function runCliCase(
  caseName: TestCaseName,
  headers?: Record<string, string>,
): Promise<{ stdout: string; stderr: string }> {
  const caseDir = getCaseDir(caseName);
  const code = await readCaseCode(caseName);
  const server = await startDevServer({ headers, root: caseDir });
  const tmpdir = await createTestTmpdir();
  const stdout = createMemoryWritable();
  const stderr = createMemoryWritable();

  try {
    await runOnceCommand(["-u", server.url, "-c", code], {
      cwd: caseDir,
      stderr: stderr.stream,
      stdout: stdout.stream,
      tmpdir: tmpdir.path,
    });
  } finally {
    await server.close();
    await tmpdir.close();
  }

  return { stderr: stderr.output(), stdout: stdout.output() };
}
