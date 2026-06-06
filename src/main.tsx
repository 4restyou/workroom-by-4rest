import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import AdminLogin from "./pages/AdminLogin";
import AdminReservations from "./pages/AdminReservations";
import Home from "./pages/Home";
import Reserve from "./pages/Reserve";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="reserve" element={<Reserve />} />
          <Route path="admin" element={<AdminLogin />} />
          <Route path="admin/reservations" element={<AdminReservations />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
