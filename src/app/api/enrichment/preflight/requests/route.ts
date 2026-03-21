import { desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  buildPreflightEstimate,
  estimateMaxCostUsd,
  estimateUserChargeUsd,
  ssicListSchema,
} from "@/lib/enrichment";
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
    estimatedProviderCostUsd: estimateMaxCostUsd(row.projectedPaidCalls),
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
  const existingRequests = await db
    .select({
      id: enrichmentPreflightRequests.id,
      ssicList: enrichmentPreflightRequests.ssicList,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.userId, user.id));

  const requestedSsicSet = new Set(parsed.data.ssicCodes);
  const duplicateRequest = existingRequests.find((existing) =>
    existing.ssicList.some((code) => requestedSsicSet.has(code)),
  );

  if (duplicateRequest) {
    const duplicateCodes = Array.from(
      new Set(duplicateRequest.ssicList.filter((code) => requestedSsicSet.has(code))),
    );

    return NextResponse.json(
      {
        error: `Duplicate SSIC request is not allowed. Overlapping SSIC: ${duplicateCodes.join(", ")}.`,
        existingRequestId: duplicateRequest.id,
        duplicateSsicCodes: duplicateCodes,
      },
      { status: 409 },
    );
  }

  const estimate = await buildPreflightEstimate(db, parsed.data.ssicCodes);
  const requestId = crypto.randomUUID();

  const inserted = await db
    .insert(enrichmentPreflightRequests)
    .values({
      id: requestId,
      userId: user.id,
      userEmail: user.email,
      ssicList: parsed.data.ssicCodes,
      status: "requested",
      candidateCount: estimate.candidateCount,
      projectedPaidCalls: estimate.projectedPaidCalls,
      estimatedPriceUsd: Math.round(estimateUserChargeUsd(estimate.candidateCount) * 100),
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
