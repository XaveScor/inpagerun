import { Command } from "commander";
import { writeLine } from "../console-output";
import { closeAllSessions } from "../session";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

export async function runCloseAllCommand(argv: string[], context?: CommandContext): Promise<void> {
  const resolvedContext = resolveCommandContext(context);

  await parseCommand(createCloseAllProgram(resolvedContext), argv);
}

function createCloseAllProgram(context: ReturnType<typeof resolveCommandContext>): Command {
  return new Command()
    .name("inpagerun closeall")
    .configureOutput({
      writeErr(text) {
        context.stderr.write(text);
      },
      writeOut(text) {
        context.stdout.write(text);
      },
    })
    .usage("")
    .action(async () => {
      const result = await closeAllSessions({ tmpdir: context.tmpdir });

      if (result.sessions.length === 0) {
        await writeLine(context.stdout, "no sessions to close");
        return;
      }

      for (const session of result.sessions) {
        await writeLine(context.stdout, `${session.url} has closed`);
      }
    });
}
