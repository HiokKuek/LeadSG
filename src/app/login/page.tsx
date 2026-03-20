"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError("Invalid credentials. Please check your email and password.");
      setIsLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-500">Use your LeadSG account credentials.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm text-zinc-700">Email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-zinc-700">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-200 px-3 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isLoading}
          className="h-10 w-full rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <Link href="/" className="mt-6 text-sm text-zinc-600 underline-offset-4 hover:underline">
        Back to search
      </Link>
    </main>
  );
}
