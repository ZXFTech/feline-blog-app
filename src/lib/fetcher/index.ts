type FetchOptions = RequestInit & {
  revalidate?: number;
};

export async function fetcher<T>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const { revalidate, ...init } = options;

  const res = await fetch(url, {
    ...init,
    next: typeof revalidate === "number" ? { revalidate } : undefined,
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}
