export type RiskCategory = "lower" | "moderate" | "higher" | "insufficient";

export interface Factor {
  feature: string; label: string; value: string | number | null; impact: number;
  direction: "increases_risk" | "decreases_risk"; explanation: string;
}
export interface Analysis {
  prediction: string; risk_category: RiskCategory; risk_score: number; score_type: string;
  model_version: string; model_name: string; features_used: string[]; missing_fields: string[];
  contributing_factors: Factor[]; warnings: string[]; what_to_verify: string[]; disclaimer: string;
  profile_ref: string; platform: string; scan_id: string | null; analyzed_at: string; saved: boolean;
  thresholds: { lower_max: number; moderate_max: number };
}
export interface ScanSummary {
  scan_id: string; profile_ref: string; platform: string; prediction: string; risk_category: RiskCategory;
  risk_score: number; model_version: string; is_demo: boolean; data_source: string; created_at: string;
}
export interface ScanDetail extends ScanSummary {
  input: Record<string, string | number | null>; result: Omit<Analysis, "profile_ref" | "platform" | "scan_id" | "analyzed_at" | "saved">;
}
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface Health {
  status: string; version: string; model_available: boolean; model_version: string | null;
  is_synthetic_model: boolean; demo_message: string | null;
}
export interface Importance { feature: string; importance: number }
export interface Dashboard {
  total: number; flagged: number; lower_risk: number; insufficient: number; average_score: number | null;
  trend_total_pct: number | null; daily_scans: { date: string; scans: number }[];
  risk_distribution: Record<RiskCategory, number>; prediction_counts: Record<string, number>;
  feature_importance: Importance[]; model_available: boolean;
}
export interface AnalyticsData {
  total: number; daily: { date: string; scans: number }[]; weekly: { week_start: string; scans: number }[];
  prediction_distribution: Record<string, number>; platform_distribution: Record<string, number>;
  risk_histogram: { range: string; count: number }[]; risk_categories: Record<RiskCategory, number>;
  feature_importance: Importance[]; class_balance: { genuine: number; fake: number } | null;
  thresholds: { lower_max: number; moderate_max: number };
}
export interface Cls { accuracy: number; precision: number; recall: number; f1: number; roc_auc: number | null;
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number }; brier_score?: number }
export interface Metrics {
  model_version: string; selected_model: string; selection_basis: string; trained_at: string; dataset_name: string;
  is_synthetic: boolean; dataset: { rows: number; train_rows: number; test_rows: number; class_distribution: { genuine: number; fake: number } };
  split_method: string; n_features: number; features: string[]; calibrated: boolean;
  comparison: Record<string, { cv_roc_auc: number | null; cv_roc_auc_std?: number; cv_f1: number | null; cv_folds?: number; test: Cls }>;
  test: Cls; roc_curve: { fpr: number; tpr: number }[];
  reliability: { bin: string; n: number; mean_score: number; observed_rate: number }[];
  feature_importance: Importance[]; warnings: string[]; limitations: string[];
}
export interface BatchResult {
  total_rows: number; analyzed: number; error_count: number; model_version: string;
  errors: { row_number: number; reason: string }[];
  counts: Record<RiskCategory, number>;
  results: { row_number: number; scan_id: string | null; profile_ref: string; platform: string; prediction: string;
    risk_category: RiskCategory; risk_score: number; top_factor: string | null }[];
}
