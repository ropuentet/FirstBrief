// Bump when generation instructions/model/source handling change. Shared by
// browser and server so older local or database results cannot appear current.
export const ANALYSIS_VERSION = "groq:gpt-oss-20b:v1";
export const ANALYSIS_TTLS = {
  "why-it-matters": 24 * 60 * 60 * 1000,
  "article-outline": 24 * 60 * 60 * 1000,
  sentiment: 45 * 60 * 1000,
} as const;
export type AnalysisFeature = keyof typeof ANALYSIS_TTLS;
