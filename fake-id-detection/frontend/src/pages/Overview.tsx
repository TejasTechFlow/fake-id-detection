import { Link } from "react-router-dom";
import { Activity, BarChart3, Gauge, ScanSearch, ShieldAlert, ShieldCheck, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Button, Card, CardTitle, ConfirmDialog, EmptyState, ErrorBanner, Pagination, RiskBadge, Skeleton, useToast } from "@/components/ui";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/services/api";
import { CATEGORY_HEX, CATEGORY_LABEL, FEATURE_LABEL, fmtDate } from "@/utils/format";
import type { RiskCategory } from "@/types";

const tip = { contentStyle: { background: "#10172A", border: "1px solid #26324B", borderRadius: 12, color: "#F8FAFC" } };

function Stat({ icon: Icon, label, value, sub, trend }: { icon: typeof Activity; label: string; value: string; sub: string; trend?: number | null }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Icon className="h-5 w-5" aria-hidden /></div>
        {trend != null && (
          <span className="inline-flex items-center gap-1 text-xs text-muted" title="Last 7 days vs the previous 7 days">
            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p><p className="text-xs text-muted">{sub}</p>
    </Card>
  );
}

export default function Overview() {
  const { data, error, loading, reload } = useFetch(() => api.dashboard());
  const [page, setPage] = useState(1);
  const hist = useFetch(() => api.history({ page, page_size: 5 }), [page]);
  const [del, setDel] = useState<string | null>(null);
  const toast = useToast();

  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  const empty = !loading && data?.total === 0;
  const sampleBtn = <Link to="/detect"><Button><ScanSearch className="h-4 w-4" />Analyze a sample profile</Button></Link>;

  return (
    <div className="space-y-6">
      <Card glass className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Welcome to CyberShield AI</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">Analyze social media profile characteristics and identify potentially suspicious accounts using machine learning.</p>
        </div>
        <div className="flex gap-2"><Link to="/detect"><Button>Analyze a Profile</Button></Link><Link to="/analytics"><Button variant="secondary">View Analytics</Button></Link></div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !data ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />) : <>
          <Stat icon={Activity} label="Total Profiles Analyzed" value={String(data.total)} sub="Saved scans in the database" trend={data.trend_total_pct} />
          <Stat icon={ShieldAlert} label="Profiles Flagged for Review" value={String(data.flagged)} sub="Moderate or higher model risk" />
          <Stat icon={ShieldCheck} label="Classified as Lower Risk" value={String(data.lower_risk)} sub="Lower model risk assessments" />
          <Stat icon={Gauge} label="Average Model Risk Score" value={data.average_score == null ? "n/a" : String(data.average_score)} sub="Mean score, scans with enough data" />
        </>}
      </div>

      {empty ? (
        <Card><EmptyState title="No scans yet" text="Charts fill in from real scans stored in your database. Analyze a profile to get started." action={sampleBtn} icon={<BarChart3 className="h-6 w-6" />} /></Card>
      ) : data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardTitle>Profile Analysis Overview (last 30 days)</CardTitle>
            <ResponsiveContainer width="100%" height={240}><LineChart data={data.daily_scans}>
              <CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: "#94A3B8", fontSize: 11 }} /><Tooltip {...tip} />
              <Line type="monotone" dataKey="scans" name="Scans" stroke="#3B82F6" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></Card>
          <Card><CardTitle>Risk Distribution</CardTitle>
            <ResponsiveContainer width="100%" height={240}><PieChart>
              <Pie data={(Object.keys(data.risk_distribution) as RiskCategory[]).map((k) => ({ name: CATEGORY_LABEL[k], value: data.risk_distribution[k], k })).filter((d) => d.value > 0)}
                dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>
                {(Object.keys(data.risk_distribution) as RiskCategory[]).filter((k) => data.risk_distribution[k] > 0).map((k) => <Cell key={k} fill={CATEGORY_HEX[k]} />)}
              </Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></Card>
          <Card><CardTitle>Detection Results</CardTitle>
            <ResponsiveContainer width="100%" height={240}><BarChart data={Object.entries(data.prediction_counts).map(([name, value]) => ({ name, value }))}>
              <CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: "#94A3B8", fontSize: 11 }} />
              <Tooltip {...tip} /><Bar dataKey="value" name="Profiles" fill="#8B5CF6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></Card>
          <Card><CardTitle hint="Global permutation importance measured on the held-out test split of the training data. It describes the model, not any single profile.">Feature Insights</CardTitle>
            {data.feature_importance.length === 0 ? <EmptyState title="No trained model" text="Train a model to see feature importance." /> :
              <ResponsiveContainer width="100%" height={240}><BarChart layout="vertical" data={data.feature_importance.map((f) => ({ name: FEATURE_LABEL[f.feature] ?? f.feature, value: +f.importance.toFixed(4) }))} margin={{ left: 40 }}>
                <CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis type="category" dataKey="name" width={130} tick={{ fill: "#94A3B8", fontSize: 11 }} />
                <Tooltip {...tip} /><Bar dataKey="value" name="Importance" fill="#3B82F6" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>}</Card>
        </div>
      )}

      <Card>
        <CardTitle>Recent Activity</CardTitle>
        {hist.loading ? <Skeleton className="h-40" /> : hist.error ? <ErrorBanner message={hist.error} onRetry={hist.reload} /> : hist.data && hist.data.total === 0 ? <EmptyState title="No activity yet" text="Scans you save will appear here." action={sampleBtn} /> : hist.data && <>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted"><tr>{["Scan ID", "Profile", "Platform", "Risk score", "Prediction", "Scan date", "Action"].map((h) => <th key={h} className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{hist.data.items.map((s) => (
              <tr key={s.scan_id} className="border-t border-line">
                <td className="py-2.5 pr-3 font-mono text-xs">{s.scan_id}</td><td className="pr-3 break-all">{s.profile_ref}</td><td className="pr-3">{s.platform}</td>
                <td className="pr-3">{s.risk_category === "insufficient" ? "n/a" : s.risk_score}</td><td className="pr-3"><RiskBadge category={s.risk_category} label={s.prediction} /></td>
                <td className="pr-3 text-muted">{fmtDate(s.created_at)}</td>
                <td className="flex gap-1 py-2"><Link to={`/report/${s.scan_id}`} className="rounded-lg px-2 py-1 text-primary hover:bg-line/40">View</Link>
                  <button onClick={() => setDel(s.scan_id)} aria-label={`Delete ${s.scan_id}`} className="rounded-lg p-1.5 text-muted hover:bg-line/40 hover:text-danger"><Trash2 className="h-4 w-4" /></button></td>
              </tr>))}</tbody></table></div>
          <Pagination page={page} pageSize={5} total={hist.data.total} onPage={setPage} />
        </>}
      </Card>
      <ConfirmDialog open={!!del} title="Delete scan history entry" text={`Delete ${del}? This removes the saved scan from your database and cannot be undone.`}
        onClose={() => setDel(null)} onConfirm={async () => { try { await api.deleteScan(del!); toast("success", "Scan deleted"); hist.reload(); reload(); } catch (e) { toast("error", (e as Error).message); } setDel(null); }} />
    </div>
  );
}
