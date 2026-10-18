import { useCallback, useState } from "react";
import type { Paginated } from "../types";

const PAGE_SIZE = 50;

/**
 * Client-side state of an offset-paginated admin listing: the rows loaded
 * so far, the server-side total, "load more" and local edits applied after
 * a successful mutation (so the list doesn't have to be refetched).
 */
export function usePaginatedList<T extends { id: string }>(
  fetchPage: (limit: number, offset: number) => Promise<Paginated<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(
    async (offset: number) => {
      const page = await fetchPage(PAGE_SIZE, offset);
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      setTotal(page.total);
    },
    [fetchPage],
  );

  return {
    items,
    hasMore: items.length < total,
    reload: useCallback(() => load(0), [load]),
    loadMore: () => load(items.length),
    prepend: (item: T) => {
      setItems((prev) => [item, ...prev]);
      setTotal((n) => n + 1);
    },
    replace: (item: T) => setItems((prev) => prev.map((x) => (x.id === item.id ? item : x))),
    remove: (id: string) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      setTotal((n) => n - 1);
    },
  };
}
