import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Play, UploadCloud } from "lucide-react";
import { Button, Card, CardTitle, EmptyState, ErrorBanner, Field, Notice, Pagination, RiskBadge, inputCls, useToast } from "@/components/ui";
import { api, ApiError } from "@/services/api";
import { CATEGORY_LABEL, parseCsv, saveText, toCsv } from "@/utils/format";
import type { BatchResult, RiskCategory } from "@/types";

const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 5000;
const FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "profile_ref", label: "Profile reference", aliases: ["profile_ref", "username", "handle", "profile", "id"] },
  { key: "platform", label: "Platform", aliases: ["platform", "network", "site"] },
  { key: "account_age_days", label: "Account age (days)", aliases: ["account_age_days", "account_age", "age_days"] },
  { key: "followers", label: "Followers", aliases: ["followers", "follower_count"] },
  { key: "following", label: "Following", aliases: ["following", "friends", "follows"] },
  { key: "posts", label: "Posts", aliases: ["posts", "post_count", "statuses"] },
  { key: "has_profile_pic", label: "Profile picture", aliases: ["has_profile_pic", "profile_pic", "has_picture"] },
  { key: "has_bio", label: "Bio present", aliases: ["has_bio", "bio"] },
  { key: "verified", label: "Verified", aliases: ["verified", "is_verified"] },
  { key: "activity_level", label: "Activity level", aliases: ["activity_level", "activity"] },
];
const TEMPLATE = FIELDS.map((f) => f.key).join(",") + "\nexample_user_1,Instagram,365,120,300,45,yes,yes,not_verified,medium\n";

