import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { buildPreflightEstimate, ssicListSchema } from "@/lib/enrichment";
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
  issuedCode: string | null;
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
    issuedCode: row.issuedCode,
    requestedAt: row.requestedAt.toISOString(),
    codeIssuedAt: row.codeIssuedAt ? row.codeIssuedAt.toISOString() : null,
    redeemedAt: row.redeemedAt ? row.redeemedAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
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
  const requestId = crypto.randomUUID();

  const inserted = await db
    .insert(enrichmentPreflightRequests)
    .values({
      id: requestId,
      userId: user.id,
      userEmail: user.email,
      ssicList: parsed.data.ssicCodes,
      status: estimate.projectedPaidCalls === 0 ? "ready_to_start" : "requested",
      candidateCount: estimate.candidateCount,
      projectedPaidCalls: estimate.projectedPaidCalls,
      estimatedPriceUsd: Math.round(estimate.projectedMaxCostUsd * 100),
    })
    .returning({
      id: enrichmentPreflightRequests.id,
      userId: enrichmentPreflightRequests.userId,
      userEmail: enrichmentPreflightRequests.userEmail,
      ssicList: enrichmentPreflightRequests.ssicList,
      status: enrichmentPreflightRequests.status,
      candidateCount: enrichmentPreflightRequests.candidateCount,
      projectedPaidCalls: enrichmentPreflightRequests.projectedPaidCalls,
      estimatedPriceUsd: enrichmentPreflightRequests.estimatedPriceUsd,
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
      issuedCode: sql<string | null>`null`,
      requestedAt: enrichmentPreflightRequests.requestedAt,
      codeIssuedAt: enrichmentPreflightRequests.codeIssuedAt,
      redeemedAt: enrichmentPreflightRequests.redeemedAt,
      startedAt: enrichmentPreflightRequests.startedAt,
    });

  return NextResponse.json(toResponse(inserted[0]), { status: 201 });
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const db = getDb();
  const rows = await db
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
      issuedCode: sql<string | null>`null`,
      requestedAt: enrichmentPreflightRequests.requestedAt,
      codeIssuedAt: enrichmentPreflightRequests.codeIssuedAt,
      redeemedAt: enrichmentPreflightRequests.redeemedAt,
      startedAt: enrichmentPreflightRequests.startedAt,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.userId, user.id))
    .orderBy(desc(enrichmentPreflightRequests.requestedAt));

  return NextResponse.json({
    requests: rows.map(toResponse),
  });
}
