import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { formatCurrency, formatDate } from '../utils/format';

/**
 * NBR Mushak 6.3 VAT challans.
 *
 * Only Western Blinds Ltd is VAT registered, so a Dhaka Blinds login has
 * nothing to do here. The backend enforces that on its own; this page just
 * says so plainly instead of showing an empty list with no explanation.
 */
const VAT_REGISTERED_BRAND_ID = 2;

const Mushak = () => {
  const { user } = useAuth();
  // Booleans, not the can() closure: a fresh function identity on every
  // render would restart the effect below forever.
  const canIssue = user?.role === 'admin' || !!user?.permissions?.includes('mushak:issue');

  const [challans, setChallans] = useState([]);
  const [issuable, setIssuable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');

  // Issue modal
  const [issuingInvoice, setIssuingInvoice] = useState(null);
  const [buyerBin, setBuyerBin] = useState('');
  const [saveBinToCustomer, setSaveBinToCustomer] = useState(true);
  const [issuedByDesignation, setIssuedByDesignation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isVatBrand = user?.brand_id === VAT_REGISTERED_BRAND_ID;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, issuableRes] = await Promise.all([
        api.get('/mushak', { params: { all: true, search: search || undefined } }),
        canIssue
          ? api.get('/mushak/issuable')
          : Promise.resolve({ data: { data: [] } }),
      ]);
      setChallans(listRes.data?.data || []);
      setIssuable(issuableRes.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load VAT challans.');
    } finally {
      setLoading(false);
    }
  }, [search, canIssue]);

  useEffect(() => {
    if (isVatBrand) load();
    else setLoading(false);
  }, [isVatBrand, load]);

  const openIssueModal = (invoice) => {
    setIssuingInvoice(invoice);
    setBuyerBin(invoice.customer?.bin || '');
    setSaveBinToCustomer(true);
    setIssuedByDesignation('');
  };

  const submitIssue = async () => {
    if (!issuingInvoice) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/mushak/issue/${issuingInvoice.id}`, {
        buyer_bin: buyerBin || null,
        save_bin_to_customer: saveBinToCustomer,
        issued_by_designation: issuedByDesignation || null,
      });
      setNotice(res.data?.message || 'VAT challan issued.');
      setIssuingInvoice(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not issue the VAT challan.');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * The print view is a Blade page behind auth:sanctum, and a plain
   * window.open would arrive without the bearer token this app keeps in
   * localStorage. So the HTML is fetched through axios, which does carry it,
   * and written into the new window.
   */
  const openPrintView = async (challan) => {
    const win = window.open('', '_blank');
    try {
      const res = await api.get(`/mushak/${challan.id}/print`, {
        baseURL: (api.defaults.baseURL || '').replace(/\/api\/?$/, ''),
        responseType: 'text',
      });
      win.document.write(res.data);
      win.document.close();
    } catch {
      win?.close();
      setError('Could not open the print view.');
    }
  };

  if (!isVatBrand) {
    return (
      <div className="content-container animate-fade-in">
        <h2>VAT Challan (Mushak 6.3)</h2>
        <p style={{ marginTop: '12px', color: 'var(--text-muted, #64748b)' }}>
          VAT challans are issued by Western Blinds Ltd only. Your account is not
          set to that trade name, so there is nothing to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="content-container animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2>VAT Challan (Mushak 6.3)</h2>
        <input
          type="text"
          placeholder="Search challan no. / buyer / BIN"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
          style={{ padding: '7px 10px', minWidth: '260px' }}
        />
      </div>

      {error && <div style={{ color: 'var(--danger, #ef4444)', marginTop: '10px' }}>{error}</div>}
      {notice && <div style={{ color: 'var(--success, #10b981)', marginTop: '10px' }}>{notice}</div>}

      {canIssue && (
        <div style={{ marginTop: '18px' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>
            Invoices awaiting a VAT challan ({issuable.length})
          </h3>
          {issuable.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>
              None. An invoice appears here once its order is marked VAT applicable
              and no challan has been issued against it yet.
            </p>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>VAT rate</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {issuable.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.invoice_number}</td>
                      <td>{inv.customer?.company_name || inv.customer?.name || '—'}</td>
                      <td>{inv.quotation?.vat_rate ?? '—'}%</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(inv.grand_total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-modal-submit" onClick={() => openIssueModal(inv)}>
                          Issue challan
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Issued challans</h3>
        {loading ? (
          <div className="flex-center" style={{ padding: '30px' }}><div className="spinner"></div></div>
        ) : challans.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)' }}>No VAT challans issued yet.</p>
        ) : (
          <div className="card-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Challan no.</th>
                  <th>Date</th>
                  <th>Buyer</th>
                  <th>Buyer BIN</th>
                  <th>Rate</th>
                  <th style={{ textAlign: 'right' }}>Taxable</th>
                  <th style={{ textAlign: 'right' }}>VAT</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {challans.map((c) => (
                  <tr key={c.id}>
                    <td>{c.challan_number}</td>
                    <td>{formatDate(c.issue_date)}</td>
                    <td>{c.buyer_name}</td>
                    <td>{c.buyer_bin || '—'}</td>
                    <td>{c.vat_rate}%</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.taxable_amount)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.vat_amount)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(c.grand_total)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="clickable-link" onClick={() => openPrintView(c)}>Print</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {issuingInvoice && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card, #fff)', padding: '20px', borderRadius: '10px', width: 'min(460px, 92vw)' }}>
            <h3 style={{ marginBottom: '12px' }}>Issue VAT challan</h3>
            <p style={{ fontSize: '13px', marginBottom: '12px' }}>
              Invoice <strong>{issuingInvoice.invoice_number}</strong> —{' '}
              {issuingInvoice.customer?.company_name || issuingInvoice.customer?.name}
            </p>

            <div className="form-group">
              <label style={{ fontSize: '13px' }}>Buyer BIN</label>
              <input
                type="text"
                value={buyerBin}
                onChange={(e) => setBuyerBin(e.target.value)}
                placeholder="Leave blank if the buyer is not VAT registered"
              />
              <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={saveBinToCustomer}
                  onChange={(e) => setSaveBinToCustomer(e.target.checked)}
                  style={{ width: 'auto', margin: 0 }}
                />
                Also save this BIN to the customer record
              </label>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '13px' }}>Issued by — designation</label>
              <input
                type="text"
                value={issuedByDesignation}
                onChange={(e) => setIssuedByDesignation(e.target.value)}
                placeholder="e.g. Accounts Officer"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn-modal-cancel" onClick={() => setIssuingInvoice(null)} disabled={submitting}>Cancel</button>
              <button className="btn-modal-submit" onClick={submitIssue} disabled={submitting}>
                {submitting ? 'Issuing…' : 'Issue challan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Mushak;
