import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted font variables (loaded once, body inherits via tokens.css)
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

// Global styles: Tailwind + Pier tokens + components
import "./styles/index.css";

import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
