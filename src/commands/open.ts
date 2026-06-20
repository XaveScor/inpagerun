import { Command } from "commander";
import { writeLine } from "../console-output";
import { openPersistentPage } from "../persistent-page";
import { parseCommand, resolveCommandContext, type CommandContext } from "./types";

type OpenOptions = {
  debug?: boolean;
  headed?: boolean;
};

export async function runOpenCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createOpenProgram(resolvedContext), argv);
}

function createOpenProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun open")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("[--headed] [--debug] <url>")
    .argument("<url>", "Page URL")
    .option("--headed", "Open a visible Chromium window")
    .option("--debug", "Print diagnostic output to stderr")
    .action(async (url: string, options: OpenOptions) => {
      const result = await openPersistentPage({
        debug(message) {
          if (options.debug) {
            return writeLine(context.stderr, `[DEBUG] ${message}`);
          }
        },
        headed: options.headed === true,
        tmpdir: context.tmpdir,
        url,
      });

      await writeLine(context.stdout, result.id);
    });
}
