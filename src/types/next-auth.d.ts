import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tier: string;
    } & DefaultSession["user"];
  }

  interface User {
    tier?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    tier?: string;
  }
}
