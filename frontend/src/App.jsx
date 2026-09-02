import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

/**
 * Every routed page is lazy — this used to be true only for PriceLists.
 * Before this, /login (which every signed-out visitor, and every Lighthouse
 * mobile run, actually lands on) shipped the JS for all ~25 pages in one
 * bundle before the login form could even paint: confirmed locally via
 * Lighthouse against the production build (`vite preview`) — FCP 3.1s, LCP
 * 5.1s, ~380ms of blocking time, and an `unused-javascript` audit flagging
 * ~318 KiB never touched on that screen. Splitting per route means a
 * visit only ever downloads the page it actually lands on; each one is
 * fetched on demand exactly like PriceLists already was.
 *
 * Login/ForgotPassword/ResetPassword stay eager: they (or a redirect
 * through them) are the literal first screen for almost every visit,
 * signed in or not, so there is no "later" to defer them to. DashboardLayout
 * (the sidebar/header shell) stays eager too, matching the existing
 * PriceLists precedent of lazy-loading page content, not the layout it
 * renders inside.
 */
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Customers = lazy(() => import('./pages/Customers'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Purchases = lazy(() => import('./pages/Purchases'));
const Products = lazy(() => import('./pages/Products'));
const Quotations = lazy(() => import('./pages/Quotations'));
const PriceLists = lazy(() => import('./pages/PriceLists'));
const Orders = lazy(() => import('./pages/Orders'));
const Invoices = lazy(() => import('./pages/Invoices'));
const Mushak = lazy(() => import('./pages/Mushak'));
const Payments = lazy(() => import('./pages/Payments'));
const MyDues = lazy(() => import('./pages/MyDues'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Reports = lazy(() => import('./pages/Reports'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const AccessSetup = lazy(() => import('./pages/AccessSetup'));
const VouchersExpenses = lazy(() => import('./pages/VouchersExpenses'));
const CompanyProfile = lazy(() => import('./pages/CompanyProfile'));
const MyProfile = lazy(() => import('./pages/MyProfile'));
const DatabaseBackup = lazy(() => import('./pages/DatabaseBackup'));
const Settings = lazy(() => import('./pages/Settings'));

// Standalone print views — each one is its own isolated document (see
// printing-uses-standalone-routes), opened from a link/new-tab rather than
// as part of normal browsing, so deferring them costs nothing on the
// screens people actually land on first.
const QuotationPrintPage = lazy(() => import('./pages/QuotationPrintPage'));
const PvcQuotationPrintPage = lazy(() => import('./pages/PvcQuotationPrintPage'));
const InvoicePrintPage = lazy(() => import('./pages/InvoicePrintPage'));
const PvcInvoicePrintPage = lazy(() => import('./pages/PvcInvoicePrintPage'));
const ChallanPrintPage = lazy(() => import('./pages/ChallanPrintPage'));
const PvcChallanPrintPage = lazy(() => import('./pages/PvcChallanPrintPage'));
const MoneyReceiptPage = lazy(() => import('./pages/MoneyReceiptPage'));
const PriceListPrintPage = lazy(() => import('./pages/PriceListPrintPage'));
const SalesDuePrintPage = lazy(() => import('./pages/SalesDuePrintPage'));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Isolated Clean Print Views (No Dashboard background) */}
        <Route
          path="/price-lists/print/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <PriceListPrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/sales-due/print"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <SalesDuePrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/print/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <QuotationPrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/print/:id/pvc-quotation"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <PvcQuotationPrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <InvoicePrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id/pvc-invoice"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <PvcInvoicePrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id/challan"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <ChallanPrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id/pvc-challan"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <PvcChallanPrintPage />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments/:id/receipt"
          element={
            <ProtectedRoute>
              <Suspense fallback={null}>
                <MoneyReceiptPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected Dashboard Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          {/* Default dashboard redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route
            path="dashboard"
            element={
              <Suspense fallback={null}>
                <Dashboard />
              </Suspense>
            }
          />

          <Route
            path="customers"
            element={
              <Suspense fallback={null}>
                <Customers />
              </Suspense>
            }
          />

          <Route
            path="suppliers"
            element={
              <Suspense fallback={null}>
                <Suppliers />
              </Suspense>
            }
          />

          <Route
            path="purchases"
            element={
              <Suspense fallback={null}>
                <Purchases />
              </Suspense>
            }
          />

          <Route
            path="products"
            element={
              <Suspense fallback={null}>
                <Products />
              </Suspense>
            }
          />

          <Route
            path="quotations"
            element={
              <Suspense fallback={null}>
                <Quotations />
              </Suspense>
            }
          />

          <Route
            path="price-lists"
            element={
              <Suspense fallback={null}>
                <PriceLists />
              </Suspense>
            }
          />

          <Route
            path="orders"
            element={
              <Suspense fallback={null}>
                <Orders />
              </Suspense>
            }
          />

          <Route
            path="invoices"
            element={
              <Suspense fallback={null}>
                <Invoices />
              </Suspense>
            }
          />

          <Route
            path="mushak"
            element={
              <Suspense fallback={null}>
                <Mushak />
              </Suspense>
            }
          />

          {/* Admin and Manager only route */}
          <Route
            path="reports"
            element={
              <ProtectedRoute requiredRole="admin" requiredPermission="view-reports">
                <Suspense fallback={null}>
                  <Reports />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="reports/:reportKey"
            element={
              <ProtectedRoute requiredRole="admin" requiredPermission="view-reports">
                <Suspense fallback={null}>
                  <Reports />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Admin only audit logs route */}
          <Route
            path="audit-logs"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <AuditLogs />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Payments route */}
          <Route
            path="payments"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <Payments />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* My Dues route - scoped server-side by role (own for salesman,
              team for manager, everyone for admin), so no requiredRole
              here; ReportController@salesDue enforces the visibility. */}
          <Route
            path="my-dues"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <MyDues />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Notifications route */}
          <Route
            path="notifications"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <Notifications />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Admin Access / Access Setup & RBAC Matrix route */}
          <Route
            path="access-setup"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <AccessSetup />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="admin-access"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <AccessSetup />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Database Backup route */}
          <Route
            path="database-backup"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <DatabaseBackup />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Setting Hub route */}
          <Route
            path="settings"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <Settings />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Vouchers & Expenses route */}
          <Route
            path="vouchers-expenses"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <VouchersExpenses />
                </Suspense>
              </ProtectedRoute>
            }
          />

          {/* Company Profile — admin only */}
          <Route
            path="company-profile"
            element={
              <ProtectedRoute requiredRole="admin">
                <Suspense fallback={null}>
                  <CompanyProfile />
                </Suspense>
              </ProtectedRoute>
            }
          />
          {/* My Profile — available to all logged in users */}
          <Route
            path="my-profile"
            element={
              <ProtectedRoute>
                <Suspense fallback={null}>
                  <MyProfile />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Fallback Catch-all Route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
