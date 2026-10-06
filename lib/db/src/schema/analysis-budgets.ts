import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
export const analysisBudgets = pgTable("firstbrief_analysis_budgets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  tokens: integer("tokens").notNull().default(0),
  metadata: jsonb("metadata"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const insertAnalysisBudgetSchema = createInsertSchema(analysisBudgets);
export type InsertAnalysisBudget = z.infer<typeof insertAnalysisBudgetSchema>;
export type AnalysisBudget = typeof analysisBudgets.$inferSelect;
