import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, EmptyState, ErrorBanner, Notice, Pagination, RiskBadge, Skeleton, inputCls, useToast } from "@/components/ui";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/services/api";
import { CATEGORY_LABEL, fmtDate, saveText, toCsv } from "@/utils/format";
import type { ScanSummary } from "@/types";

export default function HistoryPage() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [platform, setPlatform] = useState(""); const [risk, setRisk] = useState(""); const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<Record<string, ScanSummary>>({});
  const [del, setDel] = useState<string | null>(null);
  const toast = useToast();
  const qv = sp.get("q") ?? "";
  const { data, error, loading, reload } = useFetch(() => api.history({ page, page_size: 10, q: qv, platform, risk, sort }), [page, qv, platform, risk, sort]);
  const selected = Object.values(sel);
  const toggle = (s: ScanSummary) => setSel((m) => { const n = { ...m }; if (n[s.scan_id]) delete n[s.scan_id]; else n[s.scan_id] = s; return n; });

  return (
    <div className="space-y-4">
      <Notice>Scan history lists model assessments you ran in this app. It is not a list of verified fraud reports.</Notice>
      <Card>
        <form className="mb-4 grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); setPage(1); setSp(q ? { q } : {}); }}>
          <input aria-label="Search by profile reference" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search profile reference" className={inputCls + " md:col-span-2"} />
          <select aria-label="Filter by platform" value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }} className={inputCls}><option value="">All platforms</option>{["Instagram", "Facebook", "X", "LinkedIn", "Other"].map((p) => <option key={p}>{p}</option>)}</select>
          <select aria-label="Filter by risk category" value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }} className={inputCls}><option value="">All risk levels</option>{(["lower", "moderate", "higher", "insufficient"] as const).map((r) => <option key={r} value={r}>{CATEGORY_LABEL[r]}</option>)}</select>
          <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} className={inputCls}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="score_desc">Highest score</option><option value="score_asc">Lowest score</option></select>
        </form>
        <div className="mb-3 flex items-center justify-between text-sm text-muted">
          <span>{selected.length} selected</span>
          <Button variant="secondary" disabled={!selected.length} onClick={() => saveText(toCsv(selected.map(({ scan_id, profile_ref, platform: p, prediction, risk_score, created_at }) => ({ scan_id, profile_ref, platform: p, prediction, risk_score, scan_time: created_at }))), "scan_history_selected.csv")}><Download className="h-4 w-4" />Export selected</Button>
        </div>
        {loading ? <Skeleton className="h-64" /> : error ? <ErrorBanner message={error} onRetry={reload} /> : !data || data.total === 0 ? <EmptyState title="No matching scans" text="Analyze a profile and save it, or clear the filters." /> : <>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="w-8 pb-2" /> {["Scan ID", "Profile", "Platform", "Prediction", "Risk score", "Scanned", ""].map((h, i) => <th key={i} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.items.map((s) => (
              <tr key={s.scan_id} className="border-t border-line">
                <td className="py-2.5"><input type="checkbox" aria-label={`Select ${s.scan_id}`} checked={!!sel[s.scan_id]} onChange={() => toggle(s)} /></td>
                <td className="pr-3 font-mono text-xs">{s.scan_id}</td><td className="pr-3 break-all">{s.profile_ref}{s.is_demo && <span className="ml-2 rounded border border-line px-1 text-xs text-muted">demo</span>}</td>
                <td className="pr-3">{s.platform}</td><td className="pr-3"><RiskBadge category={s.risk_category} label={s.prediction} /></td>
                <td className="pr-3">{s.risk_category === "insufficient" ? "n/a" : s.risk_score}</td><td className="pr-3 text-muted">{fmtDate(s.created_at)}</td>
                <td className="whitespace-nowrap"><Link to={`/report/${s.scan_id}`} className="rounded-lg px-2 py-1 text-primary hover:bg-line/40">View report</Link>
                  <button onClick={() => setDel(s.scan_id)} aria-label={`Delete ${s.scan_id}`} className="rounded-lg p-1.5 text-muted hover:bg-line/40 hover:text-danger"><Trash2 className="h-4 w-4" /></button></td>
              </tr>))}</tbody></table></div>
          <Pagination page={page} pageSize={10} total={data.total} onPage={setPage} />
        </>}
      </Card>
      <ConfirmDialog open={!!del} title="Delete scan" text={`Delete ${del}? This cannot be undone.`} onClose={() => setDel(null)}
        onConfirm={async () => { try { await api.deleteScan(del!); toast("success", "Scan deleted"); setSel((m) => { const n = { ...m }; delete n[del!]; return n; }); reload(); } catch (e) { toast("error", (e as Error).message); } setDel(null); }} />
    </div>
  );
}
