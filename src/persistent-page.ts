import {
  closeDetachedBrowser,
  connectDetachedBrowser,
  createPageId,
  ensureDetachedBrowser,
  requireDetachedBrowser,
} from "./browser-host";
import { closePageTarget, findPageByTargetId, openPageTarget, targetExists } from "./cdp-page";
import { withLock } from "./lock";
import { withPageLock } from "./page-lock";
import { runTarget } from "./run-target";
import type { RunFileConsoleMessage } from "./run-file";
import { writeState } from "./state";

export type OpenPersistentPageOptions = {
  debug?(message: string): Promise<void> | void;
  headed: boolean;
  tmpdir?: string;
  url: string;
};

export type OpenPersistentPageResult = {
  id: string;
};

export type RunPersistentPageOptions = {
  code: string;
  cwd?: string;
  id: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
  tmpdir?: string;
};

export type ClosePersistentPageResult = {
  url: string;
};

export async function openPersistentPage(
  options: OpenPersistentPageOptions,
): Promise<OpenPersistentPageResult> {
  return await withStateLock(options.tmpdir, async () => {
    const state = await ensureDetachedBrowser({
      debug: options.debug,
      headed: options.headed,
      tmpdir: options.tmpdir,
    });
    const browser = await connectDetachedBrowser(state.browser);

    try {
      for (const [id, pageState] of Object.entries(state.pages)) {
        if (!(await targetExists(browser, pageState.targetId))) {
          delete state.pages[id];
        }
      }

      const { targetId } = await openPageTarget(browser, options.url);
      let id = createPageId();

      while (state.pages[id]) {
        id = createPageId();
      }

      state.pages[id] = {
        createdAt: Date.now(),
        targetId,
        url: options.url,
      };
      await writeState(state, options.tmpdir);

      return { id };
    } finally {
      await browser.close().catch(() => {});
    }
  });
}

export async function runCodeInPersistentPage(options: RunPersistentPageOptions): Promise<void> {
  await withPageLock(options.id, options.tmpdir, async () => {
    const state = await requireDetachedBrowser(options.tmpdir);
    const pageState = state.pages[options.id];

    if (!pageState) {
      throw new Error(`Unknown page id: ${options.id}`);
    }

    const browser = await connectDetachedBrowser(state.browser);

    try {
      const page = await findPageByTargetId(browser, pageState.targetId);

      if (!page) {
        throw new Error(`Page is no longer open: ${options.id}`);
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

export async function closePersistentPage(
  id: string,
  options: { tmpdir?: string } = {},
): Promise<ClosePersistentPageResult> {
  return await withPageLock(id, options.tmpdir, async () => {
    return await withStateLock(options.tmpdir, async () => {
      const state = await requireDetachedBrowser(options.tmpdir);
      const pageState = state.pages[id];

      if (!pageState) {
        throw new Error(`Unknown page id: ${id}`);
      }

      const browser = await connectDetachedBrowser(state.browser);

      try {
        if (!(await targetExists(browser, pageState.targetId))) {
          throw new Error(`Page is no longer open: ${id}`);
        }

        await closePageTarget(browser, pageState.targetId);
      } finally {
        await browser.close().catch(() => {});
      }

      delete state.pages[id];

      if (Object.keys(state.pages).length === 0) {
        await closeDetachedBrowser(state, options.tmpdir);
      } else {
        await writeState(state, options.tmpdir);
      }

      return { url: pageState.url };
    });
  });
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