export default function Batch() {
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [fileName, setFileName] = useState(""); const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null); const [drag, setDrag] = useState(false);
  const [q, setQ] = useState(""); const [risk, setRisk] = useState(""); const [sort, setSort] = useState("row"); const [page, setPage] = useState(1);
  const [save, setSave] = useState(false);
  const input = useRef<HTMLInputElement>(null); const toast = useToast();

  const load = async (file: File) => {
    setError(null); setResult(null);
    if (!file.name.toLowerCase().endsWith(".csv")) return setError("Only .csv files are accepted.");
    if (file.size > MAX_BYTES) return setError(`File is larger than ${MAX_BYTES / 1024 / 1024} MB.`);
    const p = parseCsv(await file.text(), MAX_ROWS);
    if (!p.headers.length || !p.rows.length) return setError("The file has no header row or no data rows.");
    if (p.rows.length > MAX_ROWS) return setError(`Too many rows. The limit is ${MAX_ROWS}.`);
    const lower = p.headers.map((h) => h.toLowerCase());
    const m: Record<string, string> = {};
    FIELDS.forEach((f) => { const i = lower.findIndex((h) => f.aliases.includes(h)); if (i >= 0) m[f.key] = p.headers[i]; });
    setParsed(p); setFileName(file.name); setMap(m); setPage(1);
  };

  const start = async () => {
    if (!parsed) return;
    setBusy(true); setError(null);
    const idx = Object.fromEntries(Object.entries(map).filter(([, h]) => h).map(([k, h]) => [k, parsed.headers.indexOf(h)]));
    const rows = parsed.rows.map((r, i) => ({ row_number: i + 2, data: Object.fromEntries(Object.entries(idx).map(([k, c]) => [k, r[c] ?? ""])) }));
    try { setResult(await api.batch(rows, save)); toast("success", "Batch analysis complete"); }
    catch (e) { const m = e instanceof ApiError ? e.message : "Batch analysis failed."; setError(m); toast("error", m); }
    finally { setBusy(false); }
  };

  const view = useMemo(() => {
    if (!result) return [];
    let r = result.results.filter((x) => (!risk || x.risk_category === risk) && (!q || x.profile_ref.toLowerCase().includes(q.toLowerCase())));
    r = [...r].sort((a, b) => (sort === "score_desc" ? b.risk_score - a.risk_score : sort === "score_asc" ? a.risk_score - b.risk_score : a.row_number - b.row_number));
    return r;
  }, [result, q, risk, sort]);

  return (
    <div className="space-y-6">
      <Notice>Files are parsed in your browser and sent only to your own local backend. Nothing is uploaded to a third-party service. Limit: {MAX_BYTES / 1024 / 1024} MB and {MAX_ROWS.toLocaleString()} rows.</Notice>
      <Card>
        <CardTitle>Upload profiles (CSV)</CardTitle>
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
          className={`grid place-items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center ${drag ? "border-primary bg-primary/10" : "border-line"}`}>
          <UploadCloud className="mb-2 h-8 w-8 text-primary" aria-hidden />
          <p className="text-sm">Drag and drop a CSV file here, or</p>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <Button className="mt-2" variant="secondary" onClick={() => input.current?.click()}>Browse Files</Button>
          <p className="mt-2 text-xs text-muted">Accepted: .csv with a header row. {fileName && <>Loaded: <b>{fileName}</b> ({parsed?.rows.length} rows)</>}</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => saveText(TEMPLATE, "profiles_template.csv")}><Download className="h-4 w-4" />Download CSV template</Button>
          <a href="/sample_profiles.csv" download><Button variant="ghost"><FileSpreadsheet className="h-4 w-4" />Download synthetic sample</Button></a>
        </div>
      </Card>
      {error && <ErrorBanner message={error} />}

      {parsed && (
        <Card>
          <CardTitle>Column mapping</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <select className={inputCls} value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                  <option value="">{f.key === "platform" ? "Not in file (use Other)" : "Not in file (unknown)"}</option>
                  {parsed.headers.map((h) => <option key={h}>{h}</option>)}
                </select>
              </Field>))}
          </div>
          <h4 className="mb-2 mt-5 text-sm font-semibold">Preview (first 5 rows)</h4>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted"><tr>{parsed.headers.map((h) => <th key={h} className="pr-3 pb-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{parsed.rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-line">{parsed.headers.map((_, c) => <td key={c} className="py-1 pr-3">{r[c]}</td>)}</tr>)}</tbody></table></div>
          <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />Also save results to Scan History</label>
          <Button className="mt-4" loading={busy} onClick={start}><Play className="h-4 w-4" />{busy ? "Analyzing..." : "Start Analysis"}</Button>
        </Card>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[["Total rows", result.total_rows], ["Analyzed", result.analyzed], ["Rows with errors", result.error_count], ["Lower risk", result.counts.lower], ["Moderate risk", result.counts.moderate], ["Higher risk", result.counts.higher]].map(([l, v]) => (
              <Card key={l as string}><p className="text-2xl font-bold">{v}</p><p className="text-xs text-muted">{l}</p></Card>))}
          </div>
          {result.error_count > 0 && (
            <Card><CardTitle>Row validation report</CardTitle><p className="mb-2 text-xs text-muted">These rows were not analyzed. Row numbers match your file (header is row 1).</p>
              <div className="max-h-56 overflow-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="pb-1 pr-3">Row</th><th>Reason</th></tr></thead>
                <tbody>{result.errors.map((e) => <tr key={e.row_number} className="border-t border-line"><td className="py-1 pr-3 font-mono">{e.row_number}</td><td>{e.reason}</td></tr>)}</tbody></table></div></Card>)}
          <Card>
            <div className="mb-3 grid gap-3 md:grid-cols-4">
              <input aria-label="Search results" className={inputCls} placeholder="Search profile" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              <select aria-label="Risk filter" className={inputCls} value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }}><option value="">All risk levels</option>{(["lower", "moderate", "higher", "insufficient"] as RiskCategory[]).map((r) => <option key={r} value={r}>{CATEGORY_LABEL[r]}</option>)}</select>
              <select aria-label="Sort" className={inputCls} value={sort} onChange={(e) => setSort(e.target.value)}><option value="row">File order</option><option value="score_desc">Highest score</option><option value="score_asc">Lowest score</option></select>
              <Button variant="secondary" onClick={() => saveText(toCsv(view.map((r) => ({ row: r.row_number, profile_ref: r.profile_ref, platform: r.platform, prediction: r.prediction, risk_category: r.risk_category, risk_score: r.risk_score, top_factor: r.top_factor ?? "" }))), "batch_results.csv")}><Download className="h-4 w-4" />Export CSV</Button>
            </div>
            {view.length === 0 ? <EmptyState title="No rows match" text="Adjust the search or filters." /> : <>
              <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-muted"><tr>{["Row", "Profile", "Platform", "Prediction", "Score", "Top factor"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>{view.slice((page - 1) * 10, page * 10).map((r) => <tr key={r.row_number} className="border-t border-line"><td className="py-2 pr-3 font-mono text-xs">{r.row_number}</td><td className="pr-3 break-all">{r.profile_ref}</td><td className="pr-3">{r.platform}</td><td className="pr-3"><RiskBadge category={r.risk_category} label={r.prediction} /></td><td className="pr-3">{r.risk_category === "insufficient" ? "n/a" : r.risk_score}</td><td className="text-muted">{r.top_factor ?? "-"}</td></tr>)}</tbody></table></div>
              <Pagination page={page} pageSize={10} total={view.length} onPage={setPage} /></>}
          </Card>
        </>
      )}
    </div>
  );
}
