import { z } from "zod";

const envSchema = z.object({
  SEARCH_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
});

export const env = envSchema.parse({
  SEARCH_LIMIT: process.env.SEARCH_LIMIT,
});
