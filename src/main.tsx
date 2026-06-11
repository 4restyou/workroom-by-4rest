import React, { lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import ScrollToTop from "./components/ScrollToTop";
import Home from "./pages/Home";
import { initAnalytics } from "./lib/analytics";
import "./styles/globals.css";

// Home stays eager (landing page); everything else is code-split so visitors
// don't download the admin/booking pages up front.
const Account = lazy(() => import("./pages/Account"));
const AdminAttendance = lazy(() => import("./pages/AdminAttendance"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminMembers = lazy(() => import("./pages/AdminMembers"));
const AdminReservations = lazy(() => import("./pages/AdminReservations"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminStats = lazy(() => import("./pages/AdminStats"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Auth = lazy(() => import("./pages/Auth"));
const CheckIn = lazy(() => import("./pages/CheckIn"));
const Faq = lazy(() => import("./pages/Faq"));
const PaymentFail = lazy(() => import("./pages/PaymentFail"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Reserve = lazy(() => import("./pages/Reserve"));
const Terms = lazy(() => import("./pages/Terms"));

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
          <Route path="attendance" element={<Attendance />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="faq" element={<Faq />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="payment/success" element={<PaymentSuccess />} />
          <Route path="payment/fail" element={<PaymentFail />} />
          <Route path="admin" element={<AdminLogin />} />
          <Route path="admin/attendance" element={<AdminAttendance />} />
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
