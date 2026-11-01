import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { LoginRoute } from "./components/auth/LoginRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./context/AuthContext";
import { AppDetailPage } from "./pages/AppDetailPage";
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
              { path: "apps/:name", element: <AppDetailPage /> },
              ...devRoutes,
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
