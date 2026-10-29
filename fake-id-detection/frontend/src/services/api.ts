const DEFAULT_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

export const getBaseUrl = () => localStorage.getItem("cs_api_url") || DEFAULT_URL;
export const setBaseUrl = (u: string) => localStorage.setItem("cs_api_url", u.replace(/\/$/, ""));
const adminToken = () => sessionStorage.getItem("cs_admin_token") || "";
export const setAdminToken = (t: string) => sessionStorage.setItem("cs_admin_token", t);

export class ApiError extends Error {
  status: number;
  details?: { field: string; message: string }[];
  constructor(message: string, status: number, details?: { field: string; message: string }[]) {
    super(message); this.status = status; this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(getBaseUrl() + path, init);
  } catch {
    throw new ApiError(`Cannot reach the backend at ${getBaseUrl()}. Start it with "uvicorn app.main:app --reload --port 8000" in the backend folder.`, 0);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status}).`; let details;
    try { const b = await res.json(); msg = b?.error?.message ?? b?.detail ?? msg; details = b?.error?.details ?? undefined; } catch { /* keep default */ }
    throw new ApiError(msg, res.status, details);
  }
  return (res.headers.get("content-type")?.includes("json") ? res.json() : res.blob()) as Promise<T>;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const qs = (p: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") u.set(k, String(v)); });
  const s = u.toString(); return s ? `?${s}` : "";
};

import type { AnalyticsData, Analysis, BatchResult, Dashboard, Health, Metrics, Page, ScanDetail, ScanSummary } from "@/types";

export const api = {
  health: () => request<Health>("/api/health"),
  dashboard: () => request<Dashboard>("/api/dashboard"),
  analyze: (profile: Record<string, unknown>, save: boolean) => request<Analysis>("/api/analyze", json({ profile, save })),
  batch: (rows: { row_number: number; data: Record<string, unknown> }[], save: boolean, is_demo = false) =>
    request<BatchResult>("/api/analyze/batch", json({ rows, save, is_demo })),
  history: (p: Record<string, string | number | undefined>) => request<Page<ScanSummary>>(`/api/history${qs(p)}`),
  scan: (id: string) => request<ScanDetail>(`/api/history/${id}`),
  deleteScan: (id: string) => request<{ deleted: string }>(`/api/history/${id}`, { method: "DELETE" }),
  analytics: (p: Record<string, string | undefined>) => request<AnalyticsData>(`/api/analytics${qs(p)}`),
  metrics: () => request<Metrics>("/api/model/metrics"),
  validateDataset: (form: FormData) => request<Record<string, unknown>>("/api/dataset/validate", { method: "POST", body: form }),
  train: (form: FormData) =>
    request<Metrics>("/api/model/train", { method: "POST", body: form, headers: adminToken() ? { "X-Admin-Token": adminToken() } : {} }),
  async download(path: string, filename: string) {
    const blob = await request<Blob>(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },
};
