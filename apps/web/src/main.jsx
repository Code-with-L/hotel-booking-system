/**
 * App entry point. The prerendered shell (static routes) is real HTML with the
 * content already in place; the client discards it and renders fresh.
 * (Hydrating React Router's lazy routes synchronously is impossible — the lazy
 * modules are async — so hydration would mismatch and duplicate the tree.)
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./app/App.jsx";

const rootEl = document.getElementById("root");
if (rootEl && rootEl.hasChildNodes()) {
  rootEl.textContent = ""; // hand over to the client render without hydration
}
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
