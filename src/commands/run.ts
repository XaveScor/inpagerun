import { Command } from "commander";
import { writeConsoleMessage } from "../console-output";
import { runCodeInSession } from "../session";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

interface RunOptions {
  code: string;
  debug?: boolean;
  id: string;
}

export async function runPersistentRunCommand(
  argv: string[],
  context?: CommandContext,
): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createRunProgram(resolvedContext), argv);
}

function createRunProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("--id <id> --code <code>")
    .requiredOption("--id <id>", "Session id returned by inpagerun open")
    .requiredOption("--code <code>", "JavaScript code to run in the page")
    .option("--debug", "Forward browser console.debug output to stdout")
    .action(async (options: RunOptions) => {
      await runCodeInSession({
        code: options.code,
        cwd: context.cwd,
        id: options.id,
        onConsole(message) {
          return writeConsoleMessage(message, {
            debugEnabled: options.debug === true,
            stderr: context.stderr,
            stdout: context.stdout,
          });
        },
        tmpdir: context.tmpdir,
      });
    });
}
