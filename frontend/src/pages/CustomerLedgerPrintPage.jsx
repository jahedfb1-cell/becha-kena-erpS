import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { formatCurrency, formatDate } from '../utils/format';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import { downloadPrintPdf } from '../utils/pdfDownload';
import { buildStatement, ledgerTypeLabel } from '../utils/ledgerStatement';

/**
 * Standalone A4 print view of one customer's account statement, with an
 * optional from/to date range (query params from_date / to_date). Runs on its
 * own route outside DashboardLayout like the other print pages. Rows come
 * from the same /customers/:id ledger the detail screen shows, run through
 * buildStatement() so a filtered statement starts from the balance brought
 * forward and its closing balance adds up.
 */
const CustomerLedgerPrintPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get('from_date') || '';
  const toDate = searchParams.get('to_date') || '';

  const [customer, setCustomer] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/customers/${id}`);
        if (cancelled) return;
        setCustomer(res.data.data);
        setCompanyProfile(await fetchProfileForRecord(api, null));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load customer ledger');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const statement = useMemo(
    () => buildStatement(customer?.ledgers || [], fromDate, toDate),
    [customer, fromDate, toDate]
  );

  const periodLabel = () => {
    if (fromDate && toDate) return `${formatDate(fromDate)} — ${formatDate(toDate)}`;
    if (fromDate) return `From ${formatDate(fromDate)}`;
    if (toDate) return `Up to ${formatDate(toDate)}`;
    return 'All transactions';
  };

  const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
  const brand = brandFields(companyProfile);
  const getCustomTitle = () => `Customer Ledger _ ${clean(customer?.name)} _ ${clean(periodLabel())} _ by ${clean(brand.footerName)}`;

  useEffect(() => {
    if (loading || !customer) return undefined;
    const applyTitle = () => { document.title = getCustomTitle(); };
    applyTitle();
    window.addEventListener('beforeprint', applyTitle);
    return () => {
      window.removeEventListener('beforeprint', applyTitle);
      document.title = 'Dhakablinds-Ims';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, customer, companyProfile]);

  const handlePrint = () => {
    document.title = getCustomTitle();
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadPrintPdf(getCustomTitle());
    } catch (err) {
      console.error('PDF download failed:', err);
      alert('Could not generate the PDF. Please try the Print button instead.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const backPath = '/customers';

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif' }}>
        <h2>Loading Customer Ledger...</h2>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>{error || 'Customer not found'}</h2>
        <button onClick={() => navigate(backPath)} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ⬅️ Back
        </button>
      </div>
    );
  }

  const th = { background: '#d1d5db', color: '#000' };

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
          📄 Customer Ledger — {customer.name} — {periodLabel()}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={handlePrint} style={{ padding: '6px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#059669', color: '#fff' }}>
            🖨️ Print / Save PDF
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            style={{ padding: '6px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, background: '#0891b2', color: '#fff' }}
          >
            ⬇️ {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button onClick={() => navigate(backPath)} style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#334155', color: '#fff' }}>
            ⬅️ Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      <div
        style={{ maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box' }}
        className="printable-area a4-stretch-area"
      >
        {/* ── HEADER ── */}
        <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            {(companyProfile?.invoice_logo || companyProfile?.company_logo) ? (
              <img
                src={brand.logoSrc}
                alt="Header Logo"
                style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: '140px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 800, color: '#111' }}>{brand.name}</h1>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5', marginTop: '8px' }}>
            <div>
              <strong>{brand.companyAddress || brand.officeAddress}</strong><br />
              Mobile : {brand.mobile}<br />
              Email : {brand.email}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px' }}>
                CUSTOMER LEDGER
              </div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, marginTop: '2px' }}>{periodLabel()}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px' }}>
              <div>Printed: <strong>{formatDate(new Date())}</strong></div>
              <div>Entries: <strong>{statement.rows.length}</strong></div>
            </div>
          </div>
        </div>

        {/* ── Customer block ── */}
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', lineHeight: 1.6 }}>
          <div style={{ fontSize: '14px', fontWeight: 800 }}>{customer.company_name || customer.name}</div>
          {customer.company_name && <div>{customer.name}</div>}
          <div>Code: <strong>{customer.customer_code}</strong>{customer.phone ? <>  |  Phone: <strong>{customer.phone}</strong></> : null}</div>
          {customer.address && <div>{customer.address}</div>}
        </div>

        {/* ── Table ── */}
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '84px', textAlign: 'center' }}>Date</th>
              <th style={{ ...th, width: '84px', textAlign: 'center' }}>Type</th>
              <th style={{ ...th, textAlign: 'left', paddingLeft: '8px' }}>Particulars</th>
              <th style={{ ...th, width: '84px', textAlign: 'right', paddingRight: '8px' }}>Debit</th>
              <th style={{ ...th, width: '84px', textAlign: 'right', paddingRight: '8px' }}>Credit</th>
              <th style={{ ...th, width: '92px', textAlign: 'right', paddingRight: '8px' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.broughtForward !== null && (
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan="5" style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 700 }}>Balance brought forward</td>
                <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 700 }}>{formatCurrency(statement.broughtForward)}</td>
              </tr>
            )}
            {statement.rows.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>No transactions in this period.</td>
              </tr>
            ) : (
              statement.rows.map((l) => (
                <tr key={l.id} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ textAlign: 'center' }}>{formatDate(l.transaction_date)}</td>
                  <td style={{ textAlign: 'center', textTransform: 'uppercase', fontSize: '10px' }}>{ledgerTypeLabel(l.transaction_type)}</td>
                  <td style={{ paddingLeft: '8px' }}>
                    {l.description}
                    {l.payment_note && <div style={{ fontSize: '10px', color: '#475569', fontStyle: 'italic' }}>Note: {l.payment_note}</div>}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '8px' }}>{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                  <td style={{ textAlign: 'right', paddingRight: '8px' }}>{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                  <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 700 }}>{formatCurrency(l.runningBalance)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="3" style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9' }}>Total</td>
              <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9' }}>{formatCurrency(statement.totalDebit)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9' }}>{formatCurrency(statement.totalCredit)}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9', color: statement.closing > 0 ? '#dc2626' : '#16a34a' }}>{formatCurrency(statement.closing)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ marginTop: '14px', fontSize: '12px', textAlign: 'right' }}>
          Closing balance (due): <strong>{formatCurrency(statement.closing)}</strong>
        </div>
      </div>
    </div>
  );
};

export default CustomerLedgerPrintPage;
