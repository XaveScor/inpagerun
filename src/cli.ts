import { Command } from "commander";
import { runCode } from "./run-code";

type CliOptions = {
  url: string;
  code: string;
};

const program = new Command()
  .name("inpagerun")
  .usage("-u <url> -c <code>")
  .requiredOption("-u, --url <url>", "Page URL")
  .requiredOption("-c, --code <code>", "JavaScript code to run in the page")
  .action(async (options: CliOptions) => {
    const result = await runCode(options);
    const output = formatResult(result);

    if (output !== undefined) {
      console.log(output);
    }
  });

void main();

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

function formatResult(result: unknown): string | undefined {
  if (result === undefined) {
    return undefined;
  }

  if (typeof result === "string") {
    return result;
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return String(error);
}
