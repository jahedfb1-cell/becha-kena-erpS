import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';

const Payments = () => {
  const { user } = useAuth();
  const { can } = usePermission();
  const navigate = useNavigate();
  
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');

  // Detail Modal
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = '/payments?all=1';
      const params = new URLSearchParams();
      if (filterMethod) params.append('payment_method', filterMethod);
      if (filterFromDate) params.append('from_date', filterFromDate);
      if (filterToDate) params.append('to_date', filterToDate);

      const queryString = params.toString();
      if (queryString) {
        url += `&${queryString}`;
      }

      const response = await api.get(url);
      const data = response.data?.data?.data || response.data?.data || [];
      setPayments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError('Failed to retrieve payments history.');
    } finally {
      setLoading(false);
    }
  }, [filterMethod, filterFromDate, filterToDate]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleVoidPayment = async (id, paymentNo) => {
    if (!confirm(`Are you sure you want to void payment ${paymentNo}? This will revert the invoice balance.`)) return;
    try {
      await api.post(`/payments/${id}/void`);
      alert(`Payment ${paymentNo} voided successfully.`);
      if (selectedPayment && selectedPayment.id === id) {
        setIsDetailModalOpen(false);
      }
      fetchPayments();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to void payment.');
    }
  };

  // Filter search locally
  const filteredPayments = useMemo(() => {
    return payments.filter(p => {
      if (!filterSearch) return true;
      const q = filterSearch.toLowerCase().trim();
      const pNo = p.payment_number ? p.payment_number.toLowerCase() : '';
      const invNo = p.invoice?.invoice_number ? p.invoice.invoice_number.toLowerCase() : '';
      const custName = p.customer?.name ? p.customer.name.toLowerCase() : '';
      const custPhone = p.customer?.phone ? p.customer.phone.toLowerCase() : '';
      return pNo.includes(q) || invNo.includes(q) || custName.includes(q) || custPhone.includes(q);
    });
  }, [payments, filterSearch]);

  // Financial Statistics
  const stats = useMemo(() => {
    let totalCollected = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let mobileTotal = 0;

    filteredPayments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      totalCollected += amt;
      if (p.payment_method === 'cash') cashTotal += amt;
      else if (p.payment_method === 'bank') bankTotal += amt;
      else if (p.payment_method === 'mobile') mobileTotal += amt;
    });

    return {
      totalCollected,
      cashTotal,
      bankTotal,
      mobileTotal,
      count: filteredPayments.length,
    };
  }, [filteredPayments]);

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Payments & Financial Collections</h1>
          <p>Track all client receipt vouchers, bank transfers, mobile banking, and cash transactions</p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="welcome-banner" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: '600' }}>Total Collected</span>
          <h2 style={{ margin: '4px 0 0', color: 'var(--primary)', fontSize: '24px', fontWeight: '800' }}>
            {formatCurrency(stats.totalCollected)}
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{stats.count} Transactions Recorded</span>
        </div>

        <div className="welcome-banner" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: '600' }}>💵 Cash Collections</span>
          <h2 style={{ margin: '4px 0 0', color: '#10b981', fontSize: '24px', fontWeight: '800' }}>
            {formatCurrency(stats.cashTotal)}
          </h2>
        </div>

        <div className="welcome-banner" style={{ padding: '16px 20px', borderLeft: '4px solid #3b82f6' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: '600' }}>🏦 Bank / Cheque</span>
          <h2 style={{ margin: '4px 0 0', color: '#3b82f6', fontSize: '24px', fontWeight: '800' }}>
            {formatCurrency(stats.bankTotal)}
          </h2>
        </div>

        <div className="welcome-banner" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: '600' }}>📱 Mobile Banking</span>
          <h2 style={{ margin: '4px 0 0', color: '#8b5cf6', fontSize: '24px', fontWeight: '800' }}>
            {formatCurrency(stats.mobileTotal)}
          </h2>
        </div>
      </div>

      {/* Filters Banner */}
      <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0, flex: 2, minWidth: '180px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>Search Receipt / Customer / Invoice</label>
          <input
            type="text"
            placeholder="Search receipt code, customer, invoice no..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="modern-form-control"
            style={{ padding: '8px 12px', fontSize: '13px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '140px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>Payment Method</label>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value)}
            className="modern-form-control"
            style={{ padding: '8px 12px', fontSize: '13px' }}
          >
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank Cheque</option>
            <option value="mobile">Mobile Banking</option>
          </select>
        </div>

        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '130px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>From Date</label>
          <input
            type="date"
            value={filterFromDate}
            onChange={(e) => setFilterFromDate(e.target.value)}
            className="modern-form-control"
            style={{ padding: '7px 10px', fontSize: '13px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '130px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600' }}>To Date</label>
          <input
            type="date"
            value={filterToDate}
            onChange={(e) => setFilterToDate(e.target.value)}
            className="modern-form-control"
            style={{ padding: '7px 10px', fontSize: '13px' }}
          />
        </div>

        <button
          className="logout-btn"
          onClick={() => {
            setFilterSearch('');
            setFilterMethod('');
            setFilterFromDate('');
            setFilterToDate('');
          }}
          style={{ height: '36px', padding: '0 14px' }}
        >
          Reset Filters
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Main Payments Data Table */}
      {loading ? (
        <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
      ) : (
        <div className="card-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt No.</th>
                <th>Invoice No.</th>
                <th>Customer</th>
                <th>Payment Date</th>
                <th>Method</th>
                <th>Method / Ref Details</th>
                <th>Amount</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-main)' }}>
                    No payment collection records found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>{p.payment_number}</strong>
                    </td>
                    <td>
                      {p.invoice?.invoice_number ? (
                        <span style={{ fontWeight: '600', color: '#0f172a' }}>{p.invoice.invoice_number}</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>N/A</span>
                      )}
                    </td>
                    <td>
                      <strong>{p.customer?.name}</strong>
                      {p.customer?.phone && <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {p.customer.phone}</div>}
                    </td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td>
                      <span className={`badge ${
                        p.payment_method === 'cash' ? 'badge-success' :
                        p.payment_method === 'bank' ? 'badge-info' : 'badge-warning'
                      }`} style={{ textTransform: 'uppercase' }}>
                        {p.payment_method === 'cash' ? '💵 Cash' : p.payment_method === 'bank' ? '🏦 Bank' : '📱 Mobile'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {p.payment_method === 'bank' && (
                        <div>
                          <strong>{p.bank_name || 'Bank'}</strong>
                          {p.cheque_number && <div style={{ color: '#475569' }}>Cheque: {p.cheque_number}</div>}
                        </div>
                      )}
                      {p.payment_method === 'mobile' && (
                        <div>
                          <strong>{p.mobile_provider || 'Mobile'}</strong>
                          {p.transaction_id && <div style={{ color: '#475569' }}>Txn: {p.transaction_id}</div>}
                        </div>
                      )}
                      {p.payment_method === 'cash' && (
                        <span style={{ color: '#64748b', fontStyle: 'italic' }}>Cash Receipt</span>
                      )}
                    </td>
                    <td>
                      <strong style={{ fontSize: '15px', color: 'var(--success)' }}>
                        {formatCurrency(p.amount)}
                      </strong>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => { setSelectedPayment(p); setIsDetailModalOpen(true); }}
                        style={{ marginRight: '6px' }}
                      >
                        👁️ Details
                      </button>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => window.open(`/payments/${p.id}/receipt`, '_blank')}
                        style={{ color: '#2563eb', fontWeight: 700, marginRight: '6px' }}
                        title="Print Money Receipt"
                      >
                        🧾 Receipt
                      </button>
                      {(can('payments:void') || user?.role === 'admin') && (
                        <button
                          type="button"
                          className="text-btn"
                          onClick={() => handleVoidPayment(p.id, p.payment_number)}
                          style={{ color: 'var(--danger)' }}
                        >
                          🚫 Void
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

      {/* Payment Details Modal */}
      {isDetailModalOpen && selectedPayment && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsDetailModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">
                🧾 Payment Voucher #{selectedPayment.payment_number}
              </h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsDetailModalOpen(false)}>&times;</button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Customer Name:</span>
                  <strong>{selectedPayment.customer?.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Invoice Reference:</span>
                  <strong>{selectedPayment.invoice?.invoice_number || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Payment Date:</span>
                  <strong>{formatDate(selectedPayment.payment_date)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ color: '#64748b', fontSize: '13px' }}>Payment Method:</span>
                  <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>
                    {selectedPayment.payment_method}
                  </span>
                </div>
                {selectedPayment.bank_name && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontSize: '13px' }}>Bank Name & Cheque:</span>
                    <strong>{selectedPayment.bank_name} ({selectedPayment.cheque_number})</strong>
                  </div>
                )}
                {selectedPayment.mobile_provider && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#64748b', fontSize: '13px' }}>Mobile Banking & Txn:</span>
                    <strong>{selectedPayment.mobile_provider} ({selectedPayment.transaction_id})</strong>
                  </div>
                )}
                {selectedPayment.notes && (
                  <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', fontSize: '12px', color: '#475569' }}>
                    <strong>Notes:</strong> {selectedPayment.notes}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                <span style={{ fontWeight: 'bold', color: '#065f46' }}>Total Amount Paid:</span>
                <span style={{ fontSize: '22px', fontWeight: '800', color: '#059669' }}>
                  {formatCurrency(selectedPayment.amount)}
                </span>
              </div>
            </div>

            <div className="custom-modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </button>
              <button
                type="button"
                onClick={() => window.open(`/payments/${selectedPayment.id}/receipt`, '_blank')}
                style={{ padding: '10px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}
              >
                🧾 Print Money Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
