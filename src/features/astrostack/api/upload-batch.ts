/**
 * Runs independent transfers in bounded parallelism. Qualification polling
 * must run separately so a slow science worker cannot block the next upload.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  process: (item: T) => Promise<void>,
): Promise<void> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("La concurrence d’upload doit être positive.");
  }

  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(items.length, limit) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await process(items[index]!);
    }
  });
  await Promise.all(workers);
}
