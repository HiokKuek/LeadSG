import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const cwd = process.cwd();
const envLocalPath = path.join(cwd, ".env.local");
const envPath = path.join(cwd, ".env");

if (existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run drizzle-kit.");
}

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
