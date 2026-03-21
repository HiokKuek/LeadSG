import { and, eq, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  preflightRequestIdSchema,
} from "@/lib/enrichment";
import { enrichmentJobs, enrichmentPreflightRequests, paymentCodes } from "@/lib/schema";
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

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = preflightRequestIdSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected preflightRequestId." },
      { status: 400 },
    );
  }

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
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.id, parsed.data.preflightRequestId))
    .limit(1);

  const preflight = preflightRows[0];
  if (!preflight || preflight.userId !== user.id) {
    return NextResponse.json({ error: "Preflight request not found." }, { status: 404 });
  }

  if (preflight.status === "started") {
    return NextResponse.json({ error: "Preflight request already used to start a job." }, { status: 409 });
  }

  if (preflight.status !== "ready_to_start") {
    return NextResponse.json(
      { error: "Preflight request is not ready to start. Redeem assigned payment code first." },
      { status: 409 },
    );
  }

  if (!preflight.paymentCodeId && preflight.projectedPaidCalls > 0) {
    return NextResponse.json(
      { error: "Preflight request has no assigned payment code." },
      { status: 402 },
    );
  }

  let paymentCodeForReservation: {
    id: number;
    remainingDetailCalls: number;
  } | null = null;

  if (preflight.paymentCodeId) {
    const paymentCodeRows = await db
      .select({
        id: paymentCodes.id,
        remainingDetailCalls: paymentCodes.remainingDetailCalls,
      })
      .from(paymentCodes)
      .where(eq(paymentCodes.id, preflight.paymentCodeId))
      .limit(1);

    paymentCodeForReservation = paymentCodeRows[0] ?? null;
  }

  if (paymentCodeForReservation && paymentCodeForReservation.remainingDetailCalls < preflight.projectedPaidCalls) {
    return NextResponse.json(
      {
        error: "Insufficient remaining quota for this enrichment run.",
        requiredPaidCalls: preflight.projectedPaidCalls,
        remainingPaidCalls: paymentCodeForReservation.remainingDetailCalls,
      },
      { status: 402 },
    );
  }

  const jobId = crypto.randomUUID();
  const reservedPaidCalls = preflight.projectedPaidCalls;
  const estimatedMaxCostUsdCents = preflight.estimatedPriceUsd;

  const job = await db.transaction(async (tx) => {
    if (paymentCodeForReservation && reservedPaidCalls > 0) {
      const updated = await tx
        .update(paymentCodes)
        .set({
          remainingDetailCalls: sql`${paymentCodes.remainingDetailCalls} - ${reservedPaidCalls}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentCodes.id, paymentCodeForReservation.id),
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
        preflightRequestId: preflight.id,
        paymentCodeId: preflight.paymentCodeId,
        initiatedByAdmin: false,
        ssicList: preflight.ssicList,
        status: "queued",
        estimatedCandidateCount: preflight.candidateCount,
        estimatedCacheHitCount: Math.max(preflight.candidateCount - preflight.projectedPaidCalls, 0),
        estimatedPaidCalls: preflight.projectedPaidCalls,
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
      .where(
        and(
          eq(enrichmentPreflightRequests.id, preflight.id),
          eq(enrichmentPreflightRequests.userId, user.id),
        ),
      );

    return inserted[0];
  });

  return NextResponse.json(toResponse(job), { status: 202 });
}
