import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCliHelp, runCli } from "../src/cli";
import { runCloseCommand } from "../src/commands/close";
import { runCloseAllCommand } from "../src/commands/closeall";
import { runOnceCommand } from "../src/commands/once";
import { runOpenCommand } from "../src/commands/open";
import { runPersistentRunCommand } from "../src/commands/run";
import { readState } from "../src/state";
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
    [["test", "--help"], "Usage: inpagerun test [files...] [--debug]"],
    [["open", "--help"], "Usage: inpagerun open [--headed] [--debug] [--extension <path>] <url>"],
    [["close", "--help"], "Usage: inpagerun close --id <id>"],
    [["closeall", "--help"], "Usage: inpagerun closeall"],
    [["--id", "session_000000", "--help"], "Usage: inpagerun --id <id> --code <code>"],
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

  it("runs inpagerun test files with chai assertions", async () => {
    const output = await runTestCase(`
import { createTest } from "inpagerun/test";

const test = createTest("__URL__");

test("reads title", () => {
  expect(document.title).to.equal("InpPageRun Test Page");
});

test("supports async tests", async () => {
  const text = await Promise.resolve(document.querySelector("button")?.textContent);
  expect(text).to.equal("Submit");
});
`);

    expect(output.stdout).toContain("sample.inpagerun.test.ts\n");
    expect(output.stdout).toContain("    ✓ reads title\n");
    expect(output.stdout).toContain("    ✓ supports async tests\n");
    expect(output.stdout).toContain("0 failed, 2 passed\n");
    expect(output.stderr).toBe("");
  });

  it("reports failing inpagerun test files after running all tests", async () => {
    const output = await runFailingTestCase(`
import { createTest } from "inpagerun/test";

const test = createTest("__URL__");

test("fails title", () => {
  expect(document.title).to.equal("Wrong Title");
});

test("continues after failure", () => {
  expect(document.querySelector("h1")?.textContent).to.equal("InpPageRun Test Page");
});
`);

    expect(output.stdout).toContain("    ✕ fails title\n");
    expect(output.stdout).toContain("    ✓ continues after failure\n");
    expect(output.stdout).toContain("expected 'InpPageRun Test Page' to equal 'Wrong Title'");
    expect(output.stdout).toContain("1 failed, 1 passed\n");
    expect(output.stderr).toBe("");
  });

  it("reports inpagerun test files without registered tests", async () => {
    const output = await runFailingTestCase(`
import { createTest } from "inpagerun/test";

createTest("__URL__");
`);

    expect(output.stdout).toContain("  ✕ No tests registered. Use createTest(...urls).\n");
    expect(output.stdout).toContain("1 failed, 0 passed\n");
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
      expect(id).toMatch(/^session_[a-f0-9]{6}$/);

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

  it("opens each persistent session in its own Chromium browser", async () => {
    const caseDir = getCaseDir("console-log");
    const server = await startDevServer({ root: caseDir });
    const tmpdir = await createTestTmpdir();
    const stderr = createMemoryWritable();
    let firstId: string | undefined;
    let secondId: string | undefined;

    try {
      const firstStdout = createMemoryWritable();
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: firstStdout.stream,
        tmpdir: tmpdir.path,
      });
      firstId = firstStdout.output().trim();

      const secondStdout = createMemoryWritable();
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: secondStdout.stream,
        tmpdir: tmpdir.path,
      });
      secondId = secondStdout.output().trim();

      const state = await readState(tmpdir.path);
      const firstBrowser = state?.sessions[firstId]?.browser;
      const secondBrowser = state?.sessions[secondId]?.browser;

      expect(firstBrowser?.pid).not.toBe(secondBrowser?.pid);
      expect(firstBrowser?.port).not.toBe(secondBrowser?.port);
      expect(firstBrowser?.userDataDir).not.toBe(secondBrowser?.userDataDir);

      const closeStdout = createMemoryWritable();
      await runCloseCommand(["--id", firstId], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: closeStdout.stream,
        tmpdir: tmpdir.path,
      });

      const runStdout = createMemoryWritable();
      await runPersistentRunCommand(["--id", secondId, "--code", "console.log('still-open');"], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: runStdout.stream,
        tmpdir: tmpdir.path,
      });

      expect(runStdout.output()).toBe("still-open\n");
      expect(stderr.output()).toBe("");
    } finally {
      if (secondId) {
        await runCloseCommand(["--id", secondId], {
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

  it("writes a message when closing all sessions with no open sessions", async () => {
    const tmpdir = await createTestTmpdir();
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();

    try {
      await runCloseAllCommand([], {
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      expect(stdout.output()).toBe("no sessions to close\n");
      expect(stderr.output()).toBe("");
    } finally {
      await tmpdir.close();
    }
  });

  it("closes all persistent sessions", async () => {
    const caseDir = getCaseDir("console-log");
    const server = await startDevServer({ root: caseDir });
    const tmpdir = await createTestTmpdir();
    const stderr = createMemoryWritable();

    try {
      const firstStdout = createMemoryWritable();
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: firstStdout.stream,
        tmpdir: tmpdir.path,
      });
      const firstId = firstStdout.output().trim();

      const secondStdout = createMemoryWritable();
      await runOpenCommand([server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: secondStdout.stream,
        tmpdir: tmpdir.path,
      });
      const secondId = secondStdout.output().trim();

      expect(Object.keys((await readState(tmpdir.path))?.sessions ?? {})).toEqual([
        firstId,
        secondId,
      ]);

      const closeStdout = createMemoryWritable();
      await runCloseAllCommand([], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: closeStdout.stream,
        tmpdir: tmpdir.path,
      });

      expect(closeStdout.output()).toBe(`${server.url} has closed\n${server.url} has closed\n`);
      expect(await readState(tmpdir.path)).toBeUndefined();
      expect(stderr.output()).toBe("");
    } finally {
      await server.close();
      await tmpdir.close();
    }
  });

  it("stores normalized extension paths for persistent sessions", async () => {
    const caseDir = getCaseDir("chromium-extension");
    const server = await startDevServer({ root: caseDir });
    const tmpdir = await createTestTmpdir();
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();
    let id: string | undefined;

    try {
      await runOpenCommand(["--extension", "./extension", server.url], {
        cwd: caseDir,
        stderr: stderr.stream,
        stdout: stdout.stream,
        tmpdir: tmpdir.path,
      });

      id = stdout.output().trim();
      const state = await readState(tmpdir.path);

      expect(state?.sessions[id]?.extensions).toEqual([{ path: join(caseDir, "extension") }]);
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

  it("does not accept extensions in once mode", async () => {
    const stdout = createMemoryWritable();
    const stderr = createMemoryWritable();

    await expect(
      runOnceCommand(
        ["--extension", "./extension", "-u", "https://example.com", "-c", "console.log(1)"],
        {
          stderr: stderr.stream,
          stdout: stdout.stream,
        },
      ),
    ).rejects.toThrow();
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

async function runTestCase(source: string): Promise<{ stdout: string; stderr: string }> {
  return await runTestCaseInternal(source, false);
}

async function runFailingTestCase(source: string): Promise<{ stdout: string; stderr: string }> {
  return await runTestCaseInternal(source, true);
}

async function runTestCaseInternal(
  source: string,
  expectFailure: boolean,
): Promise<{ stdout: string; stderr: string }> {
  const pageDir = getCaseDir("test-page");
  const server = await startDevServer({ root: pageDir });
  const tmpdir = await createTestTmpdir();
  const stdout = createMemoryWritable();
  const stderr = createMemoryWritable();

  try {
    const file = join(tmpdir.path, "sample.inpagerun.test.ts");
    await writeFile(file, source.replaceAll("__URL__", server.url), "utf8");
    const run = runCli(["test"], {
      cwd: tmpdir.path,
      stderr: stderr.stream,
      stdout: stdout.stream,
      tmpdir: tmpdir.path,
    });

    if (expectFailure) {
      await expect(run).rejects.toThrow("Test run failed");
    } else {
      await run;
    }
  } finally {
    await server.close();
    await tmpdir.close();
  }

  return { stderr: stderr.output(), stdout: stdout.output() };
}
