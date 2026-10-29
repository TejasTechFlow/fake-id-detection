import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardTitle, Notice, RiskBadge, RiskGauge } from "@/components/ui";
import { fmtDate } from "@/utils/format";
import type { RiskCategory, Factor } from "@/types";

export interface ResultData {
  profile_ref: string; platform: string; scan_id: string | null; analyzed_at: string; prediction: string;
  risk_category: RiskCategory; risk_score: number; score_type: string; model_version: string; model_name: string;
  warnings: string[]; contributing_factors: Factor[]; missing_fields: string[]; what_to_verify: string[]; disclaimer: string;
  thresholds: { lower_max: number; moderate_max: number };
}

export default function ResultView({ r, actions }: { r: ResultData; actions?: ReactNode }) {
  const { lower_max: lo, moderate_max: mo } = r.thresholds;
  const maxImpact = Math.max(1, ...r.contributing_factors.map((f) => Math.abs(f.impact)));
  return (
    <div className="space-y-4">
      <Card glass>
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-muted">Profile</dt><dd className="break-all font-medium">{r.profile_ref}</dd></div>
          <div><dt className="text-muted">Platform</dt><dd className="font-medium">{r.platform}</dd></div>
          <div><dt className="text-muted">Scan ID</dt><dd className="font-medium">{r.scan_id ?? "Not saved yet"}</dd></div>
          <div><dt className="text-muted">Analyzed</dt><dd className="font-medium">{fmtDate(r.analyzed_at)}</dd></div>
        </dl>
      </Card>

      <Card>
        <CardTitle hint="The score is 100 x the model's output for the 'fake' class. Unless the model was calibrated, it is a relative score, not a probability.">Risk assessment</CardTitle>
        {r.risk_category === "insufficient" ? (
          <p className="py-4 text-center text-sm text-muted">Too few fields were provided to produce a risk score. Add more profile details and analyze again.</p>
        ) : <RiskGauge score={r.risk_score} category={r.risk_category} lowMax={lo} modMax={mo} />}
        <div className="mt-2 flex flex-col items-center gap-2">
          <RiskBadge category={r.risk_category} label={r.prediction} />
          <p className="text-xs text-muted">Score type: {r.score_type} · Model {r.model_name.replace("_", " ")} ({r.model_version})</p>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Lower 0-{lo} · Moderate {lo + 1}-{mo} · Higher {mo + 1}-100. These are configurable demonstration thresholds and need validation against real-world data before any operational use.
        </p>
      </Card>

      <Card>
        <CardTitle hint="Impact is the estimated change in the 0-100 score caused by that field, compared with a typical profile in the training data (occlusion analysis).">Contributing factors</CardTitle>
        {r.contributing_factors.length === 0 ? (
          <p className="text-sm text-muted">No single provided field moved the score noticeably.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {r.contributing_factors.map((f) => (
              <li key={f.feature} className="rounded-xl border border-line bg-bg p-3 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{f.label}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    {f.impact > 0 ? <ArrowUpRight className="h-3.5 w-3.5 text-danger" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5 text-success" aria-hidden />}
                    {f.impact > 0 ? "Raises risk" : "Lowers risk"} ({f.impact > 0 ? "+" : ""}{f.impact})
                  </span>
                </div>
                <div className="mb-2 h-1.5 rounded bg-line"><div className="h-1.5 rounded bg-primary" style={{ width: `${(Math.abs(f.impact) / maxImpact) * 100}%` }} /></div>
                <p className="text-xs text-muted">{f.explanation}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Explanation</CardTitle>
        <div className="space-y-3 text-sm">
          <p><span className="font-medium">Why this result: </span>
            {r.risk_category === "insufficient" ? "Not enough fields were supplied for an assessment."
              : `The trained model scored the supplied fields at ${r.risk_score} out of 100, which falls in the "${r.prediction}" band.`}</p>
          <p><span className="font-medium">Fields used: </span>{r.contributing_factors.length ? r.contributing_factors.map((f) => f.label).join(", ") : "none had a noticeable influence"}.</p>
          <p><span className="font-medium">Missing information: </span>{r.missing_fields.length ? r.missing_fields.map((m) => m.replace(/_/g, " ")).join(", ") : "none"}.</p>
          <div><p className="font-medium">What a reviewer should verify next</p>
            <ul className="ml-5 list-disc text-muted">{r.what_to_verify.map((v) => <li key={v}>{v}</li>)}</ul></div>
        </div>
        {r.warnings.length > 0 && <div className="mt-4 space-y-2">{r.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}</div>}
        <div className="mt-4"><Notice>{r.disclaimer}</Notice></div>
      </Card>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
