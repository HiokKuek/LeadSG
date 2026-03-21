"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PreflightResponse = {
  ssicCodes: string[];
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
};

type PreflightRequest = {
  requestId: string;
  userEmail: string;
  ssicCodes: string[];
  status: "requested" | "code_issued" | "ready_to_start" | "started";
  candidateCount: number;
  projectedPaidCalls: number;
  estimatedPriceUsd: number;
  issuedCode: string | null;
  requestedAt: string;
};

type JobResponse = {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed" | "partial_stopped_budget";
  ssicCodes: string[];
  estimatedCandidateCount: number;
  estimatedCacheHitCount: number;
  estimatedPaidCalls: number;
  reservedPaidCalls: number;
  consumedPaidCalls: number;
  processedRows: number;
  cacheHitCount: number;
  phonesFoundCount: number;
  websitesFoundCount: number;
  phonesFoundPercentage: number;
  websitesFoundPercentage: number;
  runtimeSeconds: number | null;
  downloadPath: string | null;
  userChargeUsd: number;
  estimatedMaxCostUsd: number;
  stopReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export function UserEnrichmentPanel() {
  const [ssicInput, setSsicInput] = useState("");
  const [paymentCode, setPaymentCode] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [confirmCodeStep, setConfirmCodeStep] = useState(false);

  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [requests, setRequests] = useState<PreflightRequest[]>([]);
  const [jobResult, setJobResult] = useState<JobResponse | null>(null);
  const [jobDetails, setJobDetails] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showJobQueued, setShowJobQueued] = useState(false);
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [userDidCloseResults, setUserDidCloseResults] = useState(false);
  const [jobHistory, setJobHistory] = useState<JobResponse[]>([]);
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<JobResponse | null>(null);

  const parseSsicCodes = () =>
    Array.from(
      new Set(
        ssicInput
          .split(",")
          .map((value) => value.trim())
          .filter((value) => /^\d{5}$/.test(value)),
      ),
    );

  const selectedRequest = useMemo(
    () => requests.find((r) => r.requestId === selectedRequestId) ?? null,
    [requests, selectedRequestId],
  );

  const refreshUserRequests = useCallback(async () => {
    const response = await fetch("/api/enrichment/preflight/requests");
    const payload = (await response.json()) as { requests?: PreflightRequest[]; error?: string };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? "Failed to load requests");
    }

    const requests = payload.requests ?? [];
    setRequests(requests);
    if (requests.length > 0 && !selectedRequestId) {
      setSelectedRequestId(requests[0].requestId);
    }
  }, [selectedRequestId]);

  // Load user's job history
  const loadJobHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/enrichment/jobs");
      const data = (await response.json()) as { jobs?: JobResponse[]; error?: string };
      if (response.ok && !data.error && data.jobs) {
        setJobHistory(data.jobs.sort((a, b) => new Date(b.finishedAt || b.createdAt).getTime() - new Date(a.finishedAt || a.createdAt).getTime()));
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    void loadJobHistory();
  }, [loadJobHistory]);

  // Poll job details while running
  useEffect(() => {
    if (!jobResult?.jobId) return;

    const pollJob = async () => {
      try {
        const response = await fetch(`/api/enrichment/jobs/${jobResult.jobId}`);
        const data = (await response.json()) as JobResponse | { error?: string };
        if (!response.ok || ("error" in data && data.error)) {
          return;
        }
        const parsedJob = data as JobResponse;
        setJobDetails(parsedJob);

        // Stop polling if job is complete, only auto-open if user hasn't closed it
        if (!["queued", "running"].includes(parsedJob.status)) {
          setShowJobQueued(false);
          if (!userDidCloseResults) {
            setShowJobDetails(true);
          }
        }
      } catch {
        // Silently fail on poll errors
      }
    };

    pollJob();
    const interval = window.setInterval(pollJob, 2000);
    return () => window.clearInterval(interval);
  }, [jobResult?.jobId, userDidCloseResults]);

  useEffect(() => {
    void refreshUserRequests().catch((err) => setError((err as Error).message));
  }, [refreshUserRequests]);

  const estimateCost = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssicCodes: parseSsicCodes() }),
      });

      const data = (await response.json()) as PreflightResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Estimation failed");
      }

      setPreflight(data);
      setShowCostModal(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmPurchase = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/preflight/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssicCodes: parseSsicCodes() }),
      });

      const data = (await response.json()) as PreflightRequest | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Purchase request failed");
      }

      const request = data as PreflightRequest;
      setSelectedRequestId(request.requestId);
      setShowCostModal(false);
      await refreshUserRequests();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const redeemCode = async () => {
    if (!selectedRequestId || !paymentCode.trim()) {
      setError("Please enter a confirmation code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          preflightRequestId: selectedRequestId, 
          code: paymentCode.trim() 
        }),
      });

      const data = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Code verification failed");
      }

      setPaymentCode("");
      setConfirmCodeStep(false);
      await refreshUserRequests();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const startJob = async () => {
    if (!selectedRequestId) {
      setError("Select a request first");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/enrichment/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preflightRequestId: selectedRequestId }),
      });

      const data = (await response.json()) as JobResponse | { error: string };
      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Failed to start job");
      }

      setJobResult(data);
      setShowJobQueued(true);
      await refreshUserRequests();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const canStartJob = selectedRequest && selectedRequest.status === "ready_to_start";
  const needsCode = selectedRequest && selectedRequest.status === "code_issued";

  return (
    <section className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-zinc-900">Get Company Details</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Retrieve phone numbers and websites for Singapore companies by SSIC code.
          <span className="block mt-1 text-xs text-zinc-500 italic">
            Note: Contact information is not always available for all companies.
          </span>
        </p>
      </div>

      {/* SSIC Input Section */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-2">SSIC Codes</label>
        <div className="flex gap-2">
          <input
            value={ssicInput}
            onChange={(e) => setSsicInput(e.target.value)}
            placeholder="e.g. 62011, 62012, 63110"
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={estimateCost}
            disabled={isLoading || !ssicInput.trim()}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 disabled:cursor-not-allowed px-6 py-2.5 text-sm font-medium text-white transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Estimate Cost"}
          </button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700"
        >
          {error}
        </motion.div>
      )}

      {/* Cost Estimate Modal */}
      <AnimatePresence>
        {showCostModal && preflight && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50"
            onClick={() => setShowCostModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-zinc-900">Cost Estimate</h3>
                <button
                  onClick={() => setShowCostModal(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center p-3 bg-zinc-50 rounded-lg">
                  <span className="text-sm text-zinc-600">Companies found</span>
                  <span className="font-semibold text-zinc-900">
                    {preflight.candidateCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm font-medium text-blue-900">Total cost</span>
                  <span className="text-2xl font-bold text-blue-600">
                    USD {preflight.estimatedPriceUsd.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCostModal(false)}
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPurchase}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-300 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                >
                  {isLoading ? "Processing..." : "Proceed to Purchase"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Requests List */}
      {requests.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <label className="block text-sm font-medium text-zinc-700 mb-2">Your Requests</label>
          <div className="relative">
            <select
              value={selectedRequestId}
              onChange={(e) => setSelectedRequestId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-zinc-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {requests.map((r) => (
                <option key={r.requestId} value={r.requestId}>
                  {r.ssicCodes.join(", ")} • {r.status} • USD {r.estimatedPriceUsd.toFixed(2)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-zinc-400" />
          </div>

          {selectedRequest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-3 p-3 bg-zinc-50 rounded-lg text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-zinc-600">Status</p>
                  <p className="font-semibold text-zinc-900 capitalize">{selectedRequest.status}</p>
                </div>
                <div>
                  <p className="text-zinc-600">Cost</p>
                  <p className="font-semibold text-zinc-900">USD {selectedRequest.estimatedPriceUsd.toFixed(2)}</p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Code Redemption Section */}
      {needsCode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200"
        >
          <h4 className="font-semibold text-amber-900 mb-3">Enter Confirmation Code</h4>
          <p className="text-sm text-amber-800 mb-4">
            Your request is awaiting admin approval. Once approved, you&apos;ll receive a confirmation code.
          </p>

          {!confirmCodeStep ? (
            <button
              onClick={() => setConfirmCodeStep(true)}
              className="w-full rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-medium text-white transition-colors"
            >
              I Have a Confirmation Code
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={paymentCode}
                  onChange={(e) => setPaymentCode(e.target.value)}
                  placeholder="Enter 6-character code"
                  className="flex-1 rounded-lg border border-amber-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  onClick={redeemCode}
                  disabled={isLoading || !paymentCode.trim()}
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-300 px-6 py-2.5 text-sm font-medium text-white transition-colors"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                </button>
              </div>
              <button
                onClick={() => {
                  setConfirmCodeStep(false);
                  setPaymentCode("");
                }}
                className="w-full text-sm text-amber-700 hover:text-amber-900"
              >
                Cancel
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Start Job Button */}
      {canStartJob && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <button
            onClick={startJob}
            disabled={isLoading}
            className="w-full rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-zinc-300 px-6 py-3 font-semibold text-white transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </span>
            ) : (
              "Start Job"
            )}
          </button>
        </motion.div>
      )}

      {/* Past Results Section */}
      {jobHistory.filter((j) => ["completed", "partial_stopped_budget"].includes(j.status)).length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <label className="block text-sm font-medium text-zinc-700 mb-3">Past Results</label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {jobHistory
              .filter((j) => ["completed", "partial_stopped_budget"].includes(j.status))
              .map((job) => (
                <button
                  key={job.jobId}
                  onClick={() => {
                    setSelectedHistoryJob(job);
                    setShowJobDetails(true);
                    setUserDidCloseResults(false);
                  }}
                  className="w-full text-left p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900 font-mono">
                      {job.ssicCodes.join(", ")}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                      {job.runtimeSeconds}s
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {job.phonesFoundCount} phones • {job.websitesFoundCount} websites
                  </div>
                </button>
              ))}
          </div>
        </motion.div>
      )}


      {/* Job Queued Message */}
      <AnimatePresence>
        {showJobQueued && jobResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200"
          >
            <div className="flex items-start gap-3">
              <Loader2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5 animate-spin" />
              <div className="flex-1">
                <h4 className="font-semibold text-green-900 mb-1">
                  {jobDetails?.status === "running" ? "Processing Job..." : "Job Queued"}
                </h4>
                <p className="text-sm text-green-800 mb-2">
                  {jobDetails?.status === "running"
                    ? `Processed ${jobDetails.processedRows.toLocaleString()} / ${jobDetails.estimatedCandidateCount.toLocaleString()} companies...`
                    : "Your enrichment job has been submitted and is being processed."}
                </p>
                <p className="text-xs text-green-700 font-mono bg-white rounded px-2 py-1 inline-block">
                  {jobResult.jobId.slice(0, 8)}...
                </p>
              </div>
              <button
                onClick={() => setShowJobQueued(false)}
                className="text-green-600 hover:text-green-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job Details Modal */}
      <AnimatePresence>
        {showJobDetails && (jobDetails || selectedHistoryJob) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowJobDetails(false);
              setUserDidCloseResults(true);
              setSelectedHistoryJob(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            >
              {(() => {
                const job = selectedHistoryJob || jobDetails;
                if (!job) return null;

                return (
                  <>
                    <div className="sticky top-0 bg-white border-b border-zinc-200 px-6 py-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-zinc-900">
                        {job.status === "completed" ? "✓ Results" : `Job ${job.status}`}
                      </h3>
                      <button
                        onClick={() => {
                          setShowJobDetails(false);
                          setUserDidCloseResults(true);
                          setSelectedHistoryJob(null);
                        }}
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Status Banner */}
                      <div
                        className={`p-4 rounded-lg border ${
                          job.status === "completed"
                            ? "bg-green-50 border-green-200"
                            : job.status === "failed"
                              ? "bg-red-50 border-red-200"
                              : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        <p className="text-sm font-semibold capitalize">
                          {job.status === "completed"
                            ? "✓ Enrichment completed successfully"
                            : job.status === "failed"
                              ? "✗ Job failed"
                              : `Processing: ${job.processedRows.toLocaleString()} / ${job.estimatedCandidateCount.toLocaleString()}`}
                        </p>
                        {job.errorMessage && (
                          <p className="text-xs mt-1 text-red-700">{job.errorMessage}</p>
                        )}
                      </div>

                      {/* User-Friendly Results Grid (simplified) */}
                      <div className="space-y-4">
                        {/* SSIC Codes */}
                        <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200">
                          <p className="text-xs font-semibold text-zinc-600 uppercase mb-2">SSIC Codes</p>
                          <p className="text-sm font-mono font-semibold text-zinc-900">{job.ssicCodes.join(", ")}</p>
                        </div>

                        {/* Key Metrics - Simple 2x2 Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
                            <p className="text-xs font-semibold text-zinc-600 uppercase mb-1">Total Rows</p>
                            <p className="text-2xl font-bold text-zinc-900">
                              {job.processedRows.toLocaleString()}
                            </p>
                          </div>
                          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                            <p className="text-xs font-semibold text-green-600 uppercase mb-1">Phone Numbers</p>
                            <p className="text-2xl font-bold text-green-700">
                              {job.phonesFoundCount} ({job.phonesFoundPercentage}%)
                            </p>
                          </div>
                          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-xs font-semibold text-purple-600 uppercase mb-1">Websites</p>
                            <p className="text-2xl font-bold text-purple-700">
                              {job.websitesFoundCount} ({job.websitesFoundPercentage}%)
                            </p>
                          </div>
                          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-xs font-semibold text-amber-600 uppercase mb-1">Runtime</p>
                            <p className="text-2xl font-bold text-amber-700">
                              {job.runtimeSeconds ?? 0}s
                            </p>
                          </div>
                        </div>

                        {/* Cost Summary */}
                        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                          <p className="text-xs font-semibold text-blue-600 uppercase mb-2">Your Cost</p>
                          <p className="text-3xl font-bold text-blue-700">USD {job.userChargeUsd.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      {job.status === "completed" && job.downloadPath && (
                        <div className="flex gap-3 pt-4 border-t border-zinc-200">
                          <button
                            onClick={() => {
                              setShowJobDetails(false);
                              setUserDidCloseResults(true);
                              setSelectedHistoryJob(null);
                            }}
                            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                          >
                            Close
                          </button>
                          <a
                            href={job.downloadPath}
                            download={`${job.ssicCodes.join(",")}_leadsg.csv`}
                            className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            Download CSV
                          </a>
                        </div>
                      )}

                      {job.status !== "completed" && (
                        <div className="flex gap-3 pt-4 border-t border-zinc-200">
                          <button
                            onClick={() => {
                              setShowJobDetails(false);
                              setUserDidCloseResults(true);
                              setSelectedHistoryJob(null);
                            }}
                            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
