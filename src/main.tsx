import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollToTop from "./components/ScrollToTop";
import Account from "./pages/Account";
import AdminLogin from "./pages/AdminLogin";
import AdminMembers from "./pages/AdminMembers";
import AdminReservations from "./pages/AdminReservations";
import AdminSettings from "./pages/AdminSettings";
import AdminStats from "./pages/AdminStats";
import Auth from "./pages/Auth";
import Faq from "./pages/Faq";
import Home from "./pages/Home";
import PaymentFail from "./pages/PaymentFail";
import PaymentSuccess from "./pages/PaymentSuccess";
import Privacy from "./pages/Privacy";
import Reserve from "./pages/Reserve";
import Terms from "./pages/Terms";
import { initAnalytics } from "./lib/analytics";
import "./styles/globals.css";

initAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ScrollToTop />
        <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Auth />} />
          <Route path="account" element={<Account />} />
          <Route path="reserve" element={<Reserve />} />
          <Route path="faq" element={<Faq />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="payment/success" element={<PaymentSuccess />} />
          <Route path="payment/fail" element={<PaymentFail />} />
          <Route path="admin" element={<AdminLogin />} />
          <Route path="admin/members" element={<AdminMembers />} />
          <Route path="admin/reservations" element={<AdminReservations />} />
          <Route path="admin/settings" element={<AdminSettings />} />
          <Route path="admin/stats" element={<AdminStats />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
