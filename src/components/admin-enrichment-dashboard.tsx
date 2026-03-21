"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PreflightRequest = {
  requestId: string;
  userEmail: string;
  ssicCodes: string[];
  status: "requested" | "code_issued" | "ready_to_start" | "started";
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
  requestedAt: string;
};

type InternalQuotaResponse = {
  remainingDetailCalls: number;
  updatedAt: string;
};

type IssuedCode = {
  code: string;
  requestId: string;
};

export function AdminEnrichmentDashboard() {
  const [adminRequests, setAdminRequests] = useState<PreflightRequest[]>([]);
  const [internalQuota, setInternalQuota] = useState<InternalQuotaResponse | null>(null);
  const [quotaDelta, setQuotaDelta] = useState("100");
  const [selectedRequest, setSelectedRequest] = useState<PreflightRequest | null>(null);
  const [issuedCodes, setIssuedCodes] = useState<IssuedCode[]>([]);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshQueue = useCallback(async () => {
    try {
      const response = await fetch("/api/enrichment/admin/preflight-requests");
      const data = (await response.json()) as { requests?: PreflightRequest[]; error?: string };

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Failed to load queue");
      }

      setAdminRequests(data.requests ?? []);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const refreshQuota = useCallback(async () => {
    try {
      const response = await fetch("/api/enrichment/admin/internal-quota");
      const data = (await response.json()) as InternalQuotaResponse | { error?: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to load quota");
      }

      setInternalQuota(data as InternalQuotaResponse);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void Promise.all([refreshQueue(), refreshQuota()]);
  }, [refreshQueue, refreshQuota]);

  const adjustQuota = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const delta = Number.parseInt(quotaDelta, 10);
      if (Number.isNaN(delta)) {
        throw new Error("Please enter a valid number");
      }

      const response = await fetch("/api/enrichment/admin/internal-quota", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detailCallsDelta: delta }),
      });

      const data = (await response.json()) as InternalQuotaResponse | { error?: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to adjust quota");
      }

      setInternalQuota(data as InternalQuotaResponse);
      setQuotaDelta("100");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const issueCode = async (requestId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/enrichment/admin/preflight-requests/${requestId}/issue-code`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );

      const data = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || data.error || !data.code) {
        throw new Error(data.error ?? "Failed to issue code");
      }

      setIssuedCodes([...issuedCodes, { code: data.code, requestId }]);
      await Promise.all([refreshQueue(), refreshQuota()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(code);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const adminBypassStart = async (requestId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/enrichment/admin/preflight-requests/${requestId}/start`,
        { method: "POST" }
      );

      const data = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Failed to start job");
      }

      await Promise.all([refreshQueue(), refreshQuota()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const issuedCode = useMemo(
    () => issuedCodes.find((ic) => ic.requestId === selectedRequest?.requestId),
    [issuedCodes, selectedRequest]
  );

  return (
    <section className="w-full">
      {/* Quota Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900 mb-1">Available Quota</p>
            <p className="text-3xl font-bold text-blue-600">
              {internalQuota?.remainingDetailCalls.toLocaleString() ?? "—"}
            </p>
            <p className="text-xs text-blue-700 mt-1">Google API detail calls available</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-xs text-zinc-600 mb-2">Adjust quota</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={quotaDelta}
                onChange={(e) => setQuotaDelta(e.target.value)}
                placeholder="+100 or -50"
                className="w-24 rounded-lg border border-blue-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={adjustQuota}
                disabled={isLoading}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
        >
          {error}
        </motion.div>
      )}

      {/* Preflight Queue Table */}
      <div>
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Pending Requests</h3>

        {adminRequests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg bg-zinc-50 border border-zinc-200 p-8 text-center"
          >
            <p className="text-zinc-600">No pending requests</p>
          </motion.div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">User</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">SSIC Codes</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">Est. Cost</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">API Calls</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {adminRequests.map((request, idx) => (
                  <motion.tr
                    key={request.requestId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedRequest(request)}
                    className={`cursor-pointer transition-colors ${
                      selectedRequest?.requestId === request.requestId
                        ? "bg-blue-50"
                        : "hover:bg-zinc-50"
                    }`}
                  >
                    <td className="px-6 py-4 text-sm text-zinc-900 font-medium">{request.userEmail}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600 font-mono">{request.ssicCodes.join(", ")}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-zinc-900">
                      USD {request.estimatedPriceUsd.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-600">
                      {request.projectedPaidCalls.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        request.status === "started"
                          ? "bg-green-100 text-green-800"
                          : request.status === "code_issued"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRequest(request);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Details
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      <AnimatePresence>
        {selectedRequest && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedRequest(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="sticky top-0 bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-zinc-900">Request Details</h3>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* User Info */}
                <div>
                  <p className="text-xs font-semibold text-zinc-600 uppercase mb-1">User Email</p>
                  <p className="text-sm text-zinc-900 font-medium">{selectedRequest.userEmail}</p>
                </div>

                {/* SSIC Codes */}
                <div>
                  <p className="text-xs font-semibold text-zinc-600 uppercase mb-1">SSIC Codes</p>
                  <p className="text-sm text-zinc-900 font-mono bg-zinc-50 rounded-lg p-2">
                    {selectedRequest.ssicCodes.join(", ")}
                  </p>
                </div>

                {/* Highlights */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-xs text-blue-900 font-semibold mb-1">User Cost</p>
                    <p className="text-xl font-bold text-blue-600">USD {selectedRequest.estimatedPriceUsd.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-900 font-semibold mb-1">API Calls</p>
                    <p className="text-xl font-bold text-blue-600">
                      {selectedRequest.projectedPaidCalls.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-900 font-semibold mb-1">Companies</p>
                    <p className="text-xl font-bold text-blue-600">
                      {selectedRequest.candidateCount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-900 font-semibold mb-1">Status</p>
                    <p className="text-lg font-bold text-blue-600 capitalize">{selectedRequest.status}</p>
                  </div>
                </div>

                {/* Code Section */}
                {issuedCode ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-green-50 rounded-lg border border-green-200"
                  >
                    <p className="text-xs font-semibold text-green-900 mb-2">Issued Code</p>
                    <div
                      onClick={() => copyCode(issuedCode.code)}
                      onMouseLeave={() => setCopiedCodeId(null)}
                      className="flex items-center justify-between gap-2 p-3 bg-white border border-green-300 rounded-lg cursor-pointer hover:bg-green-50 transition-colors group"
                    >
                      <code className="font-mono text-sm font-bold text-green-700 tracking-wider">
                        {issuedCode.code}
                      </code>
                      <motion.div
                        animate={copiedCodeId === issuedCode.code ? { scale: 1 } : { scale: 0.8 }}
                      >
                        {copiedCodeId === issuedCode.code ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-zinc-400 group-hover:text-green-600 transition-colors" />
                        )}
                      </motion.div>
                    </div>
                    <p className="text-xs text-green-800 mt-2 italic">
                      Click to copy • Share with user for redemption
                    </p>
                  </motion.div>
                ) : selectedRequest.status === "code_issued" ? (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-sm text-amber-900">Code already issued but not loaded yet</p>
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-zinc-900 mb-1">No Code Yet</p>
                      <p className="text-sm text-zinc-600">
                        {selectedRequest.projectedPaidCalls === 0
                          ? "This request is free (no paid API calls)."
                          : "Click below to generate a single-use confirmation code."}
                      </p>
                    </div>
                    {selectedRequest.projectedPaidCalls > 0 && (
                      <button
                        onClick={() => void issueCode(selectedRequest.requestId)}
                        disabled={isLoading}
                        className="w-full rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-300 px-4 py-2 text-sm font-medium text-white transition-colors"
                      >
                        {isLoading ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                          </span>
                        ) : (
                          "Issue Code"
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Admin Actions */}
                {selectedRequest.status !== "started" && (
                  <div className="flex gap-3 pt-4 border-t border-zinc-200">
                    <button
                      onClick={() => setSelectedRequest(null)}
                      className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                    >
                      Close
                    </button>
                    {selectedRequest.projectedPaidCalls > 0 && (
                      <button
                        onClick={() => void adminBypassStart(selectedRequest.requestId)}
                        disabled={isLoading}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-300 px-4 py-2 text-sm font-medium text-white transition-colors"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                        ) : (
                          "Admin Bypass Start"
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
