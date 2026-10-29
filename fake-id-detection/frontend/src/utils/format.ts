import type { RiskCategory } from "@/types";

export const CATEGORY_LABEL: Record<RiskCategory, string> = {
  lower: "Lower Risk", moderate: "Moderate Risk", higher: "Higher Risk", insufficient: "Insufficient Information",
};
export const CATEGORY_HEX: Record<RiskCategory, string> = {
  lower: "#22C55E", moderate: "#F59E0B", higher: "#EF4444", insufficient: "#94A3B8",
};
export const FEATURE_LABEL: Record<string, string> = {
  account_age_days: "Account age", followers: "Followers", following: "Following", posts: "Posts",
  followers_following_ratio: "Followers/following ratio", posts_per_day: "Posts per day", log_followers: "Followers (log)",
  log_following: "Following (log)", has_profile_pic: "Profile picture", has_bio: "Bio", verified: "Verification", activity_level: "Activity",
};
export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "-");
export const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // prevent spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export function saveText(text: string, filename: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

/** Small RFC-4180 style CSV parser (quotes, escaped quotes, CRLF). Runs entirely in the browser. */
export function parseCsv(text: string, maxRows: number): { headers: string[]; rows: string[][] } {
  const out: string[][] = []; let row: string[] = []; let cur = ""; let q = false;
  const t = text.replace(/^\ufeff/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x !== "")) out.push(row); row = []; if (out.length > maxRows + 1) break; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x !== "")) out.push(row); }
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows };
}
