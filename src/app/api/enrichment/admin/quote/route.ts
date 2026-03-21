import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  adminQuoteSchema,
  buildPaymentCode,
  buildPreflightEstimate,
  estimateUserChargeUsd,
} from "@/lib/enrichment";
import { paymentCodes } from "@/lib/schema";
import type { EnrichmentAdminQuoteResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminQuoteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload. Expected ssicCodes and optional issueCode/purchasedDetailCalls/expiresInDays.",
      },
      { status: 400 },
    );
  }

  const db = getDb();
  const estimate = await buildPreflightEstimate(db, parsed.data.ssicCodes);

  const estimatedUserChargeUsd = estimateUserChargeUsd(estimate.candidateCount);
  const estimatedProviderCostUsd = estimate.projectedMaxCostUsd;
  const estimatedGrossMarginUsd = Number.parseFloat(
    (estimatedUserChargeUsd - estimatedProviderCostUsd).toFixed(4),
  );

  let paymentCode: string | null = null;
  let paymentCodeDetailCalls: number | null = null;
  let paymentCodeExpiresAt: string | null = null;

  if (parsed.data.issueCode) {
    const callsToCredit = parsed.data.purchasedDetailCalls ?? estimate.candidateCount;

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = buildPaymentCode();
      const existing = await db
        .select({ id: paymentCodes.id })
        .from(paymentCodes)
        .where(eq(paymentCodes.code, candidate))
        .limit(1);

      if (existing.length > 0) {
        continue;
      }

      await db.insert(paymentCodes).values({
        code: candidate,
        totalDetailCalls: callsToCredit,
        remainingDetailCalls: callsToCredit,
        isActive: true,
        expiresAt,
      });

      paymentCode = candidate;
      paymentCodeDetailCalls = callsToCredit;
      paymentCodeExpiresAt = expiresAt ? expiresAt.toISOString() : null;
      break;
    }

    if (!paymentCode) {
      return NextResponse.json(
        { error: "Unable to issue payment code after multiple attempts." },
        { status: 500 },
      );
    }
  }

  const response: EnrichmentAdminQuoteResponse = {
    ssicCodes: parsed.data.ssicCodes,
    candidateCount: estimate.candidateCount,
    estimatedCacheHitCount: estimate.cacheHitCount,
    estimatedPaidCalls: estimate.projectedPaidCalls,
    estimatedUserChargeUsd,
    estimatedProviderCostUsd,
    estimatedGrossMarginUsd,
    paymentCode,
    paymentCodeDetailCalls,
    paymentCodeExpiresAt,
  };

  return NextResponse.json(response);
}
