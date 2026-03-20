import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { redeemCodeSchema } from "@/lib/enrichment";
import { paymentCodeRedemptions, paymentCodes } from "@/lib/schema";
import type { EnrichmentRedeemResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = redeemCodeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected payment code string." },
      { status: 400 },
    );
  }

  const db = getDb();
  const now = new Date();

  const codeRows = await db
    .select({
      id: paymentCodes.id,
      code: paymentCodes.code,
      totalDetailCalls: paymentCodes.totalDetailCalls,
      remainingDetailCalls: paymentCodes.remainingDetailCalls,
      isActive: paymentCodes.isActive,
      expiresAt: paymentCodes.expiresAt,
    })
    .from(paymentCodes)
    .where(eq(paymentCodes.code, parsed.data.code))
    .limit(1);

  const code = codeRows[0];
  if (!code || !code.isActive) {
    return NextResponse.json({ error: "Invalid or inactive payment code." }, { status: 404 });
  }

  if (code.expiresAt && code.expiresAt <= now) {
    return NextResponse.json({ error: "Payment code has expired." }, { status: 400 });
  }

  const existingRedemptionRows = await db
    .select({
      id: paymentCodeRedemptions.id,
      userId: paymentCodeRedemptions.userId,
      redeemedAt: paymentCodeRedemptions.redeemedAt,
    })
    .from(paymentCodeRedemptions)
    .where(eq(paymentCodeRedemptions.paymentCodeId, code.id))
    .limit(1);

  const existingRedemption = existingRedemptionRows[0];
  if (existingRedemption && existingRedemption.userId !== user.id) {
    return NextResponse.json(
      { error: "This payment code has already been redeemed by another account." },
      { status: 409 },
    );
  }

  let redeemedAt = existingRedemption?.redeemedAt ?? null;

  if (!existingRedemption) {
    const inserted = await db
      .insert(paymentCodeRedemptions)
      .values({
        paymentCodeId: code.id,
        userId: user.id,
      })
      .returning({ redeemedAt: paymentCodeRedemptions.redeemedAt });

    redeemedAt = inserted[0]?.redeemedAt ?? new Date();
  }

  const response: EnrichmentRedeemResponse = {
    code: code.code,
    totalDetailCalls: code.totalDetailCalls,
    remainingDetailCalls: code.remainingDetailCalls,
    redeemedAt: (redeemedAt ?? new Date()).toISOString(),
  };

  return NextResponse.json(response);
}
