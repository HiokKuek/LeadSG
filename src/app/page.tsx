import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";

import { AuthControls } from "@/components/auth-controls";
import { CompanyEnrichmentFaq } from "@/components/company-enrichment-faq";
import { EnrichmentControls } from "@/components/enrichment-controls";
import { SearchPanelFallback } from "@/components/search-panel-fallback";
import { SearchPanel } from "@/components/search-panel";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-6 py-12 sm:py-24">
      <AuthControls />
      
      <header className="mb-12 w-full text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-zinc-900">
          LeadSG 📞
        </h1>
        <p className="mt-3 text-base text-zinc-600 sm:text-lg">
          Search for live companies with SSIC code.
        </p>
      </header>

      <Suspense fallback={<SearchPanelFallback />}>
        <SearchPanel />
      </Suspense>

      {!userId && (
        <div className="mt-8 text-center max-w-2xl mx-auto">
          <p className="text-base text-zinc-500 mb-4">
            Sign up to unlock advanced features like contact enrichment and bulk data export.
          </p>
          <Link
            href="/sign-up"
            className="inline-block rounded-lg bg-blue-600 hover:bg-blue-700 px-8 py-3 text-lg font-semibold text-white transition-colors"
          >
            Get Started Free →
          </Link>
        </div>
      )}

      {userId ? <EnrichmentControls /> : null}

      <CompanyEnrichmentFaq />

      <footer className="mt-auto pt-8 w-full text-center text-sm text-zinc-500">
        Built by HiokKuek {new Date().getFullYear()} <span className="inline-block animate-pulse-heart">💛</span>
      </footer>
    </main>
  );
}
