// One byte of audio is not a stable connection. Brief decodes must retain the
// backoff, or a broken broadcaster is retried every five seconds forever.
const STABLE_MS = 4000;
export function nextRadioReconnect(failures: number, playedMs = 0) {
  const previous = playedMs >= STABLE_MS ? 0 : failures;
  return { delay: Math.min(30_000, 5000 * 2 ** Math.min(previous, 3)), failures: Math.min(previous + 1, 3) };
}
