import type { Writable } from "node:stream";
import { Command } from "commander";
import { runCode } from "./run-code";
import type { RunFileConsoleMessage } from "./run-file";

export type CliOptions = {
  url: string;
  code: string;
  cwd?: string;
  debug?: boolean;
  stdout?: Writable;
  stderr?: Writable;
};

const AGENT_SKILL_HELP =
  "Agent and LLM guidance: https://github.com/XaveScor/inpagerun/blob/master/SKILL/inpagerun/SKILL.md";

export async function runCli(options: CliOptions): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  await runCode({
    code: options.code,
    cwd: options.cwd,
    onConsole(message) {
      return writeConsoleMessage(message, {
        debugEnabled: options.debug === true,
        stderr,
        stdout,
      });
    },
    url: options.url,
  });
}

export function getCliHelp(): string {
  let output = "";

  createProgram()
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

function createProgram(): Command {
  return new Command()
    .name("inpagerun")
    .usage("-u <url> -c <code>")
    .requiredOption("-u, --url <url>", "Page URL")
    .requiredOption("-c, --code <code>", "JavaScript code to run in the page")
    .option("--debug", "Forward browser console.debug output to stdout")
    .addHelpText("afterAll", `\n${AGENT_SKILL_HELP}`)
    .action(async (options: CliOptions) => {
      await runCli(options);
    });
}

export async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}

async function writeConsoleMessage(
  message: RunFileConsoleMessage,
  options: { debugEnabled: boolean; stdout: Writable; stderr: Writable },
): Promise<void> {
  switch (message.type) {
    case "debug":
      if (!options.debugEnabled) {
        return;
      }

      await writeLine(options.stdout, message.text === "" ? "[DEBUG]" : `[DEBUG] ${message.text}`);
      return;
    case "error":
      await writeLine(options.stderr, message.text);
      return;
    case "warn":
      await writeLine(options.stderr, message.text);
      return;
    default:
      await writeLine(options.stdout, message.text);
  }
}

function writeLine(stream: Writable, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(`${text}\n`, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
