import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { enrichmentJobs, enrichmentPreflightRequests } from "@/lib/schema";
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
  userChargeUsd: number;
  preflightEstimatedPriceUsd?: number | null;
  estimatedMaxCostUsd: number;
  stopReason: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}): EnrichmentJobResponse {
  const normalizedUserChargeUsdCents = row.preflightEstimatedPriceUsd ?? row.userChargeUsd;

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
    userChargeUsd: normalizedUserChargeUsdCents / 100,
    estimatedMaxCostUsd: row.estimatedMaxCostUsd / 100,
    stopReason: row.stopReason,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const { requestId } = await params;
  const db = getDb();

  const jobs = await db
    .select({
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
      userChargeUsd: enrichmentJobs.userChargeUsd,
      preflightEstimatedPriceUsd: enrichmentPreflightRequests.estimatedPriceUsd,
      estimatedMaxCostUsd: enrichmentJobs.estimatedMaxCostUsd,
      stopReason: enrichmentJobs.stopReason,
      errorMessage: enrichmentJobs.errorMessage,
      createdAt: enrichmentJobs.createdAt,
      startedAt: enrichmentJobs.startedAt,
      finishedAt: enrichmentJobs.finishedAt,
    })
    .from(enrichmentJobs)
    .leftJoin(enrichmentPreflightRequests, eq(enrichmentPreflightRequests.id, enrichmentJobs.preflightRequestId))
    .where(eq(enrichmentJobs.preflightRequestId, requestId))
    .limit(1);

  if (jobs.length === 0) {
    return NextResponse.json({ error: "Job not found for this request." }, { status: 404 });
  }

  return NextResponse.json({ job: toResponse(jobs[0]) });
}
