/** App entry point. Hydrates the prerendered shell when present, otherwise renders from scratch. */
import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./app/App.jsx";

const rootEl = document.getElementById("root");
if (rootEl && rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, <React.StrictMode><App /></React.StrictMode>);
} else {
  createRoot(rootEl).render(<React.StrictMode><App /></React.StrictMode>);
}
