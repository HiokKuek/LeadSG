import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { enrichmentJobs } from "@/lib/schema";
import type { EnrichmentJobResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
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
    })
    .from(enrichmentJobs)
    .where(and(eq(enrichmentJobs.id, id), eq(enrichmentJobs.userId, user.id)))
    .limit(1);

  const job = rows[0];
  if (!job) {
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
    estimatedMaxCostUsd: job.estimatedMaxCostUsd / 100,
    stopReason: job.stopReason,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
  };

  return NextResponse.json(response);
}
