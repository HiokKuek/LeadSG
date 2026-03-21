import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { enrichmentJobs, enrichmentPreflightRequests } from "@/lib/schema";
import type { EnrichmentJobResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();

  const rows = await db
    .select({
      id: enrichmentJobs.id,
      userId: enrichmentJobs.userId,
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
    .where(eq(enrichmentJobs.id, id))
    .limit(1);

  const job = rows[0];
  if (!job) {
    return NextResponse.json({ error: "Enrichment job not found." }, { status: 404 });
  }

  if (!user.isAdmin && job.userId !== user.id) {
    return NextResponse.json({ error: "Enrichment job not found." }, { status: 404 });
  }

  const response: EnrichmentJobResponse = {
    jobId: job.id,
    status: job.status as EnrichmentJobResponse["status"],
    ssicCodes: job.ssicList,
    estimatedCandidateCount: job.estimatedCandidateCount,
    estimatedCacheHitCount: job.estimatedCacheHitCount,
    estimatedPaidCalls: job.estimatedPaidCalls,
    reservedPaidCalls: job.reservedPaidCalls,
    consumedPaidCalls: job.consumedPaidCalls,
    processedRows: job.processedRows,
    cacheHitCount: job.cacheHitCount,
    phonesFoundCount: job.phonesFoundCount,
    websitesFoundCount: job.websitesFoundCount,
    phonesFoundPercentage: job.processedRows > 0
      ? Number.parseFloat(((job.phonesFoundCount / job.processedRows) * 100).toFixed(1))
      : 0,
    websitesFoundPercentage: job.processedRows > 0
      ? Number.parseFloat(((job.websitesFoundCount / job.processedRows) * 100).toFixed(1))
      : 0,
    runtimeSeconds: job.startedAt && job.finishedAt
      ? Math.max(0, Math.floor((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000))
      : null,
    downloadPath: `/api/enrichment/jobs/${job.id}/download`,
    userChargeUsd: (job.preflightEstimatedPriceUsd ?? job.userChargeUsd) / 100,
    estimatedMaxCostUsd: job.estimatedMaxCostUsd / 100,
    stopReason: job.stopReason,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };

  return NextResponse.json(response);
}
