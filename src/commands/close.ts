import { Command } from "commander";
import { writeLine } from "../console-output";
import { closePersistentPage } from "../persistent-page";
import { resolveCommandContext, type CommandContext } from "./types";

type CloseOptions = {
  id: string;
};

export async function runCloseCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await createCloseProgram(resolvedContext).exitOverride().parseAsync(argv, { from: "user" });
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
    .requiredOption("--id <id>", "Page id returned by inpagerun open")
    .action(async (options: CloseOptions) => {
      const result = await closePersistentPage(options.id, { tmpdir: context.tmpdir });
      await writeLine(context.stdout, `${result.url} has closed`);
    });
}
