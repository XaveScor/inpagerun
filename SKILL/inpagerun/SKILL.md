---
name: inpagerun
description: Use when the user wants to run JavaScript in a real browser page with the inpagerun CLI, inspect DOM state, keep browser page state between snippets, debug page console output, or verify browser-side behavior.
---

# inpagerun

Use `inpagerun` to run JavaScript inside a real Chromium page from the command line.

## When To Use

Use this skill when the task involves:

- Running browser-side JavaScript against a URL
- Inspecting `document`, `window`, DOM elements, cookies, localStorage, or fetch results
- Keeping browser page state between multiple snippets
- Verifying page behavior without writing a full Playwright test
- Debugging console output from a page
- Checking whether a snippet works in a real browser context

Do not use this for Node.js-only scripts. Code runs in the page, not in Node.js.

## Command Shape

One-off run:

```bash
inpagerun once -u <url> -c "<browser JavaScript>"
```

Persistent page workflow:

```bash
id=$(inpagerun open <url>)
inpagerun --id "$id" --code "<browser JavaScript>"
inpagerun close --id "$id"
```

Use `npx` when the CLI is not installed globally:

```bash
npx inpagerun once -u https://example.com -c "console.log(document.title)"
```

Options:

- `once -u, --url <url>`: page URL to open for a one-off run
- `once -c, --code <code>`: JavaScript to run inside the page
- `open --headed`: open a visible Chromium window instead of headless Chromium
- `open --debug`: print diagnostic output to stderr
- `--id <id>`: persistent page id returned by `inpagerun open`
- `--code <code>`: JavaScript to run inside the persistent page
- `--debug`: forwards `console.debug(...)` to stdout with a `[DEBUG]` prefix for code runs

## Output Rules

The CLI only prints browser `console.*` output from the current snippet.

Use `console.log(...)`, `console.info(...)`, `console.warn(...)`, or `console.error(...)` to produce terminal output.

Do not rely on the last expression being printed.

Bad:

```bash
inpagerun once -u https://example.com -c "document.title"
```

Good:

```bash
inpagerun once -u https://example.com -c "console.log(document.title)"
```

## Browser Context Rules

Code runs inside the page, so these are available:

- `document`
- `window`
- `location`
- `fetch`
- DOM APIs
- top-level `await`

Node.js APIs are not available:

- Do not import `fs`
- Do not import `node:path`
- Do not assume access to local files except through supported bundled imports

## Examples

Read a page title:

```bash
inpagerun once -u https://example.com -c "console.log(document.title)"
```

Read an element:

```bash
inpagerun once -u https://example.com -c "console.log(document.querySelector('h1')?.textContent)"
```

Run async browser code:

```bash
inpagerun once -u https://example.com -c "console.log(await fetch('/').then((response) => response.status))"
```

Keep page state between snippets:

```bash
id=$(inpagerun open https://example.com)
inpagerun --id "$id" --code "document.body.dataset.status = 'ready'"
inpagerun --id "$id" --code "console.log(document.body.dataset.status)"
inpagerun close --id "$id"
```

Use debug output:

```bash
inpagerun once --debug -u https://example.com -c "console.debug('loaded'); console.log(document.title)"
```

Import local browser-side code:

```bash
inpagerun once -u https://example.com -c "const data = await import('./data.js'); console.log(data.default)"
```

## Import Constraints

Static imports and string-literal dynamic imports are bundled before execution.

Allowed:

```js
const mod = await import("./module.js");
```

Not allowed:

```js
const name = "./module.js";
const mod = await import(name);
```

Dynamic imports must use a string literal.

## Recommended Workflow

1. Use `once` for isolated probes that do not need saved page state.
2. Use `open`, repeated `--id ... --code ...`, and `close` when page state matters.
3. Start with a small `console.log(...)` probe.
4. Keep snippets browser-compatible.
5. Use top-level `await` for async browser operations.
6. Use `--debug` only when debug-level console output or open diagnostics are needed.
7. Treat stderr output from `console.warn`, `console.error`, or thrown errors as a failed probe unless the user expected it.
8. Always close persistent pages when finished.

## Troubleshooting

If no output appears, confirm the code calls `console.log(...)`.

If `console.debug(...)` output is missing, rerun the code command with `--debug`.

If an import fails with a Node module error, remove Node-only imports and rewrite the snippet for the browser.

If a page id is unknown, open the page again with `inpagerun open <url>`.

If the command fails before running code, ensure Playwright Chromium is installed:

```bash
npx playwright install chromium
```
