import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";

import type * as schema from "@/lib/schema";
import {
  activeEntities,
  companyContactEnrichment,
  paymentCodeRedemptions,
  paymentCodes,
} from "@/lib/schema";

export const DETAILS_SKU_PRICE_PER_1000_USD = Number.parseFloat(
  process.env.GOOGLE_PLACES_DETAILS_PRICE_PER_1000_USD ?? "20",
);

export const DEFAULT_CACHE_TTL_DAYS = Number.parseInt(
  process.env.ENRICHMENT_CACHE_TTL_DAYS ?? "7",
  10,
);

export const ssicListSchema = z.object({
  ssicCodes: z
    .array(z.string().trim().regex(/^\d{5}$/))
    .min(1)
    .max(50)
    .transform((codes) => Array.from(new Set(codes))),
});

export const redeemCodeSchema = z.object({
  code: z.string().trim().min(6).max(64),
});

export function toUsd(amount: number): number {
  return Number.parseFloat(amount.toFixed(4));
}

export function estimateMaxCostUsd(projectedPaidCalls: number): number {
  const perCall = DETAILS_SKU_PRICE_PER_1000_USD / 1000;
  return toUsd(projectedPaidCalls * perCall);
}

type Db = PostgresJsDatabase<typeof schema>;

export type PreflightEstimate = {
  candidateCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  projectedPaidCalls: number;
  projectedMaxCostUsd: number;
};

export async function buildPreflightEstimate(
  db: Db,
  ssicCodes: string[],
): Promise<PreflightEstimate> {
  const now = new Date();

  const candidateRows = await db
    .select({ count: sql<number>`count(distinct ${activeEntities.uen})::int` })
    .from(activeEntities)
    .where(inArray(activeEntities.primarySsicCode, ssicCodes));

  const cacheHitRows = await db
    .select({ count: sql<number>`count(distinct ${activeEntities.uen})::int` })
    .from(activeEntities)
    .innerJoin(
      companyContactEnrichment,
      eq(companyContactEnrichment.uen, activeEntities.uen),
    )
    .where(
      and(
        inArray(activeEntities.primarySsicCode, ssicCodes),
        eq(companyContactEnrichment.status, "ok"),
        gt(companyContactEnrichment.expiresAt, now),
      ),
    );

  const candidateCount = candidateRows[0]?.count ?? 0;
  const cacheHitCount = cacheHitRows[0]?.count ?? 0;
  const cacheMissCount = Math.max(candidateCount - cacheHitCount, 0);
  const projectedPaidCalls = cacheMissCount;

  return {
    candidateCount,
    cacheHitCount,
    cacheMissCount,
    projectedPaidCalls,
    projectedMaxCostUsd: estimateMaxCostUsd(projectedPaidCalls),
  };
}

export async function getLatestRedeemedCodeWithQuota(db: Db, userId: number) {
  const now = new Date();

  const rows = await db
    .select({
      redemptionId: paymentCodeRedemptions.id,
      paymentCodeId: paymentCodes.id,
      code: paymentCodes.code,
      totalDetailCalls: paymentCodes.totalDetailCalls,
      remainingDetailCalls: paymentCodes.remainingDetailCalls,
      expiresAt: paymentCodes.expiresAt,
      isActive: paymentCodes.isActive,
      redeemedAt: paymentCodeRedemptions.redeemedAt,
    })
    .from(paymentCodeRedemptions)
    .innerJoin(paymentCodes, eq(paymentCodes.id, paymentCodeRedemptions.paymentCodeId))
    .where(eq(paymentCodeRedemptions.userId, userId))
    .orderBy(desc(paymentCodeRedemptions.redeemedAt))
    .limit(10);

  return rows.find((row) => {
    const notExpired = !row.expiresAt || row.expiresAt > now;
    return row.isActive && notExpired && row.remainingDetailCalls > 0;
  }) ?? null;
}
