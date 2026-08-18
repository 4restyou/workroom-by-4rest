import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import ApplyAppUpdate from "./components/ApplyAppUpdate";
import ErrorBoundary from "./components/ErrorBoundary";
import RequireAdmin from "./components/RequireAdmin";
import ScrollToTop from "./components/ScrollToTop";
import SessionProvider from "./components/SessionProvider";
import Home from "./pages/Home";
import { initAnalytics } from "./lib/analytics";
import { watchForAppUpdate } from "./lib/appUpdate";
import { lazyPage } from "./lib/lazyPage";
import "./styles/globals.css";

// Home stays eager (landing page); everything else is code-split so visitors
// don't download the admin/booking pages up front.
const Account = lazyPage(() => import("./pages/Account"));
const AdminAttendance = lazyPage(() => import("./pages/AdminAttendance"));
const AdminCustomer = lazyPage(() => import("./pages/AdminCustomer"));
const AdminHome = lazyPage(() => import("./pages/AdminHome"));
const AdminLogin = lazyPage(() => import("./pages/AdminLogin"));
const AdminMembers = lazyPage(() => import("./pages/AdminMembers"));
const AdminReservations = lazyPage(() => import("./pages/AdminReservations"));
const AdminSettings = lazyPage(() => import("./pages/AdminSettings"));
const AdminStats = lazyPage(() => import("./pages/AdminStats"));
const Attendance = lazyPage(() => import("./pages/Attendance"));
const Auth = lazyPage(() => import("./pages/Auth"));
const Board = lazyPage(() => import("./pages/Board"));
const CheckIn = lazyPage(() => import("./pages/CheckIn"));
const Directory = lazyPage(() => import("./pages/Directory"));
const DirectoryEdit = lazyPage(() => import("./pages/DirectoryEdit"));
const Faq = lazyPage(() => import("./pages/Faq"));
const PaymentPortone = lazyPage(() => import("./pages/PaymentPortone"));
const Privacy = lazyPage(() => import("./pages/Privacy"));
const Reserve = lazyPage(() => import("./pages/Reserve"));
const ResetPassword = lazyPage(() => import("./pages/ResetPassword"));
const Terms = lazyPage(() => import("./pages/Terms"));

initAnalytics();
watchForAppUpdate();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SessionProvider>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ScrollToTop />
        <ApplyAppUpdate />
        <Routes>
        <Route element={<App />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Auth />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="account" element={<Account />} />
          <Route path="reserve" element={<Reserve />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="directory" element={<Directory />} />
          <Route path="directory/edit" element={<DirectoryEdit />} />
          <Route path="board" element={<Board />} />
          <Route path="faq" element={<Faq />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="payment/portone" element={<PaymentPortone />} />
          <Route path="admin" element={<AdminLogin />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin/dashboard" element={<AdminHome />} />
            <Route path="admin/attendance" element={<AdminAttendance />} />
            <Route path="admin/members" element={<AdminMembers />} />
            <Route path="admin/customer/:profileId" element={<AdminCustomer />} />
            <Route path="admin/reservations" element={<AdminReservations />} />
            <Route path="admin/settings" element={<AdminSettings />} />
            <Route path="admin/stats" element={<AdminStats />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </BrowserRouter>
      </SessionProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
