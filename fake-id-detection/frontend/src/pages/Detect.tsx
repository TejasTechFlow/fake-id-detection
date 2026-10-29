import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Download, FileText, RotateCcw, Save, ScanSearch, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardTitle, ErrorBanner, Field, Notice, inputCls, useToast } from "@/components/ui";
import ResultView from "@/components/ResultView";
import { api, ApiError } from "@/services/api";
import type { Analysis } from "@/types";

const LIMITS = { account_age_days: 40000, followers: 5_000_000_000, following: 10_000_000, posts: 10_000_000 };
const num = (max: number, label: string) =>
  z.string().trim().refine((v) => v === "" || /^\d+$/.test(v), `${label} must be a whole number, 0 or greater`)
    .refine((v) => v === "" || Number(v) <= max, `${label} is unreasonably large (max ${max.toLocaleString()})`);

const schema = z.object({
  platform: z.enum(["Instagram", "Facebook", "X", "LinkedIn", "Other"]),
  profile_ref: z.string().trim().min(1, "Enter a username, profile URL or reference").max(200, "Keep it under 200 characters")
    .refine((v) => !/[<>\u0000-\u001f]/.test(v), "Remove angle brackets and control characters"),
  account_age_days: num(LIMITS.account_age_days, "Account age"),
  followers: num(LIMITS.followers, "Followers"),
  following: num(LIMITS.following, "Following"),
  posts: num(LIMITS.posts, "Posts"),
  has_profile_pic: z.enum(["yes", "no", "unknown"]),
  has_bio: z.enum(["yes", "no", "unknown"]),
  verified: z.enum(["verified", "not_verified", "unknown"]),
  activity_level: z.enum(["low", "medium", "high", "unknown"]),
  data_source: z.enum(["Publicly available authorized data", "Manually entered data", "Academic dataset", "Other"]),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { platform: "Instagram", profile_ref: "", account_age_days: "", followers: "", following: "", posts: "",
  has_profile_pic: "unknown", has_bio: "unknown", verified: "unknown", activity_level: "unknown", data_source: "Manually entered data" };
const SAMPLE: FormValues = { platform: "Instagram", profile_ref: "demo_sample_profile", account_age_days: "21", followers: "14", following: "1250", posts: "2",
  has_profile_pic: "no", has_bio: "no", verified: "not_verified", activity_level: "high", data_source: "Manually entered data" };

const toInt = (v: string) => (v === "" ? null : Number(v));

export default function Detect() {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const toast = useToast(); const nav = useNavigate();

  const [fo, fi] = watch(["followers", "following"]);
  const ratio = useMemo(() => {
    if (!/^\d+$/.test(fo) || !/^\d+$/.test(fi)) return "Enter followers and following";
    if (Number(fi) === 0) return Number(fo) === 0 ? "0 (no followers, no following)" : "Not defined (following is 0)";
    return (Number(fo) / Number(fi)).toFixed(2);
  }, [fo, fi]);

  const payloadOf = (v: FormValues) => ({ ...v, account_age_days: toInt(v.account_age_days), followers: toInt(v.followers), following: toInt(v.following), posts: toInt(v.posts), is_demo: isDemo });

  const run = async (payload: Record<string, unknown>, save: boolean) => {
    setBusy(true); setError(null);
    try { const r = await api.analyze(payload, save); setResult(r); setLastPayload(payload); if (save) toast("success", `Saved as ${r.scan_id}`); return r; }
    catch (e) { const m = e instanceof ApiError ? e.message : "Analysis failed."; setError(m); toast("error", m); return null; }
    finally { setBusy(false); }
  };
  const onSubmit = handleSubmit((v) => { setResult(null); return run(payloadOf(v), false); });

  const ensureSaved = async () => {
    if (result?.scan_id) return result.scan_id;
    const r = lastPayload ? await run(lastPayload, true) : null;
    return r?.scan_id ?? null;
  };
  const exportAs = async (fmt: "pdf" | "csv") => { const id = await ensureSaved(); if (id) await api.download(`/api/reports/${id}?format=${fmt}`, `${id}.${fmt}`).catch((e: Error) => toast("error", e.message)); };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Analyze Social Media Profile</CardTitle>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Platform"><select {...register("platform")} className={inputCls}>{["Instagram", "Facebook", "X", "LinkedIn", "Other"].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Username or profile reference" error={errors.profile_ref?.message} hint="Entering a username does not give this tool access to platform data. You supply the details below yourself.">
            <input {...register("profile_ref")} className={inputCls} placeholder="@handle, profile URL or any reference" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account age (days)" error={errors.account_age_days?.message}><input {...register("account_age_days")} inputMode="numeric" className={inputCls} placeholder="Leave blank if unknown" /></Field>
            <Field label="Posts" error={errors.posts?.message}><input {...register("posts")} inputMode="numeric" className={inputCls} placeholder="Leave blank if unknown" /></Field>
            <Field label="Followers" error={errors.followers?.message}><input {...register("followers")} inputMode="numeric" className={inputCls} placeholder="Leave blank if unknown" /></Field>
            <Field label="Following" error={errors.following?.message}><input {...register("following")} inputMode="numeric" className={inputCls} placeholder="Leave blank if unknown" /></Field>
          </div>
          <p className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"><span className="text-muted">Followers-to-following ratio: </span><span className="font-medium">{ratio}</span></p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Profile has a picture"><select {...register("has_profile_pic")} className={inputCls}><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option></select></Field>
            <Field label="Bio is present"><select {...register("has_bio")} className={inputCls}><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option></select></Field>
            <Field label="Verified account status" tip="Lack of verification does not mean an account is fake; most genuine accounts are not verified."><select {...register("verified")} className={inputCls}><option value="verified">Verified</option><option value="not_verified">Not verified</option><option value="unknown">Unknown</option></select></Field>
            <Field label="Recent activity frequency"><select {...register("activity_level")} className={inputCls}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="unknown">Unknown</option></select></Field>
          </div>
          <Field label="Account data source"><select {...register("data_source")} className={inputCls}>{["Publicly available authorized data", "Manually entered data", "Academic dataset", "Other"].map((s) => <option key={s}>{s}</option>)}</select></Field>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" loading={busy}><ScanSearch className="h-4 w-4" />{busy ? "Analyzing..." : "Analyze Profile"}</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { reset(EMPTY); setResult(null); setError(null); setIsDemo(false); }}><RotateCcw className="h-4 w-4" />Reset Form</Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { reset(SAMPLE); setIsDemo(true); setResult(null); }}><Sparkles className="h-4 w-4" />Load Sample Data</Button>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {busy && !result ? (
          <Card className="grid place-items-center py-16 text-center" glass>
            <div className="h-1.5 w-56 overflow-hidden rounded bg-line" role="progressbar" aria-label="Analyzing profile">
              <motion.div className="h-full w-1/3 rounded bg-gradient-to-r from-primary to-accent" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} />
            </div>
            <p className="mt-4 text-sm text-muted">Analyzing profile features with the trained model...</p>
          </Card>
        ) : result ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <ResultView r={result} actions={<>
              <Button variant="secondary" disabled={result.saved || busy} onClick={() => lastPayload && run(lastPayload, true)}><Save className="h-4 w-4" />{result.saved ? "Saved to history" : "Save to Scan History"}</Button>
              <Button variant="secondary" disabled={busy} onClick={async () => { const id = await ensureSaved(); if (id) nav(`/report/${id}`); }}><FileText className="h-4 w-4" />View Full Report</Button>
              <Button variant="secondary" disabled={busy} onClick={() => exportAs("pdf")}><Download className="h-4 w-4" />Export PDF</Button>
              <Button variant="secondary" disabled={busy} onClick={() => exportAs("csv")}><Download className="h-4 w-4" />Download CSV</Button>
              <Button variant="ghost" onClick={() => { reset(EMPTY); setResult(null); setIsDemo(false); }}>Analyze Another Profile</Button>
            </>} />
          </motion.div>
        ) : (
          <Card glass className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="relative grid h-20 w-20 place-items-center rounded-3xl border border-line bg-bg">
              <UserRound className="h-9 w-9 text-muted" aria-hidden /><ShieldCheck className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-card p-1 text-primary" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold">Ready to Analyze</h2>
            <p className="max-w-sm text-sm text-muted">Enter what you know about a profile. The trained model scores the available features, shows which fields influenced the score, and lists what is missing.</p>
            <Notice>Unknown values are fine. Leave a field blank or choose Unknown rather than guessing.</Notice>
          </Card>
        )}
      </div>
    </div>
  );
}
