import type { Browser, Page } from "playwright";
import { normalizePageUrl } from "./url";

type TargetInfo = {
  targetId: string;
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

async function getPageTargetId(page: Page): Promise<string> {
  const session = await page.context().newCDPSession(page);

  try {
    const result = (await session.send("Target.getTargetInfo")) as { targetInfo: TargetInfo };
    return result.targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
}
