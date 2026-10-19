/** Advance by the returned size: PostgREST maxRows may be smaller than our page size. */
export async function loadAllPages<T extends { id: string }>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    count: number | null;
    error: unknown;
  }>,
  signal: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  while (true) {
    signal.throwIfAborted();
    const { data, count, error } = await fetchPage(rows.length, rows.length + 249);
    signal.throwIfAborted();
    if (error) throw error;
    if (count === null || (expected !== null && count !== expected))
      throw new Error("История изменилась или её полнота не подтверждена. Повторите загрузку.");
    expected = count;
    if (expected > 100_000)
      throw new Error(
        "История превышает доступный объём загрузки. Расчёты недоступны без полной выборки.",
      );
    for (const row of data ?? []) {
      if (ids.has(row.id))
        throw new Error("История изменилась во время загрузки. Повторите загрузку.");
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (!data?.length || rows.length > expected || rows.length > 100_000)
      throw new Error("История загружена не полностью. Расчёты недоступны; повторите загрузку.");
  }
}
