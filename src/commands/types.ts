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
