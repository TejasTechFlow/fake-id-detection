import { Card, CardTitle } from "@/components/ui";

const steps = ["Collect an authorized labeled dataset.", "Clean and preprocess the data.", "Engineer relevant features.", "Train machine learning models.", "Evaluate model performance.", "Analyze profile information.", "Generate a risk assessment.", "Explain the result for human review."];
const benefits = ["Faster initial screening", "Consistent feature analysis", "Better understanding of suspicious profile patterns", "Useful educational demonstration of machine learning", "Interactive visual reports"];
const limits = ["Dataset bias can affect results.", "Genuine users may exhibit unusual behavior.", "Fake accounts may imitate genuine users.", "Profile information can be incomplete or outdated.", "The model cannot guarantee the true identity of an account.", "A risk score is not proof of malicious intent."];

export default function About() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card glass className="lg:col-span-2"><CardTitle>Project title</CardTitle><p className="text-xl font-semibold">Fake ID Detection on Social Media Using Machine Learning</p></Card>
      <Card><CardTitle>Problem statement</CardTitle><p className="text-sm text-muted">Fake and automated social media accounts can be used for spam, impersonation, and other harmful activities. Identifying suspicious profiles can be difficult when examining large numbers of accounts manually.</p></Card>
      <Card><CardTitle>Objective</CardTitle><p className="text-sm text-muted">Develop a machine learning system that analyzes available profile attributes and helps identify accounts that may require further review.</p></Card>
      <Card><CardTitle>Methodology</CardTitle><ol className="ml-5 list-decimal space-y-1 text-sm text-muted">{steps.map((s) => <li key={s}>{s}</li>)}</ol></Card>
      <Card><CardTitle>Expected benefits</CardTitle><ul className="ml-5 list-disc space-y-1 text-sm text-muted">{benefits.map((s) => <li key={s}>{s}</li>)}</ul></Card>
      <Card className="lg:col-span-2"><CardTitle>Limitations</CardTitle><ul className="ml-5 list-disc space-y-1 text-sm text-muted">{limits.map((s) => <li key={s}>{s}</li>)}</ul></Card>
    </div>
  );
}
