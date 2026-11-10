/**
 * Vite entry point (for the exported, standalone build).
 * In the Next.js preview shell this file is not used — see src/app/SpaRoot.tsx.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";
import App from "./app/App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
