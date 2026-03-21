import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/enrichment-auth";
import { adminAdjustInternalQuotaSchema } from "@/lib/enrichment";
import { enrichmentInternalQuota } from "@/lib/schema";
import type { EnrichmentInternalQuotaResponse } from "@/lib/types";

export const runtime = "nodejs";

async function ensureQuotaRow() {
  const db = getDb();
  await db
    .insert(enrichmentInternalQuota)
    .values({
      id: 1,
      remainingDetailCalls: 0,
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  const rows = await db
    .select({
      remainingDetailCalls: enrichmentInternalQuota.remainingDetailCalls,
      updatedByUserId: enrichmentInternalQuota.updatedByUserId,
      updatedAt: enrichmentInternalQuota.updatedAt,
    })
    .from(enrichmentInternalQuota)
    .where(eq(enrichmentInternalQuota.id, 1))
    .limit(1);

  return rows[0];
}

function toResponse(row: {
  remainingDetailCalls: number;
  updatedByUserId: string | null;
  updatedAt: Date;
}): EnrichmentInternalQuotaResponse {
  return {
    remainingDetailCalls: row.remainingDetailCalls,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const quota = await ensureQuotaRow();
  if (!quota) {
    return NextResponse.json({ error: "Unable to load internal quota." }, { status: 500 });
  }

  return NextResponse.json(toResponse(quota));
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = adminAdjustInternalQuotaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload. Expected detailCallsDelta integer." },
      { status: 400 },
    );
  }

  await ensureQuotaRow();

  const updated = await getDb()
    .update(enrichmentInternalQuota)
    .set({
      remainingDetailCalls: sql`greatest(${enrichmentInternalQuota.remainingDetailCalls} + ${parsed.data.detailCallsDelta}, 0)`,
      updatedByUserId: user.id,
      updatedAt: new Date(),
    })
    .where(eq(enrichmentInternalQuota.id, 1))
    .returning({
      remainingDetailCalls: enrichmentInternalQuota.remainingDetailCalls,
      updatedByUserId: enrichmentInternalQuota.updatedByUserId,
      updatedAt: enrichmentInternalQuota.updatedAt,
    });

  return NextResponse.json(toResponse(updated[0]));
}
