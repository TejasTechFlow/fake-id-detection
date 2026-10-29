import { useState } from "react";
import { Button, Card, CardTitle, Field, Notice, inputCls, useToast } from "@/components/ui";
import { getBaseUrl, setAdminToken, setBaseUrl } from "@/services/api";
import { useTheme } from "@/hooks/useTheme";

export default function SettingsPage() {
  const { theme, toggle } = useTheme();
  const [url, setUrl] = useState(getBaseUrl());
  const [token, setToken] = useState(sessionStorage.getItem("cs_admin_token") ?? "");
  const toast = useToast();
  return (
    <div className="grid max-w-3xl gap-4">
      <Card><CardTitle>Appearance</CardTitle>
        <div className="flex items-center justify-between text-sm"><span>Current theme: {theme === "dark" ? "Dark" : "Light"}</span><Button variant="secondary" onClick={toggle}>Switch theme</Button></div></Card>
      <Card><CardTitle>Backend connection</CardTitle>
        <Field label="API base URL" hint="Default is http://localhost:8000. Saved in this browser only."><input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Button className="mt-3" onClick={() => { setBaseUrl(url); toast("success", "API URL saved. Reload the page to apply."); }}>Save URL</Button></Card>
      <Card><CardTitle>Training access</CardTitle>
        <p className="mb-3 text-sm text-muted">Only needed if the backend sets ADMIN_TOKEN. The token is kept in session storage and cleared when you close the tab.</p>
        <Field label="Admin token"><input type="password" autoComplete="off" className={inputCls} value={token} onChange={(e) => setToken(e.target.value)} /></Field>
        <Button className="mt-3" onClick={() => { setAdminToken(token); toast("success", "Admin token stored for this session."); }}>Save token</Button></Card>
      <Notice>Scan history lives in the local SQLite database. Delete entries from the Scan History page. No social media passwords, cookies or private messages are ever collected.</Notice>
    </div>
  );
}
