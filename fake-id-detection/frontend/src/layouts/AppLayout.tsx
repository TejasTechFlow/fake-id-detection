import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { BarChart3, BrainCircuit, ChevronRight, FileSpreadsheet, History, Info, LayoutDashboard, Menu, Moon, ScanSearch, Search, Settings, Sun, X } from "lucide-react";
import { api } from "@/services/api";
import { useTheme } from "@/hooks/useTheme";
import type { Health } from "@/types";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/detect", label: "Detect Fake ID", icon: ScanSearch },
  { to: "/batch", label: "Batch Analysis", icon: FileSpreadsheet },
  { to: "/history", label: "Scan History", icon: History },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/model", label: "Model Performance", icon: BrainCircuit },
  { to: "/about", label: "About Project", icon: Info },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M12 2.5 4.5 5.5v5.7c0 4.600 3.100 8.200 7.500 10.300 4.400-2.100 7.500-5.700 7.500-10.300V5.500z" />
          <path d="M9 12.500h1.500M13.500 9.500v6M9.500 14.500 11 10l1.500 4.500" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div><p className="font-semibold leading-tight">CyberShield AI</p><p className="text-xs text-muted">Intelligent Profile Analysis</p></div>
    </div>
  );
}

function Status({ health, offline }: { health: Health | null; offline: boolean }) {
  const dot = (ok: boolean) => <span className={clsx("inline-block h-2 w-2 rounded-full", ok ? "bg-success" : "bg-danger")} aria-hidden />;
  return (
    <div className="space-y-1.5 border-t border-line p-4 text-xs text-muted">
      <p className="flex items-center gap-2">{dot(!offline)} Backend: {offline ? "offline" : "connected"}</p>
      <p className="flex items-center gap-2">{dot(!!health?.model_available)} Model: {health?.model_available ? (health.is_synthetic_model ? "demo (synthetic)" : "trained") : "not trained"}</p>
      <p>Version {health?.version ?? "1.0.0"}</p>
    </div>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const { theme, toggle } = useTheme();
  const loc = useLocation(); const nav = useNavigate();
  const current = NAV.find((n) => (n.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(n.to)));
  const title = current?.label ?? (loc.pathname.startsWith("/report") ? "Scan Report" : "CyberShield AI");

  useEffect(() => {
    let alive = true;
    const poll = () => api.health().then((h) => { if (alive) { setHealth(h); setOffline(false); } }).catch(() => alive && setOffline(true));
    poll(); const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  useEffect(() => setOpen(false), [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="p-5"><Logo /></div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              isActive ? "bg-primary/15 text-ink ring-1 ring-primary/40" : "text-muted hover:bg-line/40 hover:text-ink")}>
            <Icon className="h-4 w-4" aria-hidden />{label}
          </NavLink>
        ))}
      </nav>
      <Status health={health} offline={offline} />
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line">
            <button className="absolute right-3 top-3 text-muted" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
            {sidebar}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/80 px-4 py-3 backdrop-blur md:px-8">
        <button className="rounded-lg p-2 text-muted hover:bg-line/40 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted">
            <span>CyberShield AI</span><ChevronRight className="h-3 w-3" aria-hidden /><span>{title}</span>
          </nav>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>
        <form className="relative hidden md:block" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/history?q=${encodeURIComponent(q)}`); }}>
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scan history" aria-label="Search scan history"
            className="w-56 rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-sm" />
        </form>
        <button onClick={toggle} className="rounded-xl border border-line bg-card p-2 text-muted hover:text-ink" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {offline && (
          <div role="alert" className="rounded-xl border border-danger/50 bg-danger/10 p-3 text-sm">
            The backend is not reachable. Start it with <code>uvicorn app.main:app --reload --port 8000</code> from the backend folder, then reload this page.
          </div>
        )}
        {health && (!health.model_available || health.is_synthetic_model) && (
          <div role="note" className="rounded-xl border border-warn/50 bg-warn/10 p-3 text-sm">
            {health.model_available ? health.demo_message : "No trained model found. Open Model Performance to train one (a demonstration dataset is included)."}
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
