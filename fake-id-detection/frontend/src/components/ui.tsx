import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, HelpCircle, Info, Loader2, ShieldAlert, ShieldCheck, X, XCircle } from "lucide-react";
import type { RiskCategory } from "@/types";
import { CATEGORY_HEX, CATEGORY_LABEL } from "@/utils/format";

/* ---------- Buttons & cards ---------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean };
export function Button({ variant = "primary", loading, className, children, disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-primary text-white hover:bg-blue-500",
    secondary: "border border-line bg-card text-ink hover:border-primary/60",
    ghost: "text-muted hover:bg-line/40 hover:text-ink",
    danger: "bg-danger text-white hover:bg-red-500",
  }[variant];
  return (
    <button {...rest} disabled={disabled || loading}
      className={clsx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50", styles, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
export function Card({ className, children, glass }: { className?: string; children: ReactNode; glass?: boolean }) {
  return <section className={clsx("rounded-card border border-line bg-card p-5 shadow-card", glass && "glass", className)}>{children}</section>;
}
export const CardTitle = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">{children}{hint && <Tip text={hint} />}</h3>
);

/* ---------- Tooltip (keyboard accessible) ---------- */
export function Tip({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-describedby={id} className="rounded-full text-muted hover:text-ink"><HelpCircle className="h-4 w-4" aria-label="More information" /></button>
      <span id={id} role="tooltip" className="pointer-events-none absolute left-1/2 top-6 z-30 hidden w-60 -translate-x-1/2 rounded-lg border border-line bg-sidebar p-2 text-xs font-normal text-ink shadow-card group-focus-within:block group-hover:block">{text}</span>
    </span>
  );
}

/* ---------- Risk badge: icon + text, never colour alone ---------- */
const ICON = { lower: ShieldCheck, moderate: AlertTriangle, higher: ShieldAlert, insufficient: HelpCircle };
export function RiskBadge({ category, label }: { category: RiskCategory; label?: string }) {
  const Icon = ICON[category]; const hex = CATEGORY_HEX[category];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ borderColor: hex + "88", color: hex, background: hex + "18" }}>
      <Icon className="h-3.5 w-3.5" aria-hidden />{label ?? CATEGORY_LABEL[category]}
    </span>
  );
}

/* ---------- Skeleton, empty and error states ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={clsx("animate-pulse rounded-lg bg-line/60", className)} />;
export function EmptyState({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-bg text-primary">{icon ?? <Info className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-md text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/50 bg-danger/10 p-4 text-sm">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div className="flex-1">{message}</div>
      {onRetry && <Button variant="secondary" onClick={onRetry} className="py-1">Retry</Button>}
    </div>
  );
}
export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div role="note" className={clsx("flex items-start gap-3 rounded-xl border p-3 text-sm", tone === "warn" ? "border-warn/50 bg-warn/10" : "border-primary/40 bg-primary/10")}>
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", tone === "warn" ? "text-warn" : "text-primary")} aria-hidden /><div>{children}</div>
    </div>
  );
}

/* ---------- Modal (confirm dialogs) ---------- */
export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey); ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="glass w-full max-w-md rounded-card border border-line p-6 shadow-card">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-muted hover:text-ink"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, title, text, confirmLabel = "Delete", onConfirm, onClose }:
  { open: boolean; title: string; text: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mb-5 text-sm text-muted">{text}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className="glass flex items-start gap-2 rounded-xl border border-line p-3 text-sm shadow-card">
            {t.tone === "success" ? <CheckCircle2 className="h-4 w-4 text-success" /> : t.tone === "error" ? <XCircle className="h-4 w-4 text-danger" /> : <Info className="h-4 w-4 text-primary" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Pagination ---------- */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted">
      <span>{total === 0 ? "No records" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" className="px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {page} of {pages}</span>
        <Button variant="secondary" className="px-2 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ---------- Risk gauge (semicircle) ---------- */
export function RiskGauge({ score, category, lowMax, modMax }: { score: number; category: RiskCategory; lowMax: number; modMax: number }) {
  const R = 80, C = Math.PI * R;
  const arc = (from: number, to: number, color: string) => {
    const a = (v: number) => Math.PI * (1 - v / 100);
    const p = (v: number) => `${100 + R * Math.cos(a(v))} ${100 - R * Math.sin(a(v))}`;
    return <path d={`M ${p(from)} A ${R} ${R} 0 0 1 ${p(to)}`} stroke={color} strokeWidth="14" fill="none" opacity="0.28" />;
  };
  const ang = Math.PI * (1 - score / 100);
  return (
    <figure className="mx-auto w-64" aria-label={`Risk score ${score} out of 100, ${CATEGORY_LABEL[category]}`}>
      <svg viewBox="0 0 200 120" role="img">
        {arc(0, lowMax, CATEGORY_HEX.lower)}{arc(lowMax, modMax, CATEGORY_HEX.moderate)}{arc(modMax, 100, CATEGORY_HEX.higher)}
        <path d={`M 20 100 A ${R} ${R} 0 0 1 ${100 + R * Math.cos(ang)} ${100 - R * Math.sin(ang)}`} stroke={CATEGORY_HEX[category]} strokeWidth="14" fill="none" strokeLinecap="round"
          strokeDasharray={C} className="transition-all duration-700" />
        <text x="100" y="92" textAnchor="middle" fontSize="30" fontWeight="700" fill="currentColor">{Math.round(score)}</text>
        <text x="100" y="112" textAnchor="middle" fontSize="10" fill="rgb(148 163 184)">of 100</text>
      </svg>
    </figure>
  );
}

/* ---------- Form field wrapper ---------- */
export function Field({ label, error, hint, children, tip }: { label: string; error?: string; hint?: string; children: ReactNode; tip?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center gap-1.5 font-medium">{label}{tip && <Tip text={tip} />}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
export const inputCls = "w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted/70 focus:border-primary";
