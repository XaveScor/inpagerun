# inpagerun

Run JavaScript inside a real browser page from the command line.

`inpagerun` opens a page in Chromium, runs your JavaScript in that page, and prints the result to stdout.

## Requirements

- Node.js v24 or newer

## Install

```bash
npm install --global inpagerun
```

## Usage

```bash
inpagerun -u <url> -c <code>
```

### Options

- `-u, --url <url>`: page URL to open
- `-c, --code <code>`: JavaScript to run inside the page

## Quick Start

Run without installing first:

```bash
npx inpagerun -u https://example.com -c "document.title"
```

After a global install:

```bash
inpagerun -u https://example.com -c "document.title"
```

## Examples

Read the page title:

```bash
inpagerun -u https://example.com -c "document.title"
```

Read text from the page:

```bash
inpagerun -u https://example.com -c "document.querySelector('h1')?.textContent"
```

Run async code in the page:

```bash
inpagerun -u https://example.com -c "await fetch('/').then((response) => response.status)"
```

Return an object:

```bash
inpagerun -u https://example.com -c "({ title: document.title, url: location.href })"
```

Use statement-style code:

```bash
inpagerun -u https://example.com -c "const h1 = document.querySelector('h1'); return h1?.textContent;"
```

## How It Works

- The page is loaded first.
- Your code runs inside that browser page, not in Node.js.
- You can use DOM APIs like `document`, `window`, and `fetch`.
- Async code works, so `await` is allowed.

## Output

- Strings are printed as plain text.
- Objects and arrays are printed as formatted JSON.
- `undefined` prints nothing.
- If your code throws, the CLI prints the error and exits with a non-zero status.
