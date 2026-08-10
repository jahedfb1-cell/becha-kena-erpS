import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Purchases from './pages/Purchases';
import Products from './pages/Products';
import Quotations from './pages/Quotations';
import Orders from './pages/Orders';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import AccessSetup from './pages/AccessSetup';
import VouchersExpenses from './pages/VouchersExpenses';
import CompanyProfile from './pages/CompanyProfile';
import MyProfile from './pages/MyProfile';
import DatabaseBackup from './pages/DatabaseBackup';
import Settings from './pages/Settings';

import QuotationPrintPage from './pages/QuotationPrintPage';
import InvoicePrintPage from './pages/InvoicePrintPage';
import ChallanPrintPage from './pages/ChallanPrintPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Isolated Clean Print Views (No Dashboard background) */}
        <Route
          path="/quotations/print/:id"
          element={
            <ProtectedRoute>
              <QuotationPrintPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id"
          element={
            <ProtectedRoute>
              <InvoicePrintPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/print/:id/challan"
          element={
            <ProtectedRoute>
              <ChallanPrintPage />
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
          
          <Route path="dashboard" element={<Dashboard />} />
          
          <Route path="customers" element={<Customers />} />

          <Route path="suppliers" element={<Suppliers />} />

          <Route path="purchases" element={<Purchases />} />

          <Route path="products" element={<Products />} />
          
          <Route path="quotations" element={<Quotations />} />
          
          <Route path="orders" element={<Orders />} />
          
          <Route path="invoices" element={<Invoices />} />
          
          {/* Admin and Manager only route */}
          <Route
            path="reports"
            element={
              <ProtectedRoute requiredRole="admin" requiredPermission="view-reports">
                <Reports />
              </ProtectedRoute>
            }
          />

          {/* Admin only audit logs route */}
          <Route
            path="audit-logs"
            element={
              <ProtectedRoute requiredRole="admin">
                <AuditLogs />
              </ProtectedRoute>
            }
          />

          {/* Payments route */}
          <Route
            path="payments"
            element={
              <ProtectedRoute>
                <Payments />
              </ProtectedRoute>
            }
          />

          {/* Admin Access / Access Setup & RBAC Matrix route */}
          <Route
            path="access-setup"
            element={
              <ProtectedRoute requiredRole="admin">
                <AccessSetup />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin-access"
            element={
              <ProtectedRoute requiredRole="admin">
                <AccessSetup />
              </ProtectedRoute>
            }
          />

          {/* Database Backup route */}
          <Route
            path="database-backup"
            element={
              <ProtectedRoute requiredRole="admin">
                <DatabaseBackup />
              </ProtectedRoute>
            }
          />

          {/* Setting Hub route */}
          <Route
            path="settings"
            element={
              <ProtectedRoute requiredRole="admin">
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Vouchers & Expenses route */}
          <Route
            path="vouchers-expenses"
            element={
              <ProtectedRoute>
                <VouchersExpenses />
              </ProtectedRoute>
            }
          />

          {/* Company Profile — admin only */}
          <Route
            path="company-profile"
            element={
              <ProtectedRoute requiredRole="admin">
                <CompanyProfile />
              </ProtectedRoute>
            }
          />
          {/* My Profile — available to all logged in users */}
          <Route
            path="my-profile"
            element={
              <ProtectedRoute>
                <MyProfile />
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
