import { Command } from "commander";
import { writeConsoleMessage } from "../console-output";
import { runCode } from "../run-code";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

interface OnceOptions {
  code: string;
  debug?: boolean;
  url: string;
}

export async function runOnceCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createOnceProgram(resolvedContext), argv);
}

export function getOnceHelp(): string {
  let output = "";

  createOnceProgram(resolveCommandContext())
    .configureOutput({
      writeErr(text) {
        output += text;
      },
      writeOut(text) {
        output += text;
      },
    })
    .outputHelp();

  return output;
}

function createOnceProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun once")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("-u <url> -c <code>")
    .requiredOption("-u, --url <url>", "Page URL")
    .requiredOption("-c, --code <code>", "JavaScript code to run in the page")
    .option("--debug", "Forward browser console.debug output to stdout")
    .action(async (options: OnceOptions) => {
      await runCode({
        code: options.code,
        cwd: context.cwd,
        onConsole(message) {
          return writeConsoleMessage(message, {
            debugEnabled: options.debug === true,
            stderr: context.stderr,
            stdout: context.stdout,
          });
        },
        tmpdir: context.tmpdir,
        url: options.url,
      });
    });
}
