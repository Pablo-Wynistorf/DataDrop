import React from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import FileDownload from "../pages/FileDownload.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FileDownload />
  </React.StrictMode>
);
