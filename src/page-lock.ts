import { withLock } from "./lock";

export async function withPageLock<T>(
  id: string,
  tmpdir: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return await withLock(
    `page-${id}`,
    { busyMessage: "Page is already running code.", tmpdir },
    run,
  );
}
