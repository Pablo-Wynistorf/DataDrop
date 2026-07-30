import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { ToastProvider } from "../components/Toast.jsx";
import Admin from "../pages/Admin.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <Admin />
    </ToastProvider>
  </React.StrictMode>
);
