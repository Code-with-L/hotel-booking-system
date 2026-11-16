/**
 * App entry point. The prerendered shell (static routes) is real HTML with the
 * content already in place. React 19's createRoot render replaces it — inside a
 * flushSync so the swap happens before first paint (no blank flash).
 * (Hydrating React Router's lazy routes synchronously is impossible — the lazy
 * modules are async — so hydrateRoot would mismatch and duplicate the tree.)
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "./styles/index.css";
import App from "./app/App.jsx";

const rootEl = document.getElementById("root");
flushSync(() => {
  createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
