import { useQuery } from '@tanstack/react-query';

const STORAGE_KEY = 'firstbrief-analysis-v1';
const FAILURE_HOLD_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;
type Saved = { signature: string; at: number; ttl: number; data?: unknown; failed?: boolean; reason?: string; provider?: string };
const memory = new Map<string, Saved>();
const pending = new Set<string>();
const explicitRetries = new Set<string>();
const messages: Record<string, string> = {
  quota: 'Groq reported a quota or rate limit. No automatic retry will be made.',
  auth: 'Groq credentials or configuration need attention.',
  timeout: 'Groq analysis took too long. You can explicitly try again.',
  input: 'There is not enough publisher-provided text to analyse.',
  provider: 'Groq is unavailable right now.',
  response: 'The Groq response could not be used.',
  capacity: "Groq's token budget or request queue is temporarily full. Try again after capacity recovers; no automatic request will be made.",
  retrieval: 'Bluesky posts could not be retrieved. This does not mean there is no discussion.',
};
function failedResult(data: unknown): boolean {
  const status = (data as { status?: string } | undefined)?.status;
  return status === 'analysis_unavailable' || status === 'retrieval_failed';
}
function remove(signature: string) {
  memory.delete(signature);
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.filter(item => item.signature !== signature)));
  } catch { /* Memory-only explicit retry still works. */ }
}
class AnalysisFailure extends Error {
  constructor(public reason: string) { super(messages[reason] ?? messages.provider); }
}

function read(signature: string): Saved | undefined {
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saved[];
    const entry = entries.find(item => item.signature === signature);
    if (entry && Date.now() < entry.at + entry.ttl) memory.set(signature, entry);
  } catch { /* Storage may be unavailable; in-memory reuse still works. */ }
  const entry = memory.get(signature);
  // Preserve genuine prior successes, but not the previous provider's failures.
  return entry && Date.now() < entry.at + entry.ttl && (!entry.failed || entry.provider === 'groq') ? entry : undefined;
}

function save(entry: Saved) {
  entry.provider = 'groq';
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
    queryKey: ['on-demand-analysis', 'groq:gpt-oss-20b', signature],
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
               body: JSON.stringify({ ...payload, retry: explicitRetries.has(signature) }),
              signal: controller.signal,
            });
             const raw = await response.json().catch(() => undefined);
             if (!response.ok) throw new AnalysisFailure(raw?.reason ?? (response.status === 422 ? 'input' : response.status === 401 || response.status === 403 ? 'auth' : 'provider'));
             try { return validate(raw); } catch { throw new AnalysisFailure('response'); }
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
               reject(new AnalysisFailure('timeout'));
            }, REQUEST_TIMEOUT_MS);
          }),
        ]);
         if (failedResult(result)) {
           save({ signature, at: Date.now(), ttl: FAILURE_HOLD_MS, failed: true, reason: (result as { reason?: string }).reason ?? 'provider', data: result });
         } else save({ signature, at: Date.now(), ttl, data: result });
        return result;
      } catch (error) {
         save({ signature, at: Date.now(), ttl: FAILURE_HOLD_MS, failed: true, reason: error instanceof AnalysisFailure ? error.reason : 'provider' });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  });
   const unavailable = Boolean(saved?.failed) || failedResult(query.data);
   const reason = saved?.reason ?? (query.data as { reason?: string } | undefined)?.reason ?? 'provider';
   const request = (force = false) => {
    // Synchronous guard also protects two observers / clicks before React rerenders.
     if ((query.data && !unavailable && !force) || pending.has(signature)) return;
     if (force || unavailable || read(signature)?.failed) {
       explicitRetries.add(signature);
       remove(signature);
     }
    pending.add(signature);
     void query.refetch().finally(() => { pending.delete(signature); explicitRetries.delete(signature); });
  };
   return { ...query, unavailable, reason, failureMessage: messages[reason] ?? messages.provider, request };
}
