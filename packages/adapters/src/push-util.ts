/** What the phone push senders share (FCM and APNs): not part of the package's API. */

/** Base64url without padding. */
export const base64url = (input: string | Uint8Array) => Buffer.from(input).toString("base64url");

/** Runs `fn` over `items` with at most `limit` at once; results in order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}
