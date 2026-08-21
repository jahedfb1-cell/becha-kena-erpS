import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * Every salesman's own customer due list, scoped server-side to their user
 * id (a manager sees their team + themselves; an admin sees everyone) - see
 * ReportController@salesDue. Deliberately its own page rather than a tab
 * inside the admin-only Reports hub, since a salesman has none of the
 * permissions that hub's other report cards need and shouldn't see other
 * salesmen's numbers.
 */
const MyDues = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);

  const fetchDues = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/reports/sales-due');
      setData(res.data?.data || null);
    } catch (err) {
      console.error('Error fetching due list:', err);
      setError('Failed to load the due list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDues();
  }, [fetchDues]);

  const customerDues = data?.customer_dues || [];

  const filteredDues = useMemo(() => {
    if (!search.trim()) return customerDues;
    const q = search.trim().toLowerCase();
    return customerDues.filter((c) =>
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.customer_code || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  }, [customerDues, search]);

  const pageTitle = user?.role === 'salesman'
    ? 'My Customer Dues'
    : user?.role === 'manager'
      ? "My Team's Customer Dues"
      : 'Customer Dues';

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

      <div className="form-group" style={{ margin: '0 0 16px', maxWidth: '360px' }}>
        <input
          type="text"
          placeholder="Search customer name, code, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="modern-form-control"
          style={{ padding: '8px 12px', fontSize: '13px' }}
        />
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
                <th>Code</th>
                <th>Phone</th>
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
                    <td>{c.customer_code}</td>
                    <td>{c.phone}</td>
                    <td style={{ textAlign: 'center' }}>{c.invoice_count}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.total_grand)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.total_paid)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger, #ef4444)' }}>{formatCurrency(c.total_due)}</td>
                  </tr>
                  {expandedCustomerId === c.customer_id && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: '#f8fafc' }}>
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
