import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  buildPreflightEstimate,
  getLatestRedeemedCodeWithQuota,
  ssicListSchema,
} from "@/lib/enrichment";
import { enrichmentJobs, paymentCodes } from "@/lib/schema";
import type { EnrichmentJobResponse } from "@/lib/types";

export const runtime = "nodejs";

function toResponse(row: {
  id: string;
  status: string;
  ssicList: string[];
  estimatedCandidateCount: number;
  estimatedCacheHitCount: number;
  estimatedPaidCalls: number;
  reservedPaidCalls: number;
  consumedPaidCalls: number;
  estimatedMaxCostUsd: number;
  stopReason: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): EnrichmentJobResponse {
  return {
    jobId: row.id,
    status: row.status as EnrichmentJobResponse["status"],
    ssicCodes: row.ssicList,
    estimatedCandidateCount: row.estimatedCandidateCount,
    estimatedCacheHitCount: row.estimatedCacheHitCount,
    estimatedPaidCalls: row.estimatedPaidCalls,
    reservedPaidCalls: row.reservedPaidCalls,
    consumedPaidCalls: row.consumedPaidCalls,
    estimatedMaxCostUsd: row.estimatedMaxCostUsd / 100,
    stopReason: row.stopReason,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ssicListSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected ssicCodes as an array of 5-digit strings." },
      { status: 400 },
    );
  }

  const db = getDb();
  const estimate = await buildPreflightEstimate(db, parsed.data.ssicCodes);

  const redeemedCode = await getLatestRedeemedCodeWithQuota(db, user.id);
  if (!redeemedCode && estimate.projectedPaidCalls > 0) {
    return NextResponse.json(
      { error: "No redeemed payment code with available quota found." },
      { status: 402 },
    );
  }

  if (redeemedCode && redeemedCode.remainingDetailCalls < estimate.projectedPaidCalls) {
    return NextResponse.json(
      {
        error: "Insufficient remaining quota for this enrichment run.",
        requiredPaidCalls: estimate.projectedPaidCalls,
        remainingPaidCalls: redeemedCode.remainingDetailCalls,
      },
      { status: 402 },
    );
  }

  const jobId = crypto.randomUUID();
  const reservedPaidCalls = estimate.projectedPaidCalls;
  const estimatedMaxCostUsdCents = Math.round(estimate.projectedMaxCostUsd * 100);

  const job = await db.transaction(async (tx) => {
    if (redeemedCode && reservedPaidCalls > 0) {
      const updated = await tx
        .update(paymentCodes)
        .set({
          remainingDetailCalls: sql`${paymentCodes.remainingDetailCalls} - ${reservedPaidCalls}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentCodes.id, redeemedCode.paymentCodeId),
            gte(paymentCodes.remainingDetailCalls, reservedPaidCalls),
          ),
        )
        .returning({ id: paymentCodes.id });

      if (updated.length === 0) {
        throw new Error("Failed to reserve quota. Please retry.");
      }
    }

    const inserted = await tx
      .insert(enrichmentJobs)
      .values({
        id: jobId,
        userId: user.id,
        paymentCodeId: redeemedCode?.paymentCodeId ?? null,
        ssicList: parsed.data.ssicCodes,
        status: "queued",
        estimatedCandidateCount: estimate.candidateCount,
        estimatedCacheHitCount: estimate.cacheHitCount,
        estimatedPaidCalls: estimate.projectedPaidCalls,
        reservedPaidCalls,
        consumedPaidCalls: 0,
        estimatedMaxCostUsd: estimatedMaxCostUsdCents,
      })
      .returning({
        id: enrichmentJobs.id,
        status: enrichmentJobs.status,
        ssicList: enrichmentJobs.ssicList,
        estimatedCandidateCount: enrichmentJobs.estimatedCandidateCount,
        estimatedCacheHitCount: enrichmentJobs.estimatedCacheHitCount,
        estimatedPaidCalls: enrichmentJobs.estimatedPaidCalls,
        reservedPaidCalls: enrichmentJobs.reservedPaidCalls,
        consumedPaidCalls: enrichmentJobs.consumedPaidCalls,
        estimatedMaxCostUsd: enrichmentJobs.estimatedMaxCostUsd,
        stopReason: enrichmentJobs.stopReason,
        errorMessage: enrichmentJobs.errorMessage,
        createdAt: enrichmentJobs.createdAt,
        startedAt: enrichmentJobs.startedAt,
        finishedAt: enrichmentJobs.finishedAt,
      });

    return inserted[0];
  });

  return NextResponse.json(toResponse(job), { status: 202 });
}
