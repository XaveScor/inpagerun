import { Command } from "commander";
import { resolve } from "node:path";
import { writeLine } from "../console-output";
import { openSession } from "../session";
import { type CommandContext, parseCommand, resolveCommandContext } from "./types";

interface OpenOptions {
  debug?: boolean;
  extension: string[];
  headed?: boolean;
}

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
    .usage("[--headed] [--debug] [--extension <path>] <url>")
    .argument("<url>", "Page URL")
    .option("--headed", "Open a visible Chromium window")
    .option("--debug", "Print diagnostic output to stderr")
    .option("--extension <path>", "Load an unpacked Chromium extension", collect, [])
    .action(async (url: string, options: OpenOptions) => {
      const result = await openSession({
        debug(message) {
          if (options.debug) {
            return writeLine(context.stderr, `[DEBUG] ${message}`);
          }
        },
        extensions: options.extension.map((path) => ({
          path: resolve(context.cwd ?? process.cwd(), path),
        })),
        headed: options.headed === true,
        tmpdir: context.tmpdir,
        url,
      });

      await writeLine(context.stdout, result.id);
    });
}

function collect(value: string, values: string[]): string[] {
  values.push(value);
  return values;
}
