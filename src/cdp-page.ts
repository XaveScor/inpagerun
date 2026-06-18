import type { Browser, Page } from "playwright";
import { normalizePageUrl } from "./url";

type TargetInfo = {
  targetId: string;
  type: string;
};

export async function openPageTarget(
  browser: Browser,
  url: string,
): Promise<{ targetId: string; page: Page }> {
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  await page.goto(normalizePageUrl(url), { waitUntil: "load" });

  return {
    page,
    targetId: await getPageTargetId(page),
  };
}

export async function findPageByTargetId(
  browser: Browser,
  targetId: string,
): Promise<Page | undefined> {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if ((await getPageTargetId(page).catch(() => undefined)) === targetId) {
        return page;
      }
    }
  }

  return undefined;
}

export async function targetExists(browser: Browser, targetId: string): Promise<boolean> {
  const session = await browser.newBrowserCDPSession();

  try {
    const result = (await session.send("Target.getTargets")) as { targetInfos: TargetInfo[] };
    return result.targetInfos.some(
      (target) => target.targetId === targetId && target.type === "page",
    );
  } finally {
    await session.detach().catch(() => {});
  }
}

export async function closePageTarget(browser: Browser, targetId: string): Promise<void> {
  const session = await browser.newBrowserCDPSession();

  try {
    const result = (await session.send("Target.closeTarget", { targetId })) as {
      success?: boolean;
    };

    if (result.success === false) {
      throw new Error("Page is no longer open.");
    }
  } finally {
    await session.detach().catch(() => {});
  }
}

async function getPageTargetId(page: Page): Promise<string> {
  const session = await page.context().newCDPSession(page);

  try {
    const result = (await session.send("Target.getTargetInfo")) as { targetInfo: TargetInfo };
    return result.targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
}
