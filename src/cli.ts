import { Command } from "commander";
import { writeLine } from "./console-output";
import { runCloseCommand } from "./commands/close";
import { runCloseAllCommand } from "./commands/closeall";
import { runOnceCommand } from "./commands/once";
import { runOpenCommand } from "./commands/open";
import { runPersistentRunCommand } from "./commands/run";
import { runTestCommand } from "./commands/test";
import { resolveCommandContext, type CommandContext } from "./commands/types";

const AGENT_SKILL_HELP =
  "Agent and LLM guidance: https://github.com/XaveScor/inpagerun/blob/master/SKILL/inpagerun/SKILL.md";

export async function runCli(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);
  const [mode, ...rest] = argv;

  switch (mode) {
    case "once":
      await runOnceCommand(rest, resolvedContext);
      return;
    case "open":
      await runOpenCommand(rest, resolvedContext);
      return;
    case "test":
      await runTestCommand(rest, resolvedContext);
      return;
    case "close":
      await runCloseCommand(rest, resolvedContext);
      return;
    case "closeall":
      await runCloseAllCommand(rest, resolvedContext);
      return;
    case "--help":
    case "-h":
    case undefined:
      await writeLine(resolvedContext.stdout, getCliHelp().trimEnd());
      return;
    default:
      if (argv.includes("-u") || argv.includes("--url")) {
        throw new Error(
          "This syntax is no longer supported. Use: inpagerun once -u <url> -c <code>",
        );
      }

      await runPersistentRunCommand(argv, resolvedContext);
  }
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  try {
    await runCli(argv);
  } catch (error) {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}

function createProgram(): Command {
  return new Command()
    .name("inpagerun")
    .usage("<command>")
    .description("Run JavaScript inside real Chromium pages.")
    .addHelpText(
      "after",
      `
Commands:
  inpagerun once -u <url> -c <code>
  inpagerun test [files...] [--debug] [--extension <path>]
  inpagerun open [--headed] [--debug] [--extension <path>] <url>
  inpagerun --id <id> --code <code> [--debug]
  inpagerun close --id <id>
  inpagerun closeall

${AGENT_SKILL_HELP}`,
    );
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
