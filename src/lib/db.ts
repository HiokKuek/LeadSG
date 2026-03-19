import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/lib/schema";

declare global {
  var __db: PostgresJsDatabase<typeof schema> | undefined;
}

export function getDb() {
  if (globalThis.__db) {
    return globalThis.__db;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to query Postgres.");
  }

  const client = postgres(databaseUrl, {
    max: 5,
    prepare: false,
  });

  const db = drizzle(client, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__db = db;
  }

  return db;
}
