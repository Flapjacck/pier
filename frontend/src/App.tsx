import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { usePierTheme } from "./hooks/usePierTheme";
import { AppsPage } from "./pages/AppsPage";
import { AppDetailPage } from "./pages/AppDetailPage";

/**
 * Root router.
 * /              → redirect to /apps
 * /apps          → Apps list
 * /apps/:name    → App detail
 */
export default function App() {
  // usePierTheme syncs <html data-theme> and returns { theme, toggle }
  // which flows into every page and ultimately into layout + brand components.
  const pierTheme = usePierTheme();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"             element={<Navigate to="/apps" replace />} />
        <Route path="/apps"         element={<AppsPage {...pierTheme} />} />
        <Route path="/apps/:name"   element={<AppDetailPage {...pierTheme} />} />
        {/* Future: /nodes, /logs, /settings */}
      </Routes>
    </BrowserRouter>
  );
}
