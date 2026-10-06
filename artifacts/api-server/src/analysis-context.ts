import { AsyncLocalStorage } from "node:async_hooks";
export type AnalysisContext = { sent: boolean; usage?: number };
export const analysisContext = new AsyncLocalStorage<AnalysisContext>();
