import { Route, Routes } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import Overview from "@/pages/Overview";
import Detect from "@/pages/Detect";
import Batch from "@/pages/Batch";
import HistoryPage from "@/pages/HistoryPage";
import Analytics from "@/pages/Analytics";
import ModelPerformance from "@/pages/ModelPerformance";
import About from "@/pages/About";
import SettingsPage from "@/pages/SettingsPage";
import Report from "@/pages/Report";

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Overview />} />
        <Route path="detect" element={<Detect />} />
        <Route path="batch" element={<Batch />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="model" element={<ModelPerformance />} />
        <Route path="about" element={<About />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="report/:scanId" element={<Report />} />
        <Route path="*" element={<Overview />} />
      </Route>
    </Routes>
  );
}
