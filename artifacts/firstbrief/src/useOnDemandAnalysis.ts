import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ANALYSIS_VERSION, ANALYSIS_TTLS } from '@workspace/api-zod';

const STORAGE_KEY = 'firstbrief-analysis-v1';
const FAILURE_HOLD_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 45_000;
type Saved = { signature: string; at: number; ttl: number; data?: unknown; failed?: boolean; reason?: string; provider?: string; generationVersion?: string };
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
  capacity: "Analysis is busy or Groq's available token budget is temporarily insufficient. Saved results remain available; explicitly try again later. No automatic retry will be made.",
  retrieval: 'Bluesky posts could not be retrieved. This does not mean there is no discussion.',
  storage: 'Shared analysis storage is unavailable. Publisher text remains readable; explicitly try again once storage recovers.',
  rate: "The beta's shared or visitor analysis limit has been reached. Saved results remain available. Please explicitly try again later.",
  partial: 'Some Bluesky retrievals failed. This partial response is not saved as a successful analysis; you can explicitly check again.',
  evidence: 'Too few relevant Bluesky posts were found. Wait briefly before explicitly checking again; this is not an AI failure.',
};
function failedResult(data: unknown): boolean {
  const status = (data as { status?: string } | undefined)?.status;
  return status === 'analysis_unavailable' || status === 'retrieval_failed' || (data as { retrievalPartial?: boolean } | undefined)?.retrievalPartial === true;
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
  const snapshotExpiry = (entry?.data as { source?: string; observedAt?: string } | undefined)?.source === 'Bluesky'
    ? Date.parse((entry!.data as { observedAt: string }).observedAt) + ANALYSIS_TTLS.sentiment : Infinity;
  // Known pre-migration Groq results used these same unchanged instructions.
  const version = entry?.generationVersion ?? (entry?.provider === 'groq' ? 'groq:gpt-oss-20b:v1' : undefined);
  return entry && version === ANALYSIS_VERSION && Date.now() < Math.min(entry.at + entry.ttl, snapshotExpiry) ? entry : undefined;
}

function save(entry: Saved) {
  entry.provider = 'groq';
  entry.generationVersion = ANALYSIS_VERSION;
  for (const [key, value] of memory) if (Date.now() >= value.at + value.ttl) memory.delete(key);
  while (memory.size >= 30 && !memory.has(entry.signature)) memory.delete(memory.keys().next().value!);
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
  const [, updateClock] = useState(0);
  const ephemeral = useRef<{ signature: string; until: number } | undefined>(undefined);
  const saved = read(signature);
  let initialData: T | undefined;
  try {
    if (saved?.data !== undefined) initialData = validate(saved.data);
  } catch { /* Invalid old results are not shown. */ }
  const query = useQuery<T>({
    queryKey: ['on-demand-analysis', ANALYSIS_VERSION, signature],
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
      let effectiveTtl = ttl;
      let cacheable = true;
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
              if (raw?.generationVersion && raw.generationVersion !== ANALYSIS_VERSION) throw new AnalysisFailure('response');
              cacheable = raw?.cacheable !== false;
              if (raw?.cacheExpiresAt) effectiveTtl = Math.max(0, Math.min(ttl, Date.parse(raw.cacheExpiresAt) - Date.now()));
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
            save({ signature, at: Date.now(), ttl: FAILURE_HOLD_MS, failed: true, reason: (result as { retrievalPartial?: boolean; reason?: string }).retrievalPartial ? 'partial' : (result as { reason?: string }).reason ?? 'provider', data: result });
          } else if (cacheable && effectiveTtl > 0) save({ signature, at: Date.now(), ttl: effectiveTtl, data: result });
          else ephemeral.current = { signature, until: Date.now() + FAILURE_HOLD_MS };
        return result;
      } catch (error) {
         save({ signature, at: Date.now(), ttl: FAILURE_HOLD_MS, failed: true, reason: error instanceof AnalysisFailure ? error.reason : 'provider' });
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  });
   const data = saved || (ephemeral.current?.signature === signature && Date.now() < ephemeral.current.until) ? query.data : undefined;
   const until = saved ? Math.min(saved.at + saved.ttl, (saved.data as { source?: string; observedAt?: string } | undefined)?.source === 'Bluesky' ? Date.parse((saved.data as { observedAt: string }).observedAt) + ANALYSIS_TTLS.sentiment : Infinity) : ephemeral.current?.until;
   useEffect(() => {
     if (!until || until <= Date.now()) return;
     const timer = setTimeout(() => updateClock(value => value + 1), until - Date.now() + 1);
     return () => clearTimeout(timer);
   }, [until, signature]);
   const unavailable = Boolean(saved?.failed) || failedResult(data) || query.isError;
   const reason = saved?.reason ?? (query.error as AnalysisFailure | undefined)?.reason ?? (data as { reason?: string } | undefined)?.reason ?? 'provider';
   const request = (force = false) => {
    // Synchronous guard also protects two observers / clicks before React rerenders.
     if ((data && !unavailable && !force) || pending.has(signature)) return;
     if (force || unavailable || read(signature)?.failed) {
       explicitRetries.add(signature);
       remove(signature);
     }
    pending.add(signature);
     void query.refetch().finally(() => { pending.delete(signature); explicitRetries.delete(signature); });
  };
   return { ...query, data, unavailable, reason, failureMessage: messages[reason] ?? messages.provider, request };
}
