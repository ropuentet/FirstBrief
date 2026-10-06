import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
export const analysisResults = pgTable("firstbrief_analysis_results", {
  key: text("key").primaryKey(),
  feature: text("feature").notNull(),
  version: text("version").notNull(),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  owner: text("owner"),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  failureReason: text("failure_reason"),
  retryAfter: timestamp("retry_after", { withTimezone: true }),
}, table => [index("firstbrief_analysis_expiry").on(table.expiresAt)]);
export const insertAnalysisResultSchema = createInsertSchema(analysisResults);
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;
