import { and, eq, gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { estimateMaxCostUsd } from "@/lib/enrichment";
import { enrichmentInternalQuota, enrichmentJobs, enrichmentPreflightRequests } from "@/lib/schema";
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
  processedRows: number;
  cacheHitCount: number;
  phonesFoundCount: number;
  websitesFoundCount: number;
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
    processedRows: row.processedRows,
    cacheHitCount: row.cacheHitCount,
    phonesFoundCount: row.phonesFoundCount,
    websitesFoundCount: row.websitesFoundCount,
    phonesFoundPercentage: row.processedRows > 0
      ? Number.parseFloat(((row.phonesFoundCount / row.processedRows) * 100).toFixed(1))
      : 0,
    websitesFoundPercentage: row.processedRows > 0
      ? Number.parseFloat(((row.websitesFoundCount / row.processedRows) * 100).toFixed(1))
      : 0,
    runtimeSeconds: row.startedAt && row.finishedAt
      ? Math.max(0, Math.floor((row.finishedAt.getTime() - row.startedAt.getTime()) / 1000))
      : null,
    downloadPath: `/api/enrichment/jobs/${row.id}/download`,
    estimatedMaxCostUsd: row.estimatedMaxCostUsd / 100,
    stopReason: row.stopReason,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const preflightRows = await db
    .select({
      id: enrichmentPreflightRequests.id,
      userId: enrichmentPreflightRequests.userId,
      ssicList: enrichmentPreflightRequests.ssicList,
      status: enrichmentPreflightRequests.status,
      candidateCount: enrichmentPreflightRequests.candidateCount,
      projectedPaidCalls: enrichmentPreflightRequests.projectedPaidCalls,
      estimatedPriceUsd: enrichmentPreflightRequests.estimatedPriceUsd,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.id, id))
    .limit(1);

  const preflight = preflightRows[0];
  if (!preflight) {
    return NextResponse.json({ error: "Preflight request not found." }, { status: 404 });
  }

  if (preflight.status === "started") {
    return NextResponse.json({ error: "Preflight request already started." }, { status: 409 });
  }

  await db
    .insert(enrichmentInternalQuota)
    .values({ id: 1, remainingDetailCalls: 0, updatedAt: new Date() })
    .onConflictDoNothing();

  let job: {
    id: string;
    status: string;
    ssicList: string[];
    estimatedCandidateCount: number;
    estimatedCacheHitCount: number;
    estimatedPaidCalls: number;
    reservedPaidCalls: number;
    consumedPaidCalls: number;
    processedRows: number;
    cacheHitCount: number;
    phonesFoundCount: number;
    websitesFoundCount: number;
    estimatedMaxCostUsd: number;
    stopReason: string | null;
    errorMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  };

  try {
    job = await db.transaction(async (tx) => {
      const reserveNeeded = preflight.projectedPaidCalls;

      if (reserveNeeded > 0) {
        const updatedQuota = await tx
          .update(enrichmentInternalQuota)
          .set({
            remainingDetailCalls: sql`${enrichmentInternalQuota.remainingDetailCalls} - ${reserveNeeded}`,
            updatedByUserId: user.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(enrichmentInternalQuota.id, 1),
              gte(enrichmentInternalQuota.remainingDetailCalls, reserveNeeded),
            ),
          )
          .returning({ id: enrichmentInternalQuota.id });

        if (updatedQuota.length === 0) {
          throw new Error("INSUFFICIENT_INTERNAL_QUOTA");
        }
      }

      const jobId = crypto.randomUUID();

      const inserted = await tx
        .insert(enrichmentJobs)
        .values({
          id: jobId,
          userId: preflight.userId,
          preflightRequestId: preflight.id,
          initiatedByAdmin: true,
          ssicList: preflight.ssicList,
          status: "queued",
          estimatedCandidateCount: preflight.candidateCount,
          estimatedCacheHitCount: Math.max(preflight.candidateCount - preflight.projectedPaidCalls, 0),
          estimatedPaidCalls: preflight.projectedPaidCalls,
          reservedPaidCalls: preflight.projectedPaidCalls,
          consumedPaidCalls: 0,
          estimatedMaxCostUsd: Math.round(estimateMaxCostUsd(preflight.projectedPaidCalls) * 100),
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
          processedRows: enrichmentJobs.processedRows,
          cacheHitCount: enrichmentJobs.cacheHitCount,
          phonesFoundCount: enrichmentJobs.phonesFoundCount,
          websitesFoundCount: enrichmentJobs.websitesFoundCount,
          estimatedMaxCostUsd: enrichmentJobs.estimatedMaxCostUsd,
          stopReason: enrichmentJobs.stopReason,
          errorMessage: enrichmentJobs.errorMessage,
          createdAt: enrichmentJobs.createdAt,
          startedAt: enrichmentJobs.startedAt,
          finishedAt: enrichmentJobs.finishedAt,
        });

      await tx
        .update(enrichmentPreflightRequests)
        .set({
          status: "started",
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enrichmentPreflightRequests.id, preflight.id));

      return inserted[0];
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_INTERNAL_QUOTA") {
      return NextResponse.json(
        { error: "Insufficient internal quota for admin bypass start." },
        { status: 402 },
      );
    }

    return NextResponse.json(
      { error: "Unable to start admin bypass job." },
      { status: 500 },
    );
  }

  return NextResponse.json(toResponse(job), { status: 202 });
}
