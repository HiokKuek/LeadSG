import { asc, eq } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { activeEntities } from "@/lib/schema";

const ssicSchema = z.string().regex(/^\d{5}$/);

export const runtime = "nodejs";

function toCsvValue(value: string | null | undefined) {
  const normalized = value ?? "";
  if (normalized.includes(",") || normalized.includes("\n") || normalized.includes("\"")) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Authentication required to download data." },
      { status: 401 },
    );
  }

  const query = request.nextUrl.searchParams.get("ssic")?.trim() ?? "";
  const parsed = ssicSchema.safeParse(query);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid SSIC code. Expected exactly 5 digits." },
      { status: 400 },
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      uen: activeEntities.uen,
      entityName: activeEntities.entityName,
      streetName: activeEntities.streetName,
      primarySsicCode: activeEntities.primarySsicCode,
      entityStatusDescription: activeEntities.entityStatusDescription,
    })
    .from(activeEntities)
    .where(eq(activeEntities.primarySsicCode, parsed.data))
    .orderBy(asc(activeEntities.entityName));

  const header = [
    "uen",
    "entity_name",
    "street_name",
    "primary_ssic_code",
    "entity_status_description",
  ];

  const csvLines = [
    header.join(","),
    ...rows.map((row) => [
      toCsvValue(row.uen),
      toCsvValue(row.entityName),
      toCsvValue(row.streetName),
      toCsvValue(row.primarySsicCode),
      toCsvValue(row.entityStatusDescription),
    ].join(",")),
  ];

  const csv = csvLines.join("\n");
  const filename = `${parsed.data}_companies.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}
