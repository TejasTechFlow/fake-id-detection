import { useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BrainCircuit, CheckCircle2, UploadCloud } from "lucide-react";
import { Button, Card, CardTitle, EmptyState, ErrorBanner, Field, Notice, Skeleton, Tip, inputCls, useToast } from "@/components/ui";
import { useFetch } from "@/hooks/useApi";
import { ApiError, api } from "@/services/api";
import { FEATURE_LABEL, fmtDate, pct } from "@/utils/format";
import type { Cls } from "@/types";

const tip = { contentStyle: { background: "#10172A", border: "1px solid #26324B", borderRadius: 12, color: "#F8FAFC" } };
const ax = { tick: { fill: "#94A3B8", fontSize: 11 } };
const name = (k: string) => (k === "random_forest" ? "Random Forest" : "Logistic Regression");

function TrainPanel({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"demo" | "upload">("demo");
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("label"); const [pos, setPos] = useState("fake");
  const [group, setGroup] = useState(""); const [time, setTime] = useState(""); const [mapping, setMapping] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLInputElement>(null); const toast = useToast();

  const form = () => {
    const f = new FormData();
    if (mode === "demo") { f.append("use_demo", "true"); return f; }
    if (file) f.append("file", file);
    f.append("target", target); if (pos) f.append("positive_label", pos);
    if (group) f.append("group_column", group); if (time) f.append("time_column", time); if (mapping) f.append("mapping", mapping);
    return f;
  };
  const run = async (kind: "validate" | "train") => {
    if (mode === "upload" && !file) return setMsg({ ok: false, text: "Choose a CSV file first." });
    setBusy(true); setMsg(null);
    try {
      if (kind === "validate") {
        const r = await api.validateDataset(form()) as { rows: number; class_distribution: { genuine: number; fake: number }; warnings: string[] };
        setMsg({ ok: true, text: `Dataset is valid: ${r.rows} rows (${r.class_distribution.genuine} genuine, ${r.class_distribution.fake} fake). ${r.warnings.join(" ")}` });
      } else { await api.train(form()); toast("success", "Model trained"); onDone(); }
    } catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "Request failed." }); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <CardTitle>Train a model</CardTitle>
      <div className="mb-4 flex gap-2" role="group" aria-label="Dataset source">
        {(["demo", "upload"] as const).map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-xl px-3 py-1.5 text-sm ${mode === m ? "bg-primary text-white" : "border border-line text-muted"}`}>{m === "demo" ? "Synthetic demo dataset" : "Upload labeled CSV"}</button>)}
      </div>
      {mode === "demo" ? <Notice tone="warn">The demonstration dataset is synthetic. A model trained on it shows how the system works but has no real-world detection capability.</Notice> : (
        <div className="space-y-3">
          <div className="flex items-center gap-3"><input ref={ref} type="file" accept=".csv" className="sr-only" aria-label="Labeled CSV" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button variant="secondary" onClick={() => ref.current?.click()}><UploadCloud className="h-4 w-4" />Choose CSV</Button><span className="text-sm text-muted">{file?.name ?? "No file chosen"}</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target column"><input className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
            <Field label="Value meaning 'fake'" tip="Numeric labels such as 0/1 are never assumed. Enter the value that marks a fake account in your dataset."><input className={inputCls} value={pos} onChange={(e) => setPos(e.target.value)} /></Field>
            <Field label="Account ID column (optional)" tip="If the same account appears in several rows, set this so no account is split across train and test."><input className={inputCls} value={group} onChange={(e) => setGroup(e.target.value)} /></Field>
            <Field label="Timestamp column (optional)" tip="Uses the newest 20% of rows as the test set, which better mimics future deployment."><input className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
          <Field label="Feature mapping (optional JSON)" hint={'Example: {"followers": "follower_count", "account_age_days": "age"}'}><input className={inputCls} value={mapping} onChange={(e) => setMapping(e.target.value)} placeholder="{}" /></Field>
        </div>)}
      {msg && <div className="mt-3"><Notice tone={msg.ok ? "info" : "warn"}>{msg.text}</Notice></div>}
      <div className="mt-4 flex gap-2">
        {mode === "upload" && <Button variant="secondary" loading={busy} onClick={() => run("validate")}><CheckCircle2 className="h-4 w-4" />Validate dataset</Button>}
        <Button loading={busy} onClick={() => run("train")}><BrainCircuit className="h-4 w-4" />Train model</Button>
      </div>
    </Card>
  );
}

function Matrix({ t }: { t: Cls["confusion_matrix"] }) {
  const cell = (label: string, v: number) => <div className="rounded-xl border border-line bg-bg p-3 text-center"><p className="text-xl font-bold">{v}</p><p className="text-xs text-muted">{label}</p></div>;
  return (
    <div className="grid grid-cols-2 gap-2" role="table" aria-label="Confusion matrix">
      {cell("True negative (genuine, predicted genuine)", t.tn)}{cell("False positive (genuine, flagged)", t.fp)}
      {cell("False negative (fake, missed)", t.fn)}{cell("True positive (fake, flagged)", t.tp)}
    </div>
  );
}

export default function ModelPerformance() {
  const { data: m, error, loading, reload } = useFetch(() => api.metrics());
  const missing = error?.startsWith("No trained model");
  if (loading) return <Skeleton className="h-96" />;
  if (error && !missing) return <ErrorBanner message={error} onRetry={reload} />;
  if (!m) return (
    <div className="space-y-4">
      <Card><EmptyState title="No trained model found" text="No trained model found. Upload a labeled dataset and train the model to view performance metrics." icon={<BrainCircuit className="h-6 w-6" />} /></Card>
      <TrainPanel onDone={reload} />
    </div>);
  const row = (label: string, f: (c: Cls) => string) => (
    <tr className="border-t border-line"><td className="py-2 pr-3">{label}</td>{Object.keys(m.comparison).map((k) => <td key={k} className="pr-3">{f(m.comparison[k].test)}</td>)}</tr>);
  return (
    <div className="space-y-4">
      {m.is_synthetic && <Notice tone="warn">This model was trained on synthetic demonstration data. The metrics below describe the demo dataset only and are not real-world performance.</Notice>}
      {m.warnings.filter((w) => !w.startsWith("SYNTHETIC")).map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Selected model", name(m.selected_model)], ["Training rows", `${m.dataset.train_rows} (of ${m.dataset.rows})`], ["Features", String(m.n_features)], ["Trained", fmtDate(m.trained_at)]].map(([l, v]) => <Card key={l}><p className="text-xs text-muted">{l}</p><p className="font-semibold">{v}</p></Card>)}
      </div>
      <Card><CardTitle>Evaluation setup</CardTitle>
        <ul className="space-y-1 text-sm text-muted">
          <li><b className="text-ink">Dataset:</b> {m.dataset_name} ({m.dataset.class_distribution.genuine} genuine, {m.dataset.class_distribution.fake} fake)</li>
          <li><b className="text-ink">Split:</b> {m.split_method}</li>
          <li><b className="text-ink">Model selection:</b> {m.selection_basis}. Test data was not used to choose the model.</li>
          <li><b className="text-ink">Score type:</b> {m.calibrated ? "calibrated probability (sigmoid calibration)" : "uncalibrated model score"}</li></ul></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardTitle hint="Validation metrics come from cross-validation inside the training split. Test metrics come from the held-out test split, used once.">Validation vs test metrics</CardTitle>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="pb-2">Model</th><th>CV ROC-AUC (validation)</th><th>CV F1 (validation)</th><th>Test ROC-AUC</th></tr></thead>
            <tbody>{Object.entries(m.comparison).map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-2 pr-3">{name(k)}{k === m.selected_model && <span className="ml-2 rounded border border-primary/50 px-1 text-xs text-primary">selected</span>}</td><td>{v.cv_roc_auc == null ? "n/a" : `${v.cv_roc_auc.toFixed(3)} ± ${(v.cv_roc_auc_std ?? 0).toFixed(3)}`}</td><td>{v.cv_f1 == null ? "n/a" : v.cv_f1.toFixed(3)}</td><td>{v.test.roc_auc == null ? "n/a" : v.test.roc_auc.toFixed(3)}</td></tr>)}</tbody></table></div></Card>
        <Card><CardTitle>Final test metrics ({name(m.selected_model)})</CardTitle>
          <dl className="grid grid-cols-2 gap-3 text-sm">{[["Accuracy", pct(m.test.accuracy)], ["Precision", pct(m.test.precision)], ["Recall", pct(m.test.recall)], ["F1-score", pct(m.test.f1)], ["ROC-AUC", m.test.roc_auc == null ? "n/a" : m.test.roc_auc.toFixed(3)], ["Brier score", m.test.brier_score == null ? "n/a" : m.test.brier_score.toFixed(3)]].map(([l, v]) => <div key={l} className="rounded-xl border border-line bg-bg p-3"><dt className="text-xs text-muted">{l}</dt><dd className="text-lg font-bold">{v}</dd></div>)}</dl>
          <p className="mt-3 text-xs text-muted">Accuracy alone can mislead when fake and genuine accounts are imbalanced: a model that labels everything genuine can score high accuracy while catching no fake accounts. Check precision, recall and F1 as well.</p></Card>
        <Card><CardTitle>Random Forest vs Logistic Regression (test split)</CardTitle>
          <table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="pb-2">Metric</th>{Object.keys(m.comparison).map((k) => <th key={k}>{name(k)}</th>)}</tr></thead>
            <tbody>{row("Accuracy", (c) => pct(c.accuracy))}{row("Precision", (c) => pct(c.precision))}{row("Recall", (c) => pct(c.recall))}{row("F1-score", (c) => pct(c.f1))}{row("ROC-AUC", (c) => (c.roc_auc == null ? "n/a" : c.roc_auc.toFixed(3)))}</tbody></table></Card>
        <Card><CardTitle>Confusion matrix (test split)</CardTitle><Matrix t={m.test.confusion_matrix} /></Card>
        <Card><CardTitle>ROC curve</CardTitle>
          <ResponsiveContainer width="100%" height={240}><LineChart data={m.roc_curve}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis dataKey="fpr" type="number" domain={[0, 1]} {...ax} label={{ value: "False positive rate", fill: "#94A3B8", fontSize: 11, dy: 14 }} /><YAxis domain={[0, 1]} {...ax} /><Tooltip {...tip} /><Line dataKey="tpr" name="True positive rate" stroke="#3B82F6" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></Card>
        <Card><CardTitle hint="Permutation importance on the test split: how much ROC-AUC drops when a feature is shuffled. A global view of the model, not an explanation of one profile.">Feature importance</CardTitle>
          <ResponsiveContainer width="100%" height={260}><BarChart layout="vertical" data={m.feature_importance.slice(0, 10).map((f) => ({ name: FEATURE_LABEL[f.feature] ?? f.feature, value: +f.importance.toFixed(4) }))} margin={{ left: 40 }}><CartesianGrid stroke="#26324B" strokeDasharray="3 3" /><XAxis type="number" {...ax} /><YAxis type="category" dataKey="name" width={130} {...ax} /><Tooltip {...tip} /><Bar dataKey="value" fill="#8B5CF6" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></Card>
        <Card><CardTitle>Score reliability <Tip text="Compares the average model score in each bin with the share of fake accounts actually observed in that bin on the test split. Close values suggest a reliable score." /></CardTitle>
          <table className="w-full text-left text-sm"><thead className="text-xs text-muted"><tr><th className="pb-2">Score bin</th><th>Profiles</th><th>Mean score</th><th>Observed fake rate</th></tr></thead>
            <tbody>{m.reliability.map((r) => <tr key={r.bin} className="border-t border-line"><td className="py-1.5">{r.bin}</td><td>{r.n}</td><td>{pct(r.mean_score)}</td><td>{pct(r.observed_rate)}</td></tr>)}</tbody></table></Card>
      </div>
      <Card><CardTitle>Model limitations</CardTitle><ul className="ml-5 list-disc space-y-1 text-sm text-muted">{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Card>
      <TrainPanel onDone={reload} />
    </div>
  );
}
