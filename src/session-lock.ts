import { withLock } from "./lock";

export async function withSessionLock<T>(
  id: string,
  tmpdir: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return await withLock(
    `session-${id}`,
    { busyMessage: "Session is already running code.", tmpdir },
    run,
  );
}
