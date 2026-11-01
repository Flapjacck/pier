import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
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
]);
