"use client";

import { useUser } from "@clerk/nextjs";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { AdminEnrichmentDashboard } from "./admin-enrichment-dashboard";
import { UserEnrichmentPanel } from "./user-enrichment-panel";

export function EnrichmentControls() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";
  const [showAdmin, setShowAdmin] = useState(false);

  return (
    <section className="mt-10 w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Company Enrichment</h1>
          <p className="mt-1 text-zinc-600">Get phone numbers and websites for Singapore companies</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              showAdmin
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            }`}
          >
            {showAdmin ? "Back to User View" : "Admin Dashboard"}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {showAdmin && isAdmin ? (
          <motion.div
            key="admin"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-zinc-200 bg-white p-6"
          >
            <AdminEnrichmentDashboard />
          </motion.div>
        ) : (
          <motion.div
            key="user"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="rounded-xl border border-zinc-200 bg-white p-6"
          >
            <UserEnrichmentPanel />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
