import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { buildPaymentCode } from "@/lib/enrichment";
import { enrichmentPreflightRequests, paymentCodes } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const expiresInDays = typeof body.expiresInDays === "number"
    ? body.expiresInDays
    : null;

  const db = getDb();

  const requestRows = await db
    .select({
      id: enrichmentPreflightRequests.id,
      userId: enrichmentPreflightRequests.userId,
      status: enrichmentPreflightRequests.status,
      projectedPaidCalls: enrichmentPreflightRequests.projectedPaidCalls,
      paymentCodeId: enrichmentPreflightRequests.paymentCodeId,
    })
    .from(enrichmentPreflightRequests)
    .where(eq(enrichmentPreflightRequests.id, id))
    .limit(1);

  const preflightRequest = requestRows[0];
  if (!preflightRequest) {
    return NextResponse.json({ error: "Preflight request not found." }, { status: 404 });
  }

  if (preflightRequest.status === "started") {
    return NextResponse.json(
      { error: "Preflight request already started and cannot issue new code." },
      { status: 409 },
    );
  }

  if (preflightRequest.projectedPaidCalls <= 0) {
    return NextResponse.json(
      { error: "This preflight request does not require paid calls or payment code." },
      { status: 400 },
    );
  }

  if (preflightRequest.paymentCodeId) {
    const existingCodeRows = await db
      .select({
        code: paymentCodes.code,
        totalDetailCalls: paymentCodes.totalDetailCalls,
        remainingDetailCalls: paymentCodes.remainingDetailCalls,
        expiresAt: paymentCodes.expiresAt,
      })
      .from(paymentCodes)
      .where(eq(paymentCodes.id, preflightRequest.paymentCodeId))
      .limit(1);

    const existingCode = existingCodeRows[0];
    if (existingCode) {
      return NextResponse.json({
        preflightRequestId: preflightRequest.id,
        code: existingCode.code,
        totalDetailCalls: existingCode.totalDetailCalls,
        remainingDetailCalls: existingCode.remainingDetailCalls,
        expiresAt: existingCode.expiresAt ? existingCode.expiresAt.toISOString() : null,
      });
    }
  }

  const expiresAt = expiresInDays && expiresInDays > 0
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
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

    const inserted = await db.transaction(async (tx) => {
      const codeRows = await tx
        .insert(paymentCodes)
        .values({
          code: candidate,
          preflightRequestId: preflightRequest.id,
          issuedToUserId: preflightRequest.userId,
          issuedByAdminUserId: user.id,
          totalDetailCalls: preflightRequest.projectedPaidCalls,
          remainingDetailCalls: preflightRequest.projectedPaidCalls,
          isSingleUse: true,
          isActive: true,
          expiresAt,
        })
        .returning({
          id: paymentCodes.id,
          code: paymentCodes.code,
          totalDetailCalls: paymentCodes.totalDetailCalls,
          remainingDetailCalls: paymentCodes.remainingDetailCalls,
          expiresAt: paymentCodes.expiresAt,
        });

      const createdCode = codeRows[0];

      await tx
        .update(enrichmentPreflightRequests)
        .set({
          paymentCodeId: createdCode.id,
          status: "code_issued",
          codeIssuedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enrichmentPreflightRequests.id, preflightRequest.id),
            eq(enrichmentPreflightRequests.status, preflightRequest.status),
          ),
        );

      return createdCode;
    });

    return NextResponse.json({
      preflightRequestId: preflightRequest.id,
      code: inserted.code,
      totalDetailCalls: inserted.totalDetailCalls,
      remainingDetailCalls: inserted.remainingDetailCalls,
      expiresAt: inserted.expiresAt ? inserted.expiresAt.toISOString() : null,
    });
  }

  return NextResponse.json(
    { error: "Unable to issue payment code after multiple attempts." },
    { status: 500 },
  );
}
