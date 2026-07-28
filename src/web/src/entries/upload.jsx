import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { ToastProvider } from "../components/Toast.jsx";
import PublicUpload from "../pages/PublicUpload.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <PublicUpload />
    </ToastProvider>
  </React.StrictMode>
);
