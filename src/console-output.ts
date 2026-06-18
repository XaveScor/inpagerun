import type { Writable } from "node:stream";
import type { RunFileConsoleMessage } from "./run-file";

export async function writeConsoleMessage(
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

export function writeLine(stream: Writable, text: string): Promise<void> {
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
