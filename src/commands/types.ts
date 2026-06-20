import type { Command } from "commander";
import type { Writable } from "node:stream";

export type CommandContext = {
  cwd?: string;
  stdout?: Writable;
  stderr?: Writable;
  tmpdir?: string;
};

export type ResolvedCommandContext = {
  cwd?: string;
  stdout: Writable;
  stderr: Writable;
  tmpdir?: string;
};

export function resolveCommandContext(context: CommandContext = {}): ResolvedCommandContext {
  return {
    cwd: context.cwd,
    stderr: context.stderr ?? process.stderr,
    stdout: context.stdout ?? process.stdout,
    tmpdir: context.tmpdir,
  };
}

export async function parseCommand(program: Command, argv: string[]): Promise<void> {
  try {
    await program.exitOverride().parseAsync(argv, { from: "user" });
  } catch (error) {
    if (isCommanderHelpDisplayed(error)) {
      return;
    }

    throw error;
  }
}

function isCommanderHelpDisplayed(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "commander.helpDisplayed"
  );
}
