import { useState } from "react";
import type { Plan } from "./App";
import { request } from "./api";

type Job = {
  id: string;
  status: string;
  completed: number;
  total: number | null;
  current: string;
  cancel_requested: boolean;
  plan: Plan | null;
  error: string;
};

export function useAnalysis() {
  const [progress, setProgress] = useState<Job | null>(null);
  const [cancelError, setCancelError] = useState("");
  async function run(body: object): Promise<Plan> {
    setProgress(null);
    setCancelError("");
    const result = await request<Job | Plan>("analyze", {
      ...body,
      background: true,
    });
    // Accept the synchronous contract for compatibility with older servers.
    if ("items" in result) return result;
    let job = result;
    setProgress(job);
    while (job.status === "running") {
      await new Promise((resolve) => setTimeout(resolve, 400));
      job = await request<Job>(`analysis/${job.id}/status`, {});
      setProgress(job);
    }
    if (job.status === "failed" || !job.plan)
      throw new Error(job.error || "A análise não devolveu resultados.");
    return job.plan;
  }
  async function cancel() {
    if (!progress) return;
    try {
      await request<Job>(`analysis/${progress.id}/cancel`, {});
      setProgress((current) =>
        current ? { ...current, cancel_requested: true } : null,
      );
      setCancelError("");
    } catch {
      setCancelError("Não foi possível pedir o cancelamento. Tente novamente.");
    }
  }
  return { run, progress, cancel, cancelError };
}
