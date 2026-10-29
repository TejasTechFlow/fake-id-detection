import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button, ErrorBanner, Notice, Skeleton } from "@/components/ui";
import ResultView from "@/components/ResultView";
import { useFetch } from "@/hooks/useApi";
import { api } from "@/services/api";
import { useToast } from "@/components/ui";

export default function Report() {
  const { scanId = "" } = useParams();
  const { data, error, loading } = useFetch(() => api.scan(scanId), [scanId]);
  const toast = useToast();
  if (loading) return <Skeleton className="h-96" />;
  if (error || !data) return <ErrorBanner message={error ?? "Scan not found."} />;
  const dl = (f: "pdf" | "csv") => api.download(`/api/reports/${scanId}?format=${f}`, `${scanId}.${f}`).catch((e: Error) => toast("error", e.message));
  return (
    <div className="space-y-4">
      <Link to="/history" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" />Back to Scan History</Link>
      <Notice>This is a saved model assessment, not a verified fraud report. {data.is_demo && "This scan used demonstration data."}</Notice>
      <ResultView
        r={{ ...data.result, profile_ref: data.profile_ref, platform: data.platform, scan_id: data.scan_id, analyzed_at: data.created_at,
          prediction: data.prediction, risk_category: data.risk_category, risk_score: data.risk_score }}
        actions={<><Button variant="secondary" onClick={() => dl("pdf")}><Download className="h-4 w-4" />Export PDF</Button><Button variant="secondary" onClick={() => dl("csv")}><Download className="h-4 w-4" />Download CSV</Button></>} />
    </div>
  );
}
