import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { LoginRoute } from "./components/auth/LoginRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./context/AuthContext";
import { AppDetailLayout } from "./pages/app-detail/AppDetailLayout";
import { AppDetailOverview } from "./pages/app-detail/AppDetailOverview";
import { AppDetailPods } from "./pages/app-detail/AppDetailPods";
import { AppDetailLogs } from "./pages/app-detail/AppDetailLogs";
import { AppDetailSettings } from "./pages/app-detail/AppDetailSettings";
import { AppsPage } from "./pages/AppsPage";
import { BoomPage } from "./pages/BoomPage";
import { ErrorPage } from "./pages/ErrorPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const devRoutes = import.meta.env.DEV
  ? [{ path: "__boom", element: <BoomPage /> }]
  : [];

export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <ErrorPage />,
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      { path: "login", element: <LoginRoute /> },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <Navigate to="/apps" replace /> },
          {
            element: <AppShell />,
            errorElement: <ErrorPage />,
            children: [
              { path: "apps", element: <AppsPage /> },
              {
                path: "apps/:name",
                element: <AppDetailLayout />,
                errorElement: <ErrorPage />,
                children: [
                  { index: true, element: <AppDetailOverview /> },
                  { path: "pods", element: <AppDetailPods /> },
                  { path: "logs", element: <AppDetailLogs /> },
                  { path: "settings", element: <AppDetailSettings /> },
                  { path: "*", element: <NotFoundPage /> },
                ],
              },
              ...devRoutes,
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
