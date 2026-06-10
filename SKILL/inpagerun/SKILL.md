---
name: inpagerun
description: Use when the user wants to run JavaScript in a real browser page with the inpagerun CLI, inspect DOM state, test snippets against a URL, debug page console output, or verify browser-side behavior.
---

# inpagerun

Use `inpagerun` to run JavaScript inside a real Chromium page from the command line.

## When To Use

Use this skill when the task involves:

- Running browser-side JavaScript against a URL
- Inspecting `document`, `window`, DOM elements, cookies, localStorage, or fetch results
- Verifying page behavior without writing a full Playwright test
- Debugging console output from a page
- Checking whether a snippet works in a real browser context

Do not use this for Node.js-only scripts. Code runs in the page, not in Node.js.

## Command Shape

```bash
inpagerun -u <url> -c "<browser JavaScript>"
```

Use `npx` when the CLI is not installed globally:

```bash
npx inpagerun -u https://example.com -c "console.log(document.title)"
```

Options:

- `-u, --url <url>`: page URL to open
- `-c, --code <code>`: JavaScript to run inside the page
- `--debug`: forwards `console.debug(...)` to stdout with a `[DEBUG]` prefix

## Output Rules

The CLI only prints browser `console.*` output.

Use `console.log(...)`, `console.info(...)`, `console.warn(...)`, or `console.error(...)` to produce terminal output.

Do not rely on the last expression being printed.

Bad:

```bash
inpagerun -u https://example.com -c "document.title"
```

Good:

```bash
inpagerun -u https://example.com -c "console.log(document.title)"
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
inpagerun -u https://example.com -c "console.log(document.title)"
```

Read an element:

```bash
inpagerun -u https://example.com -c "console.log(document.querySelector('h1')?.textContent)"
```

Run async browser code:

```bash
inpagerun -u https://example.com -c "console.log(await fetch('/').then((response) => response.status))"
```

Print structured data:

```bash
inpagerun -u https://example.com -c "console.log({ title: document.title, url: location.href })"
```

Use debug output:

```bash
inpagerun --debug -u https://example.com -c "console.debug('loaded'); console.log(document.title)"
```

Import local browser-side code:

```bash
inpagerun -u https://example.com -c "const data = await import('./data.js'); console.log(data.default)"
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

1. Start with a small `console.log(...)` probe.
2. Keep snippets browser-compatible.
3. Use top-level `await` for async browser operations.
4. Use `--debug` only when debug-level console output is needed.
5. Treat stderr output from `console.warn`, `console.error`, or thrown errors as a failed probe unless the user expected it.

## Troubleshooting

If no output appears, confirm the code calls `console.log(...)`.

If `console.debug(...)` output is missing, rerun with `--debug`.

If an import fails with a Node module error, remove Node-only imports and rewrite the snippet for the browser.

If the command fails before running code, ensure Playwright Chromium is installed:

```bash
npx playwright install chromium
```
