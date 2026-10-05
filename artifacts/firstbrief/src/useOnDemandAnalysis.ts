import { useQuery } from '@tanstack/react-query';

const STORAGE_KEY = 'firstbrief-analysis-v1';
const FAILURE_HOLD_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;
type Saved = { signature: string; at: number; ttl: number; data?: unknown; failed?: boolean };
const memory = new Map<string, Saved>();
const pending = new Set<string>();

function read(signature: string): Saved | undefined {
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[];
    const entry = entries.find(item => item.signature === signature);
    if (entry && Date.now() < entry.at + entry.ttl) memory.set(signature, entry);
  } catch { /* Storage may be unavailable; in-memory reuse still works. */ }
  const entry = memory.get(signature);
  return entry && Date.now() < entry.at + entry.ttl ? entry : undefined;
}

function save(entry: Saved) {
  memory.set(entry.signature, entry);
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[];
    const remaining = entries.filter(item =>
      item.signature !== entry.signature && Date.now() < item.at + item.ttl,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...remaining, entry].slice(-30)));
  } catch { /* A full/disabled store must not prevent reading or generation. */ }
}

export function useOnDemandAnalysis<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  ttl: number,
  validate: (value: unknown) => T,
) {
  // Exact input, not merely a row index or URL: changed text gets a separate result.
  const signature = JSON.stringify([endpoint, payload]);
  const saved = read(signature);
  let initialData: T | undefined;
  try {
    if (saved?.data !== undefined) initialData = validate(saved.data);
  } catch { /* Invalid old results are not shown. */ }
  const query = useQuery<T>({
    queryKey: ['on-demand-analysis', signature],
    enabled: false,
    initialData,
    initialDataUpdatedAt: saved?.at,
    staleTime: ttl,
    gcTime: ttl,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          (async () => {
            const response = await fetch(`/api/${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            if (!response.ok) throw new Error('Analysis unavailable');
            return validate(await response.json());
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error('Analysis timed out'));
            }, REQUEST_TIMEOUT_MS);
          }),
        ]);
        save({ signature, at: Date.now(), ttl, data: result });
        return result;
      } catch (error) {
        save({ signature, at: Date.now(), ttl: FAILURE_HOLD_MS, failed: true });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  });
  const unavailable = Boolean(saved?.failed);
  const request = () => {
    // Synchronous guard also protects two observers / clicks before React rerenders.
    if (query.data || pending.has(signature) || read(signature)?.failed) return;
    pending.add(signature);
    void query.refetch().finally(() => pending.delete(signature));
  };
  return { ...query, unavailable, request };
}
