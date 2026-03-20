import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { users } from "@/lib/schema";

const credentialsSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(8),
});

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const db = getDb();
        const rows = await db
          .select({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            tier: users.tier,
            isActive: users.isActive,
          })
          .from(users)
          .where(and(eq(users.email, parsed.data.email), eq(users.isActive, true)))
          .limit(1);

        const user = rows[0];
        if (!user || !user.passwordHash) {
          return null;
        }

        const isMatch = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isMatch) {
          return null;
        }

        return {
          id: String(user.id),
          email: user.email,
          tier: user.tier,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tier = user.tier;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.tier = typeof token.tier === "string" ? token.tier : "free";
      }
      return session;
    },
  },
};
