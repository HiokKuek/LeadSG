import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";

import { authOptions } from "@/lib/auth-options";
import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

export type AuthenticatedUser = {
  id: number;
  email: string;
  tier: string;
  isActive: boolean;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) {
    return null;
  }

  const userId = Number.parseInt(sessionUserId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return null;
  }

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export function isAdminRequestAuthorized(request: NextRequest): boolean {
  const configuredKey = process.env.ENRICHMENT_ADMIN_API_KEY;
  if (!configuredKey) {
    return false;
  }

  const supplied = request.headers.get("x-admin-key")?.trim();
  return Boolean(supplied && supplied === configuredKey);
}
