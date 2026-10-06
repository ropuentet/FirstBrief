// A separate process proves this test result does not come from module memory.
import { pool } from "@workspace/db";
import { readResult } from "../src/analysis-store";
import type { AnalysisFeature } from "@workspace/api-zod";
const [schema, feature, key] = process.argv.slice(2);
if (!/^fb_test_[a-f0-9]+$/.test(schema)) throw new Error("Invalid test schema");
await pool.query(`SET search_path TO ${schema}`);
process.stdout.write(JSON.stringify(await readResult(feature as AnalysisFeature, key)));
await pool.end();
