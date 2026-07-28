import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { ToastProvider } from "../components/Toast.jsx";
import Dashboard from "../pages/Dashboard.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  </React.StrictMode>
);
