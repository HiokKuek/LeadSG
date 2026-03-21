import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { redeemCodeSchema } from "@/lib/enrichment";
import { enrichmentPreflightRequests, paymentCodeRedemptions, paymentCodes } from "@/lib/schema";
import type { EnrichmentRedeemResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
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

  const preflightRequestRows = await db
    .select({
      id: enrichmentPreflightRequests.id,
      userId: enrichmentPreflightRequests.userId,
      status: enrichmentPreflightRequests.status,
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.id, parsed.data.preflightRequestId))
    .limit(1);

  const preflightRequest = preflightRequestRows[0];
  if (!preflightRequest || preflightRequest.userId !== user.id) {
    return NextResponse.json({ error: "Preflight request not found." }, { status: 404 });
  }

  if (preflightRequest.status === "started") {
    return NextResponse.json({ error: "Preflight request already started." }, { status: 400 });
  }

  const codeRows = await db
    .select({
      id: paymentCodes.id,
      code: paymentCodes.code,
      preflightRequestId: paymentCodes.preflightRequestId,
      issuedToUserId: paymentCodes.issuedToUserId,
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

  if (code.preflightRequestId !== preflightRequest.id) {
    return NextResponse.json({ error: "Payment code does not match this preflight request." }, { status: 400 });
  }

  if (code.issuedToUserId && code.issuedToUserId !== user.id) {
    return NextResponse.json({ error: "Payment code is assigned to another user." }, { status: 403 });
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
    const inserted = await db.transaction(async (tx) => {
      const redemptionRows = await tx
        .insert(paymentCodeRedemptions)
        .values({
          paymentCodeId: code.id,
          userId: user.id,
        })
        .returning({ redeemedAt: paymentCodeRedemptions.redeemedAt });

      const redeemed = redemptionRows[0]?.redeemedAt ?? new Date();

      await tx
        .update(enrichmentPreflightRequests)
        .set({
          status: "ready_to_start",
          redeemedAt: redeemed,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enrichmentPreflightRequests.id, preflightRequest.id),
            eq(enrichmentPreflightRequests.userId, user.id),
          ),
        );

      return redeemed;
    });

    redeemedAt = inserted;
  } else {
    await db
      .update(enrichmentPreflightRequests)
      .set({
        status: "ready_to_start",
        redeemedAt: existingRedemption.redeemedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(enrichmentPreflightRequests.id, preflightRequest.id),
          eq(enrichmentPreflightRequests.userId, user.id),
        ),
      );
  }

  const response: EnrichmentRedeemResponse = {
    code: code.code,
    totalDetailCalls: code.totalDetailCalls,
    remainingDetailCalls: code.remainingDetailCalls,
    redeemedAt: (redeemedAt ?? new Date()).toISOString(),
  };

  return NextResponse.json(response);
}
