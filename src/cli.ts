import { Command } from "commander";
import { runCode } from "./run-code";
import type { RunFileConsoleMessage } from "./run-file";

type CliOptions = {
  url: string;
  code: string;
  debug?: boolean;
};

const program = new Command()
  .name("inpagerun")
  .usage("-u <url> -c <code>")
  .requiredOption("-u, --url <url>", "Page URL")
  .requiredOption("-c, --code <code>", "JavaScript code to run in the page")
  .option("--debug", "Forward browser console.debug output to stdout")
  .action(async (options: CliOptions) => {
    await runCode({
      code: options.code,
      onConsole(message) {
        writeConsoleMessage(message, options.debug === true);
      },
      url: options.url,
    });
  });

void main();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

function writeConsoleMessage(message: RunFileConsoleMessage, debugEnabled: boolean): void {
  switch (message.type) {
    case "debug":
      if (!debugEnabled) {
        return;
      }

      console.log(message.text === "" ? "[DEBUG]" : `[DEBUG] ${message.text}`);
      return;
    case "error":
      console.error(message.text);
      return;
    case "warn":
      console.warn(message.text);
      return;
    default:
      console.log(message.text);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
