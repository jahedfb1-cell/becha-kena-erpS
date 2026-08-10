import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';
import PaymentModal from '../components/PaymentModal';
import ChallanPrintModal from '../components/ChallanPrintModal';
import InvoicePrintModal from '../components/InvoicePrintModal';

const Invoices = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const [view, setView] = useState('list'); // 'list' or 'detail'
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Selected Invoice for details view
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Challan Print Modal State
  const [selectedChallanForPrint, setSelectedChallanForPrint] = useState(null);
  const [isChallanPrintModalOpen, setIsChallanPrintModalOpen] = useState(false);

  // Invoice Print Modal State
  const [printingInvoice, setPrintingInvoice] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState('detailed'); // 'detailed' | 'simplified' | 'pad-detailed' | 'pad-simplified'

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/invoices?all=1');
      setInvoices(response.data.data.data || response.data.data || []);
    } catch (err) {
      setError('Failed to retrieve invoices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

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

  const filteredInvoices = useMemo(() => {
    const q = filterSearch.trim().toLowerCase();

    return invoices.filter(inv => {
      const matchesStatus = filterStatus ? inv.payment_status === filterStatus : true;

      const matchesSearch = q
        ? (inv.invoice_number || '').toLowerCase().includes(q) ||
          (inv.customer?.name || '').toLowerCase().includes(q) ||
          (inv.customer?.phone || '').toLowerCase().includes(q)
        : true;

      const invDate = inv.invoice_date ? inv.invoice_date.substring(0, 10) : null;
      const matchesFrom = filterDateFrom && invDate ? invDate >= filterDateFrom : true;
      const matchesTo = filterDateTo && invDate ? invDate <= filterDateTo : true;

      return matchesStatus && matchesSearch && matchesFrom && matchesTo;
    });
  }, [invoices, filterStatus, filterSearch, filterDateFrom, filterDateTo]);

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
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', marginBottom: '10px' }}>
            Showing {filteredInvoices.length} of {invoices.length} invoices
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Customer</th>
                    <th>Invoice Date</th>
                    <th>Grand Total</th>
                    <th>Paid Amount</th>
                    <th>Due Amount</th>
                    <th>Payment Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No invoices found.</td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => loadInvoiceDetails(inv.id)}
                            style={{ fontWeight: 800 }}
                          >
                            {inv.invoice_number}
                          </button>
                        </td>
                        <td>
                          {inv.customer ? (
                            <Link
                              to={`/customers?search=${encodeURIComponent(inv.customer.name)}`}
                              className="clickable-link"
                            >
                              {inv.customer.name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{formatDate(inv.invoice_date)}</td>
                        <td>{formatCurrency(inv.grand_total)}</td>
                        <td>{formatCurrency(inv.paid_amount)}</td>
                        <td style={{ color: inv.due_amount > 0 ? 'var(--danger)' : 'inherit', fontWeight: inv.due_amount > 0 ? '600' : 'normal' }}>
                          {formatCurrency(inv.due_amount)}
                        </td>
                        <td>
                          <span className={`badge ${
                            inv.payment_status === 'paid' ? 'badge-success' :
                            inv.payment_status === 'partial' ? 'badge-warning' : 'badge-danger'
                          }`}>
                            {inv.payment_status}
                          </span>
                        </td>
                        <td>
                           <button className="text-btn" onClick={() => loadInvoiceDetails(inv.id)}>
                            Details
                          </button>
                          
                          <button className="text-btn" onClick={() => handlePrintClick(inv, 'detailed')} style={{ marginLeft: '8px', color: '#17a2b8', fontWeight: 600 }}>
                            🖨️ Detailed Invoice
                          </button>
                          
                          <button className="text-btn" onClick={() => handlePrintClick(inv, 'simplified')} style={{ marginLeft: '8px', color: '#0ea5e9', fontWeight: 600 }}>
                            🖨️ View Invoice
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(inv, 'pad-detailed')} style={{ marginLeft: '8px', color: '#8b5cf6', fontWeight: 600 }}>
                            📝 Pad Invoice (Sizes)
                          </button>

                          <button className="text-btn" onClick={() => handlePrintClick(inv, 'pad-simplified')} style={{ marginLeft: '8px', color: '#ec4899', fontWeight: 600 }}>
                            📝 Pad Invoice
                          </button>

                          {inv.payment_status !== 'paid' && (
                            <button className="text-btn" onClick={() => { setSelectedInvoice(inv); setIsPaymentModalOpen(true); }} style={{ marginLeft: '10px', color: 'var(--success)' }}>
                              Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
                        <th>Reference details</th>
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
    </div>
  );
};

export default Invoices;
