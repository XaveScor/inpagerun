import { Command } from "commander";
import path from "node:path";
import { writeConsoleMessage, writeLine } from "../console-output";
import { type TestRunResult, runTestFiles } from "../run-tests";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

interface TestOptions {
  debug?: boolean;
  extension: string[];
  headed?: boolean;
}

export async function runTestCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createTestProgram(resolvedContext), argv);
}

function createTestProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun test")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("[files...] [--headed] [--debug] [--extension <path>]")
    .argument("[files...]", "Test files or globs")
    .option("--headed", "Open a visible Chromium window")
    .option("--debug", "Forward browser console.debug output to stdout")
    .option("--extension <path>", "Load an unpacked Chromium extension", collect, [])
    .action(async (files: string[], options: TestOptions) => {
      const result = await runTestFiles({
        cwd: context.cwd,
        extensions: options.extension.map((extensionPath) => ({
          path: path.resolve(context.cwd ?? process.cwd(), extensionPath),
        })),
        files,
        headed: options.headed === true,
        onConsole(message) {
          return writeConsoleMessage(message, {
            debugEnabled: options.debug === true,
            stderr: context.stderr,
            stdout: context.stdout,
          });
        },
        tmpdir: context.tmpdir,
      });

      await writeTestReport(result, context.stdout);

      if (hasFailures(result)) {
        const error = new Error("Test run failed");
        error.stack = undefined;
        throw error;
      }
    });
}

function collect(value: string, values: string[]): string[] {
  values.push(value);
  return values;
}

async function writeTestReport(
  result: TestRunResult,
  stdout: ReturnType<typeof resolveCommandContext>["stdout"],
): Promise<void> {
  let passed = 0;
  let failed = 0;

  if (result.files.length === 0) {
    await writeLine(stdout, "No test files found");
    return;
  }

  for (const file of result.files) {
    await writeLine(stdout, file.file);

    if (file.error) {
      failed += 1;
      await writeLine(stdout, `  ✕ ${file.error.message}`);
      continue;
    }

    for (const url of file.urls) {
      await writeLine(stdout, `  ${url.url}`);

      for (const test of url.tests) {
        if (test.status === "passed") {
          passed += 1;
          await writeLine(stdout, `    ✓ ${test.name}`);
          continue;
        }

        failed += 1;
        await writeLine(stdout, `    ✕ ${test.name}`);

        if (test.error) {
          await writeLine(stdout, `      ${test.error.message}`);
        }
      }
    }
  }

  await writeLine(stdout, "");
  await writeLine(stdout, `${failed} failed, ${passed} passed`);
}

function hasFailures(result: TestRunResult): boolean {
  return result.files.some((file) => {
    if (file.error) {
      return true;
    }

    return file.urls.some((url) => url.tests.some((test) => test.status === "failed"));
  });
}
