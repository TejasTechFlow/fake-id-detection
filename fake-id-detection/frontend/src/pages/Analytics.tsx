import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardTitle, EmptyState, ErrorBanner, Skeleton, inputCls } from "@/components/ui";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/services/api";
import { CATEGORY_HEX, CATEGORY_LABEL, FEATURE_LABEL } from "@/utils/format";
import type { RiskCategory } from "@/types";

const tip = { contentStyle: { background: "#10172A", border: "1px solid #26324B", borderRadius: 12, color: "#F8FAFC" } };
const ax = { tick: { fill: "#94A3B8", fontSize: 11 } };
const PALETTE = ["#3B82F6", "#8B5CF6", "#22C55E", "#F59E0B", "#EF4444", "#94A3B8"];

export default function Analytics() {
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [platform, setPlatform] = useState(""); const [prediction, setPrediction] = useState("");
  const [grain, setGrain] = useState<"daily" | "weekly">("daily");
  const { data, error, loading, reload } = useFetch(() => api.analytics({ date_from: from || undefined, date_to: to || undefined, platform: platform || undefined, prediction: prediction || undefined }), [from, to, platform, prediction]);
  const trend = data ? (grain === "daily" ? data.daily.map((d) => ({ x: d.date.slice(5), scans: d.scans })) : data.weekly.map((d) => ({ x: d.week_start.slice(5), scans: d.scans }))) : [];
  const pie = (o: Record<string, number>) => Object.entries(o).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm">From<input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-sm">To<input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="text-sm">Platform<select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)}><option value="">All</option>{["Instagram", "Facebook", "X", "LinkedIn", "Other"].map((p) => <option key={p}>{p}</option>)}</select></label>
          <label className="text-sm">Prediction<select className={inputCls} value={prediction} onChange={(e) => setPrediction(e.target.value)}><option value="">All</option><option>Likely Genuine</option><option>Suspicious — Review Recommended</option><option>Insufficient Information</option></select></label>
        </div>
      </Card>
      {error ? <ErrorBanner message={error} onRetry={reload} /> : loading || !data ? <Skeleton className="h-96" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between"><CardTitle>Scan trend</CardTitle>
              <div className="flex gap-1" role="group" aria-label="Trend granularity">{(["daily", "weekly"] as const).map((g) => <button key={g} onClick={() => setGrain(g)} aria-pressed={grain === g} className={`rounded-lg px-3 py-1 text-xs ${grain === g ? "bg-primary text-white" : "border border-line text-muted"}`}>{g === "daily" ? "Daily" : "Weekly"}</button>)}</div></div>
            {trend.length < 2 ? <EmptyState title="Not enough data for a trend" text="Trends appear once scans exist on at least two different days (or weeks)." icon={<BarChart3 className="h-6 w-6" />} /> :
              <ResponsiveContainer width="100%" height={240}><LineChart data={trend}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="x" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip {...tip} /><Line dataKey="scans" name="Scans" stroke="#3B82F6" strokeWidth={2} /></LineChart></ResponsiveContainer>}
          </Card>
          <Card><CardTitle>Prediction categories</CardTitle>{data.total === 0 ? <EmptyState title="No scans match these filters" /> :
            <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={pie(data.prediction_distribution)} dataKey="value" nameKey="name" outerRadius={85} label={({ value }) => value}>{pie(data.prediction_distribution).map((_, i) => <Cell key={i} fill={PALETTE[i % 6]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer>}</Card>
          <Card><CardTitle>Platform distribution</CardTitle>{data.total === 0 ? <EmptyState title="No scans match these filters" /> :
            <ResponsiveContainer width="100%" height={240}><BarChart data={pie(data.platform_distribution)}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="name" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip {...tip} /><Bar dataKey="value" name="Scans" fill="#8B5CF6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}</Card>
          <Card><CardTitle hint={`Bars show how many scans fall in each score range. Demonstration bands: lower up to ${data.thresholds.lower_max}, moderate up to ${data.thresholds.moderate_max}.`}>Risk-score distribution</CardTitle>{data.total === 0 ? <EmptyState title="No scans match these filters" /> :
            <ResponsiveContainer width="100%" height={240}><BarChart data={data.risk_histogram}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="range" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip {...tip} /><Bar dataKey="count" name="Scans" fill="#3B82F6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}</Card>
          <Card><CardTitle>Risk categories</CardTitle>{data.total === 0 ? <EmptyState title="No scans match these filters" /> :
            <ResponsiveContainer width="100%" height={240}><BarChart data={(Object.keys(data.risk_categories) as RiskCategory[]).map((k) => ({ name: CATEGORY_LABEL[k], value: data.risk_categories[k], k }))}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="name" {...ax} /><YAxis allowDecimals={false} {...ax} /><Tooltip {...tip} /><Bar dataKey="value" name="Scans" radius={[6, 6, 0, 0]}>{(Object.keys(data.risk_categories) as RiskCategory[]).map((k) => <Cell key={k} fill={CATEGORY_HEX[k]} />)}</Bar></BarChart></ResponsiveContainer>}</Card>
          <Card><CardTitle hint="Permutation importance from the training test split. Describes the model globally, not any one profile.">Feature importance</CardTitle>{data.feature_importance.length === 0 ? <EmptyState title="No trained model" text="Train a model on the Model Performance page." /> :
            <ResponsiveContainer width="100%" height={260}><BarChart layout="vertical" data={data.feature_importance.map((f) => ({ name: FEATURE_LABEL[f.feature] ?? f.feature, value: +f.importance.toFixed(4) }))} margin={{ left: 40 }}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis type="number" {...ax} /><YAxis type="category" dataKey="name" width={130} {...ax} /><Tooltip {...tip} /><Bar dataKey="value" fill="#3B82F6" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>}</Card>
          <Card><CardTitle hint="Class counts in the dataset used to train the current model.">Dataset class balance</CardTitle>{!data.class_balance ? <EmptyState title="No trained model" text="Class balance comes from the training dataset." /> :
            <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={[{ name: "Genuine", value: data.class_balance.genuine }, { name: "Fake", value: data.class_balance.fake }]} dataKey="value" nameKey="name" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}><Cell fill="#22C55E" /><Cell fill="#EF4444" /></Pie><Tooltip {...tip} /></PieChart></ResponsiveContainer>}</Card>
        </div>
      )}
    </div>
  );
}
