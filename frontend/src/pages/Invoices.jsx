import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useInvoicesList, invoicesQueryOptions } from '../hooks/useListData';
import { invalidateInvoices, invalidateOrders } from '../api/invalidate';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate, formatDateTime } from '../utils/format';
import PaymentModal from '../components/PaymentModal';
import ChallanPrintModal from '../components/ChallanPrintModal';
import InvoicePrintModal from '../components/InvoicePrintModal';

const Invoices = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list'); // 'list' or 'detail'

  // Archived invoices are a separate server-side list (`?archived=1`), not
  // a client-side filter over the active one — an archived row's own
  // fields (archived_at, archived_by, archive_reason) are what this view
  // exists to show, and Pay/Challan/Archive stop making sense once a row
  // is here, so it gets its own columns and actions further down rather
  // than being folded into the normal table.
  const [showArchived, setShowArchived] = useState(false);
  const { data: invoices, isLoading: loading, error: invoicesError } = useInvoicesList({ archived: showArchived });

  const [error, setError] = useState('');
  
  // Selected Invoice for details view
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Filters & Pagination
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState(15);
  const [currentPage, setCurrentPage] = useState(1);

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Challan Print Modal State
  const [selectedChallanForPrint, setSelectedChallanForPrint] = useState(null);
  const [isChallanPrintModalOpen, setIsChallanPrintModalOpen] = useState(false);

  // Invoice Print Modal State
  const [printingInvoice, setPrintingInvoice] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed'); // 'detailed' | 'simplified' | 'pad-detailed' | 'pad-simplified'

  // Mobile card view: which row's actions menu is currently open
  const [openActionsId, setOpenActionsId] = useState(null);

  // Transfer Payment Modal State
  const [transferModal, setTransferModal] = useState({ open: false, payment: null });
  const [transferInvoiceId, setTransferInvoiceId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [allInvoicesForTransfer, setAllInvoicesForTransfer] = useState([]);

  useEffect(() => {
    if (openActionsId === null) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.invoice-mobile-actions-wrap')) {
        setOpenActionsId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openActionsId]);

  // Refreshes the shared invoice cache after payments/challans/archives.
  const fetchInvoices = useCallback(() => {
    invalidateInvoices(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (invoicesError) setError('Failed to retrieve invoices.');
  }, [invoicesError]);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setFilterSearch(decodeURIComponent(q));
    }
  }, [searchParams]);

  const loadInvoiceDetails = async (id) => {
    try {
      const response = await api.get(`/invoices/${id}`);
      setSelectedInvoice(response.data.data);
      setView('detail');
    } catch (err) {
      alert('Failed to retrieve invoice details.');
    }
  };

  const handleGenerateChallan = async (invoiceId) => {
    if (!confirm('Are you sure you want to generate a Delivery Challan for this invoice?')) return;
    try {
      await api.post(`/challans/generate/${invoiceId}`);
      alert('Delivery Challan generated successfully.');
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        loadInvoiceDetails(invoiceId);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate challan.');
    }
  };

  const handleArchiveInvoice = async (invoiceId) => {
    if (!confirm('Are you sure you want to archive this invoice? Quotation status will be rolled back.')) return;
    try {
      await api.delete(`/invoices/${invoiceId}`);
      alert('Invoice archived successfully.');
      setView('list');
      fetchInvoices();
      // Archiving rolls the source quotation back out of 'invoiced', so the
      // cached orders list is stale too.
      invalidateOrders(queryClient);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive invoice.');
    }
  };

  const handlePaymentRecorded = (payment) => {
    alert(`Payment ${payment.payment_number} recorded successfully.`);
    if (selectedInvoice) {
      loadInvoiceDetails(selectedInvoice.id);
    }
    fetchInvoices();
  };

  const handleApproveChallan = async (challanId) => {
    try {
      await api.post(`/challans/${challanId}/approve`);
      alert('Delivery Challan approved and marked as delivered successfully.');
      if (selectedInvoice) {
        loadInvoiceDetails(selectedInvoice.id);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve challan.');
    }
  };

  const handlePrintClick = (inv, type = 'detailed') => {
    let typeParam = type;
    if (type === 'pad-detailed') typeParam = 'pad-sizes';
    if (type === 'pad-simplified') typeParam = 'pad';
    navigate(`/invoices/print/${inv.id}?type=${typeParam}`);
  };

  const handleSendChallanEmail = async (challanId) => {
    try {
      const res = await api.post(`/challans/${challanId}/send-email`);
      alert(res.data?.message || 'Delivery Challan PDF sent to customer email.');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to send challan email.');
    }
  };

  const handleOpenPrintChallan = (ch) => {
    setSelectedChallanForPrint({
      ...ch,
      invoice: selectedInvoice,
      customer: selectedInvoice?.customer,
    });
    setIsChallanPrintModalOpen(true);
  };

  const openTransferModal = async (payment) => {
    setTransferModal({ open: true, payment });
    setTransferInvoiceId('');
    setTransferReason('');
    setTransferError('');
    // Non-paid invoices for the dropdown — served from the shared cache,
    // fetched only if it isn't loaded yet.
    try {
      const list = await queryClient.ensureQueryData(invoicesQueryOptions());
      setAllInvoicesForTransfer(list.filter(inv => inv.payment_status !== 'paid' && inv.id !== payment.invoice_id));
    } catch {
      setAllInvoicesForTransfer([]);
    }
  };

  const handleTransferPayment = async () => {
    if (!transferInvoiceId) { setTransferError('Please select a target invoice.'); return; }
    setTransferring(true);
    setTransferError('');
    try {
      const res = await api.post(`/payments/${transferModal.payment.id}/transfer`, {
        new_invoice_id: parseInt(transferInvoiceId),
        reason: transferReason,
      });
      setTransferModal({ open: false, payment: null });
      alert(`✅ Payment transferred successfully! New receipt: ${res.data.data?.payment_number}`);
      fetchInvoices();
      if (selectedInvoice) loadInvoiceDetails(selectedInvoice.id);
    } catch (err) {
      setTransferError(err.response?.data?.message || 'Transfer failed. Please try again.');
    } finally {
      setTransferring(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();

    return invoices.filter(inv => {
      const matchesStatus = filterStatus ? inv.payment_status === filterStatus : true;

      const matchesSearch = q
        ? (inv.invoice_number || '').toLowerCase().includes(q) ||
          (inv.customer?.name || '').toLowerCase().includes(q) ||
          (inv.customer?.company_name || '').toLowerCase().includes(q) ||
          (inv.customer?.phone || '').toLowerCase().includes(q)
        : true;

      const invDate = inv.invoice_date ? inv.invoice_date.substring(0, 10) : null;
      const matchesFrom = filterDateFrom && invDate ? invDate >= filterDateFrom : true;
      const matchesTo = filterDateTo && invDate ? invDate <= filterDateTo : true;

      return matchesStatus && matchesSearch && matchesFrom && matchesTo;
    });
  }, [invoices, filterStatus, filterSearch, filterDateFrom, filterDateTo]);

  // Pre-compute display fields once so both the desktop table and the
  // mobile card list render from the exact same derived data.
  const invoiceRows = useMemo(() => {
    return filteredInvoices.map((inv) => {
      const companyName = inv.customer?.company_name || inv.customer?.name || 'N/A';
      const personName = inv.customer?.name || '';
      // Only show personName separately if it's genuinely different from companyName
      const showPerson = personName && personName.trim().toLowerCase() !== companyName.trim().toLowerCase();

      // Show both customer address and delivery address (if different)
      const mainAddr = inv.customer?.address || '';
      const deliveryAddr = inv.quotation?.delivery_address || '';
      let custAddr = '';
      if (mainAddr && deliveryAddr && mainAddr.trim() !== deliveryAddr.trim()) {
        custAddr = `${mainAddr}\n🚚 ${deliveryAddr}`;
      } else {
        custAddr = mainAddr || deliveryAddr || 'Dhaka, Bangladesh';
      }

      const items = inv.quotation?.items || [];
      const prodCodesList = Array.from(
        new Set(
          items.map(item => {
            const pCode = item.product?.product_code || item.product?.name || '';
            const vName = item.variant?.variant_name ? ` (${item.variant.variant_name})` : '';
            return `${pCode}${vName}`;
          }).filter(Boolean)
        )
      );
      const prodCodes = prodCodesList.length > 0 ? prodCodesList.join(', ') : 'N/A';

      return { ...inv, companyName, personName, showPerson, custAddr, prodCodes };
    });
  }, [filteredInvoices]);

  const totalPages = Math.ceil(invoiceRows.length / entriesPerPage) || 1;

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage;
    return invoiceRows.slice(start, start + entriesPerPage);
  }, [invoiceRows, currentPage, entriesPerPage]);

  return (
    <div className="content-container animate-fade-in">
      {view === 'list' ? (
        <>
          <div className="page-header-row">
            <div>
              <h1>Invoices & Billings</h1>
              <p>View client balance reports, collection transactions, and delivery status logs</p>
            </div>
          </div>

          {/* Filters Banner */}
          <div className="welcome-banner list-filter-row" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '16px', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, flex: '2 1 220px', minWidth: '200px' }}>
              <label style={{ fontSize: '12px' }}>Search Invoice / Customer / Phone</label>
              <input type="text" placeholder="Invoice number, customer name, or mobile no..." value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px' }} />
            </div>

            <div className="form-group" style={{ margin: 0, flex: '1 1 150px', minWidth: '150px' }}>
              <label style={{ fontSize: '12px' }}>Payment Status</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }}>
                <option value="">All Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0, flex: '1 1 140px', minWidth: '140px' }}>
              <label style={{ fontSize: '12px' }}>Date From</label>
              <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }} />
            </div>

            <div className="form-group" style={{ margin: 0, flex: '1 1 140px', minWidth: '140px' }}>
              <label style={{ fontSize: '12px' }}>Date To</label>
              <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} style={{ padding: '6px 10px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-base)' }} />
            </div>

            <button className="logout-btn" onClick={() => { setFilterSearch(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); }} style={{ height: '34px' }}>
              Reset Filters
            </button>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', display: 'block', visibility: 'hidden' }}>&nbsp;</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer', height: '34px' }}>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => { setShowArchived(e.target.checked); setCurrentPage(1); }}
                  style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                />
                Show Archived
              </label>
            </div>
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', marginBottom: '10px' }}>
            {showArchived
              ? `Showing ${filteredInvoices.length} archived invoice${filteredInvoices.length === 1 ? '' : 's'}`
              : `Showing ${filteredInvoices.length} of ${invoices.length} invoices`}
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <>
              {/* Desktop table — compact row gap (6px padding), 15 lines per page default */}
              <div className="card-table-wrapper invoices-desktop-table">
                <table className="data-table">
                  <thead>
                    {showArchived ? (
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center', padding: '6px 10px', fontSize: '12px' }}>SN</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>INVOICE NO</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>COMPANY</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>TOTAL</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>ARCHIVED ON</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>ARCHIVED BY</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>REASON</th>
                        <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '12px' }}>ACTION</th>
                      </tr>
                    ) : (
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center', padding: '6px 10px', fontSize: '12px' }}>SN</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>COMPANY</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>ADDRESS</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>PRODUCT (code)</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>INVOICE NO</th>
                        <th style={{ padding: '6px 10px', fontSize: '12px' }}>DATE</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>TOTAL</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>DISCOUNT</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>PAID</th>
                        <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '12px' }}>Payment Status</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: '12px' }}>DUE</th>
                        <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: '12px' }}>ACTION</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {paginatedInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={showArchived ? 8 : 12} style={{ textAlign: 'center', color: 'var(--text-main)', padding: '30px' }}>
                          {showArchived ? 'No archived invoices.' : 'No invoices found.'}
                        </td>
                      </tr>
                    ) : showArchived ? (
                      paginatedInvoices.map((inv, idx) => (
                        <tr key={inv.id}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b', padding: '6px 10px' }}>
                            {(currentPage - 1) * entriesPerPage + idx + 1}
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <button
                              type="button"
                              className="clickable-link"
                              onClick={() => loadInvoiceDetails(inv.id)}
                              style={{ fontWeight: 800, color: '#007bff' }}
                            >
                              {inv.invoice_number} ↗
                            </button>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>ID #{inv.id}</div>
                          </td>
                          <td style={{ padding: '6px 10px', lineHeight: '1.3' }}>
                            <strong style={{ color: '#0f172a', display: 'block' }}>{inv.companyName}</strong>
                            {inv.showPerson && (
                              <span style={{ fontSize: '11px', color: '#64748b' }}>👤 {inv.personName}</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, padding: '6px 10px' }}>{formatCurrency(inv.grand_total || inv.subtotal || 0)}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px' }}>{formatDateTime(inv.archived_at)}</td>
                          {/* Eloquent's default $snakeAttributes = true snake_cases relation
                              names when the model serializes to JSON, so the archivedByUser()
                              relation arrives here as archived_by_user — confirmed by inspecting
                              an actual Invoice::toArray() rather than assumed. */}
                          <td style={{ padding: '6px 10px', fontSize: '12px' }}>{inv.archived_by_user?.name || '—'}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', color: '#64748b' }}>{inv.archive_reason || '—'}</td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button className="text-btn" onClick={() => loadInvoiceDetails(inv.id)} title="View Details">
                                👁️ Details
                              </button>
                              <button className="text-btn" onClick={() => handlePrintClick(inv, 'detailed')} style={{ color: '#17a2b8', fontWeight: 600 }} title="Print Invoice">
                                🖨️ Print
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      paginatedInvoices.map((inv, idx) => (
                        <tr key={inv.id}>
                          <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b', padding: '6px 10px' }}>
                            {(currentPage - 1) * entriesPerPage + idx + 1}
                          </td>
                          <td style={{ padding: '6px 10px', lineHeight: '1.3' }}>
                            <strong style={{ color: '#0f172a', display: 'block' }}>{inv.companyName}</strong>
                            {inv.showPerson && (
                              <span style={{ fontSize: '11px', color: '#64748b' }}>👤 {inv.personName}</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 10px', lineHeight: '1.2' }}>
                            <span style={{ fontSize: '12px', color: '#475569', whiteSpace: 'pre-line' }}>📍 {inv.custAddr}</span>
                          </td>
                          <td style={{ padding: '6px 10px', lineHeight: '1.2' }}>
                            <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '12px' }}>{inv.prodCodes}</span>
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <button
                              type="button"
                              className="clickable-link"
                              onClick={() => loadInvoiceDetails(inv.id)}
                              style={{ fontWeight: 800, color: '#007bff' }}
                            >
                              {inv.invoice_number} ↗
                            </button>
                          </td>
                          <td style={{ padding: '6px 10px' }}>{formatDate(inv.invoice_date || inv.created_at)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, padding: '6px 10px' }}>{formatCurrency(inv.grand_total || inv.subtotal || 0)}</td>
                          <td style={{ textAlign: 'right', color: '#64748b', padding: '6px 10px' }}>{formatCurrency(inv.discount_amount || 0)}</td>
                          <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700, padding: '6px 10px' }}>{formatCurrency(inv.paid_amount || 0)}</td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <span className={`badge ${
                              inv.payment_status === 'paid' ? 'badge-success' :
                              inv.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'
                            }`}>
                              {inv.payment_status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', color: inv.due_amount > 0 ? '#dc2626' : '#16a34a', fontWeight: 800, padding: '6px 10px' }}>
                            {formatCurrency(inv.due_amount || 0)}
                          </td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                              <button className="text-btn" onClick={() => loadInvoiceDetails(inv.id)} title="View Details">
                                👁️ Details
                              </button>
                              <button className="text-btn" onClick={() => handlePrintClick(inv, 'detailed')} style={{ color: '#17a2b8', fontWeight: 600 }} title="Print Invoice">
                                🖨️ Print
                              </button>
                              {inv.payment_status !== 'paid' && (
                                <button className="text-btn" onClick={() => { setSelectedInvoice(inv); setIsPaymentModalOpen(true); }} style={{ color: '#16a34a', fontWeight: 700 }} title="Record Payment">
                                  💳 Pay
                                </button>
                              )}
                              {can('challans:generate') && (
                                <button className="text-btn" onClick={() => handleGenerateChallan(inv.id)} style={{ color: '#8b5cf6' }} title="Generate Delivery Challan">
                                  🚚 Challan
                                </button>
                              )}
                              {can('invoices:archive') && (
                                <button className="text-btn" onClick={() => handleArchiveInvoice(inv.id)} style={{ color: '#dc2626' }} title="Archive Invoice">
                                  🗑️ Archive
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="invoices-mobile-list">
                {paginatedInvoices.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-main)', padding: '30px' }}>
                    {showArchived ? 'No archived invoices.' : 'No invoices found.'}
                  </div>
                ) : showArchived ? (
                  paginatedInvoices.map((inv, idx) => (
                    <div className="invoice-mobile-card" key={inv.id}>
                      <div className="mobile-card-actions-scroll">
                        <button
                          type="button"
                          className="mobile-action-pill pill-purple"
                          onClick={() => loadInvoiceDetails(inv.id)}
                        >
                          👁 View Details
                        </button>
                        <button
                          type="button"
                          className="mobile-action-pill pill-cyan"
                          onClick={() => handlePrintClick(inv, 'detailed')}
                        >
                          🖨 Print
                        </button>
                      </div>

                      <div className="invoice-mobile-card-header">
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>#{(currentPage - 1) * entriesPerPage + idx + 1} · ID #{inv.id}</span>
                          <strong style={{ color: '#0f172a', display: 'block', fontSize: '15px' }}>{inv.companyName}</strong>
                        </div>
                      </div>

                      <div className="invoice-mobile-card-body">
                        <div className="invoice-mobile-card-row">
                          <span>Invoice No</span>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => loadInvoiceDetails(inv.id)}
                            style={{ fontWeight: 800, color: '#007bff' }}
                          >
                            {inv.invoice_number} ↗
                          </button>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Total</span>
                          <span>{formatCurrency(inv.grand_total || inv.subtotal || 0)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Archived On</span>
                          <span>{formatDateTime(inv.archived_at)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Archived By</span>
                          <span>{inv.archived_by_user?.name || '—'}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Reason</span>
                          <span style={{ textAlign: 'right' }}>{inv.archive_reason || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  paginatedInvoices.map((inv, idx) => (
                    <div className="invoice-mobile-card" key={inv.id}>
                      {/* Horizontal Action Pills Bar matching reference screenshot */}
                      <div className="mobile-card-actions-scroll">
                        <button
                          type="button"
                          className="mobile-action-pill pill-purple"
                          onClick={() => loadInvoiceDetails(inv.id)}
                        >
                          👁 View Details
                        </button>
                        <button
                          type="button"
                          className="mobile-action-pill pill-cyan"
                          onClick={() => handlePrintClick(inv, 'detailed')}
                        >
                          🖨 Print
                        </button>
                        {inv.payment_status !== 'paid' && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-green"
                            onClick={() => { setSelectedInvoice(inv); setIsPaymentModalOpen(true); }}
                          >
                            💳 Record
                          </button>
                        )}
                        {can('challans:generate') && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-indigo"
                            onClick={() => handleGenerateChallan(inv.id)}
                          >
                            🚚 Challan
                          </button>
                        )}
                        {can('invoices:archive') && (
                          <button
                            type="button"
                            className="mobile-action-pill pill-red"
                            onClick={() => handleArchiveInvoice(inv.id)}
                          >
                            🗑 Archive Invoice
                          </button>
                        )}
                      </div>

                      <div className="invoice-mobile-card-header">
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>#{(currentPage - 1) * entriesPerPage + idx + 1}</span>
                          <strong style={{ color: '#0f172a', display: 'block', fontSize: '15px' }}>{inv.companyName}</strong>
                          {inv.customer?.name && inv.customer?.name !== inv.companyName && (
                            <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>👤 {inv.customer.name}</span>
                          )}
                        </div>
                      </div>

                      <div className="invoice-mobile-card-body">
                        <div className="invoice-mobile-card-row">
                          <span>Invoice No</span>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => loadInvoiceDetails(inv.id)}
                            style={{ fontWeight: 800, color: '#007bff' }}
                          >
                            {inv.invoice_number} ↗
                          </button>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Date</span>
                          <span>{formatDate(inv.invoice_date || inv.created_at)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Product</span>
                          <span style={{ color: '#2563eb' }}>{inv.prodCodes}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Address</span>
                          <span style={{ textAlign: 'right' }}>📍 {inv.custAddr}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Total</span>
                          <span>{formatCurrency(inv.grand_total || inv.subtotal || 0)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Discount</span>
                          <span>{formatCurrency(inv.discount_amount || 0)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Paid</span>
                          <span style={{ color: '#16a34a' }}>{formatCurrency(inv.paid_amount || 0)}</span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Due</span>
                          <span style={{ color: inv.due_amount > 0 ? '#dc2626' : '#16a34a', fontWeight: 800 }}>
                            {formatCurrency(inv.due_amount || 0)}
                          </span>
                        </div>
                        <div className="invoice-mobile-card-row">
                          <span>Status</span>
                          <span className={`badge ${
                            inv.payment_status === 'paid' ? 'badge-success' :
                            inv.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {inv.payment_status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination Controls Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', borderTop: '1px solid var(--border, #e2e8f0)', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
                  <span>Show</span>
                  <select
                    value={entriesPerPage}
                    onChange={(e) => {
                      setEntriesPerPage(parseInt(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', fontSize: '13px', background: 'var(--bg-base, #fff)' }}
                  >
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>entries per page (Showing {invoiceRows.length === 0 ? 0 : (currentPage - 1) * entriesPerPage + 1} to {Math.min(currentPage * entriesPerPage, invoiceRows.length)} of {invoiceRows.length})</span>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', background: currentPage === 1 ? 'var(--bg-subtle, #f1f5f9)' : 'var(--bg-base, #fff)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2)).map(p => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '13px',
                        borderRadius: '4px',
                        border: '1px solid var(--border, #cbd5e1)',
                        background: p === currentPage ? '#00a699' : 'var(--bg-base, #fff)',
                        color: p === currentPage ? '#ffffff' : 'var(--text-main)',
                        fontWeight: p === currentPage ? 'bold' : 'normal',
                        cursor: 'pointer'
                      }}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    disabled={currentPage === totalPages || invoiceRows.length === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: '6px 14px', fontSize: '13px', borderRadius: '4px', border: '1px solid var(--border, #cbd5e1)', background: currentPage === totalPages || invoiceRows.length === 0 ? 'var(--bg-subtle, #f1f5f9)' : 'var(--bg-base, #fff)', cursor: currentPage === totalPages || invoiceRows.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* Invoice Details View */
        <div className="animate-fade-in">
          <div className="page-header-row">
            <div>
              <h1>Invoice #{selectedInvoice?.invoice_number}</h1>
              <p>Full financial breakdown, collections history, and logistics status</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button 
                type="button"
                className="text-btn"
                onClick={() => handlePrintClick(selectedInvoice, 'detailed')}
                style={{ color: '#17a2b8', fontWeight: 600, border: '1px solid #17a2b8', padding: '6px 12px', borderRadius: '4px' }}
              >
                🖨️ Detailed Invoice
              </button>
              <button 
                type="button"
                className="text-btn"
                onClick={() => handlePrintClick(selectedInvoice, 'simplified')}
                style={{ color: '#0ea5e9', fontWeight: 600, border: '1px solid #0ea5e9', padding: '6px 12px', borderRadius: '4px' }}
              >
                🖨️ View Invoice
              </button>
              <button 
                type="button"
                className="text-btn"
                onClick={() => handlePrintClick(selectedInvoice, 'pad-detailed')}
                style={{ color: '#8b5cf6', fontWeight: 600, border: '1px solid #8b5cf6', padding: '6px 12px', borderRadius: '4px' }}
              >
                📝 Pad Invoice (Sizes)
              </button>
              <button 
                type="button"
                className="text-btn"
                onClick={() => handlePrintClick(selectedInvoice, 'pad-simplified')}
                style={{ color: '#ec4899', fontWeight: 600, border: '1px solid #ec4899', padding: '6px 12px', borderRadius: '4px' }}
              >
                📝 Pad Invoice
              </button>

              {(parseFloat(selectedInvoice?.due_amount) > 0 || selectedInvoice?.payment_status !== 'paid') && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setIsPaymentModalOpen(true)}
                  style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', padding: '10px 18px', fontWeight: 'bold' }}
                >
                  💳 Receive Payment
                </button>
              )}
              <button className="logout-btn" onClick={() => setView('list')}>Back to List</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Info Banner */}
              <div className="welcome-banner" style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Customer Name</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{selectedInvoice?.customer?.name}</h4>
                  <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{selectedInvoice?.customer?.phone}</span>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Invoice Date</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{formatDate(selectedInvoice?.invoice_date)}</h4>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Salesperson</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)' }}>{selectedInvoice?.salesman?.name}</h4>
                </div>
                <div>
                  <span style={{ fontSize: '12px', textTransform: 'uppercase' }}>Source Quotation</span>
                  <h4 style={{ margin: '4px 0 0', color: 'var(--text-heading)', color: 'var(--primary)' }}>
                    {selectedInvoice?.quotation?.quotation_number}
                  </h4>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Product Line Items</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Product / Color Code</th>
                      <th>Width</th>
                      <th>Height</th>
                      <th>Pcs</th>
                      <th>Billed Sqft</th>
                      <th>Unit Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const items = selectedInvoice?.quotation?.items || [];
                      if (items.length === 0) {
                        return (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-main)' }}>
                              No items found for this invoice.
                            </td>
                          </tr>
                        );
                      }

                      // Group consecutive items by product code / product ID
                      const groups = [];
                      let currentGroup = null;

                      items.forEach((item) => {
                        const code = item.product?.product_code || item.product?.name || `PROD-${item.product_id}`;
                        if (!currentGroup || currentGroup.code !== code) {
                          currentGroup = { code, items: [item] };
                          groups.push(currentGroup);
                        } else {
                          currentGroup.items.push(item);
                        }
                      });

                      return groups.map((group) =>
                        group.items.map((item, itemIdx) => (
                          <tr key={item.id}>
                            {itemIdx === 0 && (
                              <td
                                rowSpan={group.items.length}
                                style={{
                                  verticalAlign: 'top',
                                  fontWeight: '600',
                                  backgroundColor: '#fafafa',
                                  borderRight: '1px solid var(--border)',
                                  paddingTop: '12px',
                                }}
                              >
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontWeight: 'bold',
                                    fontSize: '13px',
                                    color: 'var(--primary)',
                                    padding: '4px 8px',
                                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(37, 99, 235, 0.2)',
                                  }}
                                >
                                  🏷️ {group.code}
                                </span>
                                {item.product?.name && (
                                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontWeight: '500' }}>
                                    {item.product.name}
                                  </div>
                                )}
                              </td>
                            )}
                            <td>{item.width} in</td>
                            <td>{item.height} in</td>
                            <td>{item.pcs}</td>
                            <td>{item.billed_sqft} sqft</td>
                            <td>{formatCurrency(item.unit_price)}</td>
                            <td style={{ fontWeight: '600' }}>{formatCurrency(item.line_total)}</td>
                          </tr>
                        ))
                      );
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Payments History */}
              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Collections & Payments History</h3>
                {selectedInvoice?.payments?.length === 0 ? (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>No payment records registered against this invoice.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Receipt No.</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Payment Date</th>
                        <th>Reference</th>
                        <th style={{ textAlign: 'center' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice?.payments?.map((pay) => (
                        <tr key={pay.id}>
                          <td><strong>{pay.payment_number}</strong></td>
                          <td style={{ fontWeight: '600', color: 'var(--success)' }}>{formatCurrency(pay.amount)}</td>
                          <td style={{ textTransform: 'uppercase' }}>{pay.payment_method}</td>
                          <td>{formatDate(pay.payment_date)}</td>
                          <td>
                            {pay.payment_method === 'bank' && `${pay.bank_name} (Cheque: ${pay.cheque_number})`}
                            {pay.payment_method === 'mobile' && `${pay.mobile_provider} (Txn: ${pay.transaction_id})`}
                            {pay.payment_method === 'cash' && 'Cash receipt'}
                            {pay.notes && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{pay.notes}</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="text-btn"
                                onClick={() => window.open(`/payments/${pay.id}/receipt`, '_blank')}
                                style={{ color: '#2563eb', fontWeight: 700, fontSize: '12px', border: '1px solid #2563eb', borderRadius: '4px', padding: '3px 8px' }}
                                title="Print Money Receipt"
                              >
                                🧾 Receipt
                              </button>
                              {user?.role === 'admin' && (
                                <button
                                  type="button"
                                  className="text-btn"
                                  onClick={() => openTransferModal({ ...pay, invoice_id: selectedInvoice.id })}
                                  style={{ color: '#f59e0b', fontWeight: 700, fontSize: '12px', border: '1px solid #f59e0b', borderRadius: '4px', padding: '3px 8px' }}
                                  title="Transfer this payment to another invoice"
                                >
                                  🔀 Transfer
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Delivery Challans */}
              <div className="welcome-banner" style={{ padding: '20px' }}>
                <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Delivery Challans</h3>
                {selectedInvoice?.delivery_challans?.length === 0 ? (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>No delivery challans generated yet.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Challan No.</th>
                        <th>Driver name</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice?.delivery_challans?.map((ch) => (
                        <tr key={ch.id}>
                          <td><strong>{ch.challan_number}</strong></td>
                          <td>{ch.driver_name || 'Not assigned'}</td>
                          <td>{formatDate(ch.delivery_date)}</td>
                          <td>
                            <span className={`badge ${ch.status === 'delivered' ? 'badge-success' : 'badge-warning'}`}>
                              {ch.status === 'delivered' ? 'Delivered / Approved' : 'Pending Approval'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {ch.status !== 'delivered' ? (
                              <button
                                type="button"
                                className="primary-btn"
                                onClick={() => handleApproveChallan(ch.id)}
                                style={{ fontSize: '12px', padding: '4px 10px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                              >
                                ✅ Approve Challan
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  className="text-btn"
                                  onClick={() => handleOpenPrintChallan(ch)}
                                  style={{ fontSize: '12px', padding: '4px 8px', fontWeight: 'bold' }}
                                >
                                  🖨️ Print
                                </button>
                                <button
                                  type="button"
                                  className="text-btn"
                                  onClick={() => handleSendChallanEmail(ch.id)}
                                  style={{ fontSize: '12px', padding: '4px 8px', color: '#059669', fontWeight: 'bold' }}
                                >
                                  📧 Send Mail
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Side summary panel */}
            <div>
              <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-heading)' }}>
                  Billing Summary
                </h3>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(selectedInvoice?.subtotal)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>VAT Amount:</span>
                  <span>{formatCurrency(selectedInvoice?.vat_amount)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span>Discounts applied:</span>
                  <span style={{ color: 'var(--danger)' }}>-{formatCurrency(selectedInvoice?.discount_amount)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <span>Grand Total:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(selectedInvoice?.grand_total)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', color: 'var(--success)' }}>
                  <span>Total Paid:</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(selectedInvoice?.paid_amount)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderTop: '2px solid var(--primary)', paddingTop: '12px', color: 'var(--danger)', fontWeight: 'bold' }}>
                  <span>Due Amount:</span>
                  <span>{formatCurrency(selectedInvoice?.due_amount)}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '24px' }}>
                  {(parseFloat(selectedInvoice?.due_amount) > 0 || selectedInvoice?.payment_status !== 'paid') && (
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => setIsPaymentModalOpen(true)}
                      style={{ backgroundColor: 'var(--success)', borderColor: 'var(--success)', padding: '12px', fontWeight: 'bold', fontSize: '15px' }}
                    >
                      💳 Receive Payment
                    </button>
                  )}
                  
                  {selectedInvoice?.delivery_challans?.length === 0 && (
                    <button type="button" className="logout-btn" onClick={() => handleGenerateChallan(selectedInvoice.id)} style={{ padding: '10px' }}>
                      Generate Challan
                    </button>
                  )}

                  {can('invoices:archive') && (
                    <button type="button" className="logout-btn" onClick={() => handleArchiveInvoice(selectedInvoice.id)} style={{ padding: '10px', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}>
                      Archive Invoice
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        invoice={selectedInvoice}
        onPaymentRecorded={handlePaymentRecorded}
      />

      {/* Delivery Challan Printable Modal */}
      <ChallanPrintModal
        isOpen={isChallanPrintModalOpen}
        onClose={() => setIsChallanPrintModalOpen(false)}
        challan={selectedChallanForPrint}
        onSendEmail={handleSendChallanEmail}
      />

      {/* Invoice Printable PDF Modal */}
      <InvoicePrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        invoice={printingInvoice}
        printType={printType}
      />

      {/* ===== Payment Transfer Modal ===== */}
      {transferModal.open && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setTransferModal({ open: false, payment: null }); }}
        >
          <div
            style={{
              background: 'var(--bg-card, #fff)', borderRadius: '12px', padding: '28px 32px',
              width: '100%', maxWidth: '520px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-heading)', fontSize: '18px' }}>🔀 Transfer Payment</h3>
              <button
                type="button"
                onClick={() => setTransferModal({ open: false, payment: null })}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >✕</button>
            </div>

            {/* From - current payment info */}
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '6px', textTransform: 'uppercase' }}>❌ From (Wrong Payment)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '13px' }}>
                <div><span style={{ color: '#78716c' }}>Receipt:</span> <strong>{transferModal.payment?.payment_number}</strong></div>
                <div><span style={{ color: '#78716c' }}>Amount:</span> <strong style={{ color: '#dc2626' }}>{formatCurrency(transferModal.payment?.amount)}</strong></div>
                <div><span style={{ color: '#78716c' }}>Method:</span> <span style={{ textTransform: 'uppercase' }}>{transferModal.payment?.payment_method}</span></div>
                <div><span style={{ color: '#78716c' }}>Date:</span> {formatDate(transferModal.payment?.payment_date)}</div>
              </div>
            </div>

            {/* To - target invoice */}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                ✅ Transfer To Invoice <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={transferInvoiceId}
                onChange={(e) => setTransferInvoiceId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1.5px solid var(--border, #cbd5e1)', fontSize: '13px',
                  background: 'var(--bg-base, #fff)', color: 'var(--text-main)',
                }}
              >
                <option value="">-- Select target invoice --</option>
                {allInvoicesForTransfer.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {inv.customer?.company_name || inv.customer?.name || 'Unknown'} — Due: {formatCurrency(inv.due_amount)}
                  </option>
                ))}
              </select>
              {allInvoicesForTransfer.length === 0 && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>No unpaid invoices available for transfer.</div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>Reason / Note (optional)</label>
              <input
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Wrong customer selected during data entry"
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: '1.5px solid var(--border, #cbd5e1)', fontSize: '13px',
                  background: 'var(--bg-base, #fff)', boxSizing: 'border-box',
                }}
              />
            </div>

            {transferError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '10px 14px', color: '#dc2626', fontSize: '13px' }}>
                ⚠️ {transferError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                onClick={() => setTransferModal({ open: false, payment: null })}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'var(--bg-subtle, #f1f5f9)', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTransferPayment}
                disabled={transferring || !transferInvoiceId}
                style={{
                  padding: '10px 24px', borderRadius: '8px', border: 'none',
                  background: transferring || !transferInvoiceId ? '#94a3b8' : '#f59e0b',
                  color: '#fff', fontWeight: 700, cursor: transferring || !transferInvoiceId ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {transferring ? '⏳ Transferring...' : '🔀 Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
