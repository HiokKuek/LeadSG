import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import {
  buildPreflightEstimate,
  estimateUserChargeUsd,
  ssicListSchema,
} from "@/lib/enrichment";
import type { EnrichmentPreflightResponse } from "@/lib/types";

export const runtime = "nodejs";

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

  const response: EnrichmentPreflightResponse = {
    ssicCodes: parsed.data.ssicCodes,
    candidateCount: estimate.candidateCount,
    projectedPaidCalls: estimate.projectedPaidCalls,
    estimatedPriceUsd: estimateUserChargeUsd(estimate.candidateCount),
    estimatedProviderCostUsd: estimate.projectedMaxCostUsd,
  };

  return NextResponse.json(response);
}
