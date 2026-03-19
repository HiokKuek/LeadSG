import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { activeEntities } from "@/lib/schema";
import type { EntitySearchResult } from "@/lib/types";

const ssicSchema = z.string().regex(/^\d{5}$/);

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("ssic")?.trim();

  if (!query) {
    return NextResponse.json<{ data: EntitySearchResult[] }>({ data: [] });
  }

  const parsed = ssicSchema.safeParse(query);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid SSIC code. Expected exactly 5 digits." },
      { status: 400 },
    );
  }

  const rows = await getDb()
    .select({
      uen: activeEntities.uen,
      entityName: activeEntities.entityName,
      streetName: activeEntities.streetName,
      primarySsicCode: activeEntities.primarySsicCode,
    })
    .from(activeEntities)
    .where(eq(activeEntities.primarySsicCode, parsed.data))
    .orderBy(asc(activeEntities.entityName))
    .limit(env.SEARCH_LIMIT);

  return NextResponse.json<{ data: EntitySearchResult[] }>({ data: rows });
}
