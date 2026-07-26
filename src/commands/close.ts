import { Command } from "commander";
import { writeLine } from "../console-output";
import { closeSession } from "../session";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

interface CloseOptions {
  id: string;
}

export async function runCloseCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createCloseProgram(resolvedContext), argv);
}

function createCloseProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun close")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("--id <id>")
    .requiredOption("--id <id>", "Session id returned by inpagerun open")
    .action(async (options: CloseOptions) => {
      const result = await closeSession(options.id, { tmpdir: context.tmpdir });
      await writeLine(context.stdout, `${result.url} has closed`);
    });
}
