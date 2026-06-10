# inpagerun

Run JavaScript inside a real browser page from the command line.

`inpagerun` opens a page in Chromium, runs your JavaScript in that page, and forwards your browser `console.*` output to the terminal.

## Requirements

- Node.js v24 or newer

## Install

```bash
npm install --global inpagerun
```

## Prepare

Before the first run, install Chromium for Playwright:

```bash
npx playwright install chromium
```

## Usage

```bash
inpagerun -u <url> -c <code>
```

## Agents and LLMs

If you are an agent or LLM, use the local skill at `SKILL/inpagerun/SKILL.md` for guidance on running this CLI.

### Options

- `-u, --url <url>`: page URL to open
- `-c, --code <code>`: JavaScript to run inside the page
- `--debug`: forward browser `console.debug(...)` output to stdout with a `[DEBUG]` prefix

## Quick Start

Run without installing first:

```bash
npx inpagerun -u https://example.com -c "console.log(document.title)"
```

After a global install:

```bash
inpagerun -u https://example.com -c "console.log(document.title)"
```

## Examples

Read the page title:

```bash
inpagerun -u https://example.com -c "console.log(document.title)"
```

Read text from the page:

```bash
inpagerun -u https://example.com -c "console.log(document.querySelector('h1')?.textContent)"
```

Run async code in the page:

```bash
inpagerun -u https://example.com -c "console.log(await fetch('/').then((response) => response.status))"
```

Import local code:

```bash
inpagerun -u https://example.com -c "const data = await import('./data.js'); console.log(data.default)"
```

Print an object:

```bash
inpagerun -u https://example.com -c "console.log({ title: document.title, url: location.href })"
```

Use statement-style code:

```bash
inpagerun -u https://example.com -c "const h1 = document.querySelector('h1'); console.log(h1?.textContent);"
```

## How It Works

- The page is loaded first.
- Your code runs inside that browser page, not in Node.js.
- You can use DOM APIs like `document`, `window`, and `fetch`.
- Async code works, so `await` is allowed.
- Static imports and string-literal dynamic imports are bundled before your code runs.
- Dynamic imports must use a string literal, for example `await import("./data.js")`.
- Node.js built-in modules like `fs` and `node:path` are not supported.
- `--code` runs as statements. The CLI does not print the last expression value.
- Top-level `return` is not supported. Use `console.*` to print values.

## Console Forwarding

- `console.log(...)` and `console.info(...)` are forwarded to stdout.
- `console.warn(...)` and `console.error(...)` are forwarded to stderr.
- `console.debug(...)` is ignored unless `--debug` is provided.
- With `--debug`, `console.debug(...)` is forwarded to stdout with a `[DEBUG]` prefix.
- Multiple console arguments are printed space-separated.
- Non-string values are serialized for terminal output.

## Output

- The CLI only prints forwarded `console.*` output from your code.
- If your code throws, the CLI prints the error and exits with a non-zero status.
