import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { formatCurrency, formatDate } from '../utils/format';
import { myDuesTitle } from '../utils/myDuesTitle';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const YEAR_OPTIONS = ['2024', '2025', '2026', '2027', '2028'];

/**
 * Every salesman's own customer due list, scoped server-side to their user
 * id (a manager sees their team + themselves; an admin sees everyone) - see
 * ReportController@salesDue. Deliberately its own page rather than a tab
 * inside the admin-only Reports hub, since a salesman has none of the
 * permissions that hub's other report cards need and shouldn't see other
 * salesmen's numbers.
 *
 * Month/Year and Salesman filters go to the server (same from_date/to_date/
 * salesman_id params the Reports.jsx sales-due-report card already uses, so
 * the two stay behaviourally identical); the customer search box stays a
 * client-side filter over whatever the server already returned, since it's
 * just narrowing down a list already small enough to hold in the browser.
 */
const MyDues = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);

  // Month === '' means "whole year"; Year === '' clears the range back to
  // all-time. Same convention Reports.jsx's own sales-due-report filter uses.
  const [duesMonth, setDuesMonth] = useState('');
  const [duesYear, setDuesYear] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // A plain salesman is always locked to their own dues server-side no
  // matter what salesman_id they send, so the filter is only worth showing
  // (and only worth fetching the salesman list for) once there's more than
  // one person's data to possibly be looking at.
  const canFilterBySalesman = user?.role === 'admin' || user?.role === 'manager';
  const [salesmanId, setSalesmanId] = useState('');
  const [salespeople, setSalespeople] = useState([]);

  useEffect(() => {
    if (!canFilterBySalesman) return;
    api.get('/users', { params: { role: 'salesman' } })
      .then((res) => {
        const list = res.data?.data?.data || res.data?.data || [];
        setSalespeople(Array.isArray(list) ? list : []);
      })
      .catch(() => setSalespeople([]));
  }, [canFilterBySalesman]);

  const applyDuesPeriod = (month, year) => {
    if (!year) {
      setFromDate('');
      setToDate('');
      return;
    }
    if (month) {
      const m = String(month).padStart(2, '0');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      setFromDate(`${year}-${m}-01`);
      setToDate(`${year}-${m}-${String(lastDay).padStart(2, '0')}`);
    } else {
      setFromDate(`${year}-01-01`);
      setToDate(`${year}-12-31`);
    }
  };

  const fetchDues = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;
      if (canFilterBySalesman && salesmanId) params.salesman_id = salesmanId;
      const res = await api.get('/reports/sales-due', { params });
      setData(res.data?.data || null);
    } catch (err) {
      console.error('Error fetching due list:', err);
      setError('Failed to load the due list.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, salesmanId, canFilterBySalesman]);

  useEffect(() => {
    fetchDues();
  }, [fetchDues]);

  const handleResetFilters = () => {
    setDuesMonth('');
    setDuesYear('');
    setFromDate('');
    setToDate('');
    setSalesmanId('');
    setSearch('');
  };

  const customerDues = data?.customer_dues || [];

  const filteredDues = useMemo(() => {
    if (!search.trim()) return customerDues;
    const q = search.trim().toLowerCase();
    return customerDues.filter((c) =>
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.customer_code || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    );
  }, [customerDues, search]);

  const pageTitle = myDuesTitle(user?.role);
  const filtersActive = fromDate || toDate || salesmanId || search;

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>{pageTitle}</h1>
          <p>Outstanding balances for every customer with at least one unpaid or partially paid invoice</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="welcome-banner" style={{ padding: '16px 20px', borderLeft: '4px solid var(--danger, #ef4444)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-main)', textTransform: 'uppercase', fontWeight: '600' }}>Total Outstanding Due</span>
          <h2 style={{ margin: '4px 0 0', color: 'var(--danger, #ef4444)', fontSize: '24px', fontWeight: '800' }}>
            {formatCurrency(data?.total_due_amount || 0)}
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{customerDues.length} Customer{customerDues.length === 1 ? '' : 's'} with Due</span>
        </div>
      </div>

      {/* Filter bar: Month / Year / Salesman (admin & manager only) / Customer search */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 auto', minWidth: '150px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>Month</label>
          <select
            value={duesMonth}
            onChange={(e) => { setDuesMonth(e.target.value); applyDuesPeriod(e.target.value, duesYear); }}
            style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value="">Whole Year</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '0 0 auto', minWidth: '120px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>Year</label>
          <select
            value={duesYear}
            onChange={(e) => { setDuesYear(e.target.value); applyDuesPeriod(duesMonth, e.target.value); }}
            style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value="">All Time</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {canFilterBySalesman && (
          <div style={{ flex: '0 0 auto', minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>Salesman</label>
            <select
              value={salesmanId}
              onChange={(e) => setSalesmanId(e.target.value)}
              style={{ width: '100%', padding: '6px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            >
              <option value="">All Salesmen</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ flex: '1 1 220px', minWidth: '220px' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '2px' }}>Search Customer</label>
          <input
            type="text"
            placeholder="Name, code, phone, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="modern-form-control"
            style={{ padding: '6px 10px', fontSize: '13px', width: '100%' }}
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={handleResetFilters}
            style={{ background: '#64748b', color: '#fff', border: 'none', padding: '7px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            ✕ Reset Filters
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
      ) : filteredDues.length === 0 ? (
        <div className="welcome-banner" style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
          {customerDues.length === 0 ? '🎉 No outstanding dues right now.' : 'No customers match that search.'}
        </div>
      ) : (
        <div className="card-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Address</th>
                <th>Code</th>
                <th>Phone</th>
                {canFilterBySalesman && <th>Salesman</th>}
                <th style={{ textAlign: 'center' }}>Unpaid Invoices</th>
                <th style={{ textAlign: 'right' }}>Total Billed</th>
                <th style={{ textAlign: 'right' }}>Total Paid</th>
                <th style={{ textAlign: 'right' }}>Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredDues.map((c) => (
                <React.Fragment key={c.customer_id}>
                  <tr
                    onClick={() => setExpandedCustomerId(expandedCustomerId === c.customer_id ? null : c.customer_id)}
                    style={{ cursor: 'pointer' }}
                    title="Click to see invoice-wise breakdown"
                  >
                    <td>
                      <strong>{c.customer_name}</strong>
                      {c.company_name && <div style={{ fontSize: '11px', color: '#64748b' }}>{c.company_name}</div>}
                    </td>
                    <td style={{ fontSize: '12px', color: '#475569', maxWidth: '220px' }}>{c.address || '—'}</td>
                    <td>{c.customer_code}</td>
                    <td>{c.phone}</td>
                    {canFilterBySalesman && <td>{c.salesman_name || '—'}</td>}
                    <td style={{ textAlign: 'center' }}>{c.invoice_count}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.total_grand)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.total_paid)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger, #ef4444)' }}>{formatCurrency(c.total_due)}</td>
                  </tr>
                  {expandedCustomerId === c.customer_id && (
                    <tr>
                      <td colSpan={canFilterBySalesman ? 9 : 8} style={{ padding: 0, background: '#f8fafc' }}>
                        <table className="data-table" style={{ margin: '4px 12px 12px' }}>
                          <thead>
                            <tr>
                              <th>Invoice No.</th>
                              <th>Date</th>
                              <th style={{ textAlign: 'right' }}>Grand Total</th>
                              <th style={{ textAlign: 'right' }}>Paid</th>
                              <th style={{ textAlign: 'right' }}>Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(c.invoices || []).map((inv) => (
                              <tr key={inv.id}>
                                <td>{inv.invoice_number}</td>
                                <td>{formatDate(inv.invoice_date)}</td>
                                <td style={{ textAlign: 'right' }}>{formatCurrency(inv.grand_total)}</td>
                                <td style={{ textAlign: 'right' }}>{formatCurrency(inv.paid_amount)}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--danger, #ef4444)' }}>{formatCurrency(inv.due_amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyDues;
