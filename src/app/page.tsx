import { Suspense } from "react";

import { SearchPanelFallback } from "@/components/search-panel-fallback";
import { SearchPanel } from "@/components/search-panel";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-6 py-24">
      <header className="mb-10 space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          LeadSG 📞
        </h1>
        <p className="text-sm text-zinc-500">
          Query Singapore companies by primary SSIC code.
        </p>
      </header>
      <Suspense fallback={<SearchPanelFallback />}>
        <SearchPanel />
      </Suspense>
    </main>
  );
}
