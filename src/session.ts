import { resolve } from "node:path";
import {
  closeDetachedBrowser,
  connectDetachedBrowser,
  createSessionId,
  startDetachedBrowser,
} from "./browser-host";
import { findPageByTargetId, openPageTarget } from "./cdp-page";
import { withLock } from "./lock";
import { withSessionLock } from "./session-lock";
import { runTarget } from "./run-target";
import type { RunFileConsoleMessage } from "./run-file";
import { type ExtensionState, readState, removeState, writeState } from "./state";

export interface ExtensionOptions {
  path: string;
}

export interface OpenSessionOptions {
  debug?(message: string): Promise<void> | void;
  extensions?: ExtensionOptions[];
  headed: boolean;
  tmpdir?: string;
  url: string;
}

export interface OpenSessionResult {
  id: string;
}

export interface RunSessionOptions {
  code: string;
  cwd?: string;
  id: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
  tmpdir?: string;
}

export interface CloseSessionResult {
  url: string;
}

export interface CloseAllSessionsResult {
  sessions: Array<{
    id: string;
    url: string;
  }>;
}

export async function openSession(options: OpenSessionOptions): Promise<OpenSessionResult> {
  return await withStateLock(options.tmpdir, async () => {
    const state = (await readState(options.tmpdir)) ?? { sessions: {} };
    const extensions = normalizeExtensions(options.extensions ?? []);
    const browserState = await startDetachedBrowser({
      debug: options.debug,
      extensions,
      headed: options.headed,
      tmpdir: options.tmpdir,
    });
    const browser = await connectDetachedBrowser(browserState);
    let shouldCloseBrowser = true;

    try {
      const { targetId } = await openPageTarget(browser, options.url);
      let id = createSessionId();

      while (state.sessions[id]) {
        id = createSessionId();
      }

      state.sessions[id] = {
        browser: browserState,
        createdAt: Date.now(),
        extensions,
        pageTargetId: targetId,
        url: options.url,
      };
      await writeState(state, options.tmpdir);
      shouldCloseBrowser = false;

      return { id };
    } finally {
      await browser.close().catch(() => {});

      if (shouldCloseBrowser) {
        await closeDetachedBrowser(browserState);
      }
    }
  });
}

export async function runCodeInSession(options: RunSessionOptions): Promise<void> {
  await withSessionLock(options.id, options.tmpdir, async () => {
    const state = await readState(options.tmpdir);
    const sessionState = state?.sessions[options.id];

    if (!sessionState) {
      throw new Error(`Unknown session id: ${options.id}`);
    }

    const browser = await connectDetachedBrowser(sessionState.browser);

    try {
      const page = await findPageByTargetId(browser, sessionState.pageTargetId);

      if (!page) {
        throw new Error(`Session page is no longer open: ${options.id}`);
      }

      await runTarget({
        code: options.code,
        cwd: options.cwd,
        onConsole: options.onConsole,
        page,
      });
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export async function closeSession(
  id: string,
  options: { tmpdir?: string } = {},
): Promise<CloseSessionResult> {
  return await withSessionLock(
    id,
    options.tmpdir,
    async () =>
      await withStateLock(options.tmpdir, async () => {
        const state = await readState(options.tmpdir);
        const sessionState = state?.sessions[id];

        if (!state || !sessionState) {
          throw new Error(`Unknown session id: ${id}`);
        }

        await closeDetachedBrowser(sessionState.browser);
        delete state.sessions[id];

        if (Object.keys(state.sessions).length === 0) {
          await removeState(options.tmpdir);
        } else {
          await writeState(state, options.tmpdir);
        }

        return { url: sessionState.url };
      }),
  );
}

export async function closeAllSessions(
  options: { tmpdir?: string } = {},
): Promise<CloseAllSessionsResult> {
  const sessions = await withStateLock(options.tmpdir, async () => {
    const state = await readState(options.tmpdir);

    return Object.entries(state?.sessions ?? {})
      .map(([id, session]) => ({ createdAt: session.createdAt, id }))
      .toSorted(
        (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
      );
  });
  const closedSessions: CloseAllSessionsResult["sessions"] = [];

  for (const session of sessions) {
    const result = await closeSession(session.id, { tmpdir: options.tmpdir });
    closedSessions.push({ id: session.id, url: result.url });
  }

  return { sessions: closedSessions };
}

function normalizeExtensions(extensions: ExtensionOptions[]): ExtensionState[] {
  return extensions.map((extension) => ({ path: resolve(extension.path) }));
}

function withStateLock<T>(tmpdir: string | undefined, run: () => Promise<T>): Promise<T> {
  return withLock(
    "state",
    {
      busyMessage: "Another inpagerun state operation is already running.",
      tmpdir,
      wait: true,
    },
    run,
  );
}
