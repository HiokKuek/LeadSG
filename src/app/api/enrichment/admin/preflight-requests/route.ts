import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { enrichmentPreflightRequests } from "@/lib/schema";
import type { EnrichmentPreflightRequestResponse } from "@/lib/types";

export const runtime = "nodejs";

function toResponse(row: {
  id: string;
  userId: string;
  userEmail: string;
  ssicList: string[];
  status: string;
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
  paymentCodeId: number | null;
  requestedAt: Date;
  codeIssuedAt: Date | null;
  redeemedAt: Date | null;
  startedAt: Date | null;
}): EnrichmentPreflightRequestResponse {
  return {
    requestId: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    ssicCodes: row.ssicList,
    status: row.status as EnrichmentPreflightRequestResponse["status"],
    candidateCount: row.candidateCount,
    projectedPaidCalls: row.projectedPaidCalls,
    estimatedPriceUsd: row.estimatedPriceUsd / 100,
    paymentCodeId: row.paymentCodeId,
    requestedAt: row.requestedAt.toISOString(),
    codeIssuedAt: row.codeIssuedAt ? row.codeIssuedAt.toISOString() : null,
    redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
  };
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const rows = await getDb()
    .select({
      id: enrichmentPreflightRequests.id,
      userId: enrichmentPreflightRequests.userId,
      userEmail: enrichmentPreflightRequests.userEmail,
      ssicList: enrichmentPreflightRequests.ssicList,
      status: enrichmentPreflightRequests.status,
      candidateCount: enrichmentPreflightRequests.candidateCount,
      projectedPaidCalls: enrichmentPreflightRequests.projectedPaidCalls,
      estimatedPriceUsd: enrichmentPreflightRequests.estimatedPriceUsd,
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
      requestedAt: enrichmentPreflightRequests.requestedAt,
      codeIssuedAt: enrichmentPreflightRequests.codeIssuedAt,
      redeemedAt: enrichmentPreflightRequests.redeemedAt,
      startedAt: enrichmentPreflightRequests.startedAt,
    })
    .from(enrichmentPreflightRequests)
    .orderBy(desc(enrichmentPreflightRequests.requestedAt));

  return NextResponse.json({
    requests: rows.map(toResponse),
  });
}
