---
name: testing
description: Use when writing or modifying inpagerun tests, test fixtures under test/cases, Vitest integration tests, command-file CLI behavior tests, persistent page tests, or runCode coverage.
---

# Testing

Use this when writing tests for this repository.

## Required Workflow

1. Before adding or changing a test, inspect the existing cases in `test/cases`.
2. Reuse the existing fixture style:
   - one directory per case
   - `code.ts` as the test snippet
   - `index.html` as the browser page
   - local helper modules beside `code.ts`
   - add the case name to `TestCaseName` in `test/helpers/cases.ts`
3. Do not spawn or execute the CLI binary in tests.
4. Write CLI behavior tests through command-like functions from `src/commands`.
5. Pass argv exactly like command-line arguments, for example `runOnceCommand(["-u", url, "-c", code], context)`, `runOpenCommand([url], context)`, `runPersistentRunCommand(["--id", id, "--code", code], context)`, and `runCloseCommand(["--id", id], context)`.
6. Give each browser-backed CLI test a unique `tmpdir` in `context`.
7. Test API behavior by calling `runCode(...)` directly.

## Test Placement

- Put CLI routing and command output tests in `test/cli.integration.test.ts`.
- Put API/browser execution tests in `test/run-code.integration.test.ts`.
- Put browser fixtures in `test/cases/<case-name>/`.

## Validation

Run focused checks first:

```bash
pnpm exec vitest run --config vitest.config.ts test/cli.integration.test.ts
pnpm exec vitest run --config vitest.config.ts test/run-code.integration.test.ts
pnpm test:types
pnpm test:fmt
```
