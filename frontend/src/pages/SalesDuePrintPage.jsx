import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { formatCurrency, formatDate } from '../utils/format';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import { downloadPrintPdf } from '../utils/pdfDownload';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Standalone print view for the Sales Due Report (Reports > Sales Due
 * Report). Printing happens on its own route, outside DashboardLayout,
 * exactly as QuotationPrintPage/InvoicePrintPage/PriceListPrintPage do —
 * see printing-uses-standalone-routes. Reports.jsx's own "Print / PDF"
 * button just calls window.print() on the whole dashboard page (filters,
 * sidebar and all); this instead reuses the same /reports/sales-due data
 * the report screen shows, rendered as a clean, letterheaded document.
 */
const SalesDuePrintPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fromDate = searchParams.get('from_date') || '';
  const toDate = searchParams.get('to_date') || '';
  const customerId = searchParams.get('customer_id') || '';
  const salesmanId = searchParams.get('salesman_id') || '';

  const [invoices, setInvoices] = useState([]);
  const [totalDue, setTotalDue] = useState(0);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {};
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
        if (customerId) params.customer_id = customerId;
        if (salesmanId) params.salesman_id = salesmanId;

        const res = await api.get('/reports/sales-due', { params });
        if (cancelled) return;

        const data = res.data?.data || {};
        setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
        setTotalDue(parseFloat(data.total_due_amount) || 0);
        // Not tied to any one record's brand — the current user's own
        // company profile, same as fetchProfileForRecord(api, null) falls
        // back to.
        setCompanyProfile(await fetchProfileForRecord(api, null));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Failed to load Sales Due Report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [fromDate, toDate, customerId, salesmanId]);

  // Turns the from_date/to_date query params back into a human period
  // label: a single whole month, a whole calendar year, an arbitrary
  // range, or "All Time" when neither is set — mirrors how the Month/Year
  // quick-picker on Reports.jsx builds that range in the first place.
  const periodLabel = () => {
    if (!fromDate && !toDate) return 'All Time';
    if (fromDate && toDate) {
      const [fy, fm, fd] = fromDate.split('-').map(Number);
      const [ty, tm, td] = toDate.split('-').map(Number);
      if (fy === ty && fm === tm && fd === 1 && td === new Date(ty, tm, 0).getDate()) {
        return `${MONTH_NAMES[fm - 1]} ${fy}`;
      }
      if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) {
        return `Year ${fy}`;
      }
      return `${formatDate(fromDate)} — ${formatDate(toDate)}`;
    }
    return fromDate ? `From ${formatDate(fromDate)}` : `Up to ${formatDate(toDate)}`;
  };

  const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
  const brand = brandFields(companyProfile);

  const getCustomTitle = () => `Sales Due Report _ ${clean(periodLabel())} _ by ${clean(brand.footerName)}`;

  // Same guaranteed-filename pattern as every other print page: set on
  // load, re-applied on the browser's own 'beforeprint' event (covers
  // Ctrl+P / browser print-menu, which bypass handlePrint() entirely), and
  // reset on unmount.
  useEffect(() => {
    if (loading) return undefined;
    const applyTitle = () => { document.title = getCustomTitle(); };
    applyTitle();
    window.addEventListener('beforeprint', applyTitle);
    return () => {
      window.removeEventListener('beforeprint', applyTitle);
      document.title = 'Dhakablinds-Ims';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, invoices, companyProfile]);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif' }}>
        <h2>Loading Sales Due Report...</h2>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>{error}</h2>
        <button onClick={() => navigate('/reports?type=sales-due-report')} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ⬅️ Back to Reports
        </button>
      </div>
    );
  }

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}>
          📄 Sales Due Report — {periodLabel()}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#059669', color: '#fff' }}
          >
            🖨️ Print / Save PDF
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Downloads the PDF directly with the correct filename, instead of going through the browser's Save as PDF dialog"
            style={{ padding: '6px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, background: '#0891b2', color: '#fff' }}
          >
            ⬇️ {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            onClick={() => navigate('/reports?type=sales-due-report')}
            style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#334155', color: '#fff' }}
          >
            ⬅️ Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      <div
        style={{
          maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box',
        }}
        className="printable-area a4-stretch-area"
      >
        {/* ── HEADER ── */}
        <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            {(companyProfile?.invoice_logo || companyProfile?.company_logo) ? (
              <img
                src={brand.logoSrc}
                alt="Report Header Logo"
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
                SALES DUE REPORT
              </div>
              <div style={{ fontSize: '12px', color: '#475569', fontWeight: 700, marginTop: '2px' }}>
                {periodLabel()}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px' }}>
              <div>Printed: <strong>{formatDate(new Date())}</strong></div>
              <div>Invoices: <strong>{invoices.length}</strong></div>
            </div>
          </div>
        </div>

        {/* ── Total Due Banner ── */}
        <div style={{ background: '#fff3cd', border: '1.5px solid #ffeeba', padding: '10px 16px', borderRadius: '4px', marginBottom: '16px', textAlign: 'center' }}>
          <span style={{ fontSize: '12px', color: '#856404', fontWeight: 700, textTransform: 'uppercase' }}>Total Outstanding Sales Dues: </span>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#dc3545', marginLeft: '8px' }}>{formatCurrency(totalDue)}</span>
        </div>

        {/* ── Table ── */}
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          <thead>
            <tr>
              <th style={{ width: '40px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>#</th>
              <th style={{ textAlign: 'left', paddingLeft: '8px', background: '#d1d5db', color: '#000' }}>Invoice No.</th>
              <th style={{ textAlign: 'left', paddingLeft: '8px', background: '#d1d5db', color: '#000' }}>Customer</th>
              <th style={{ textAlign: 'center', background: '#d1d5db', color: '#000' }}>Date</th>
              <th style={{ textAlign: 'right', paddingRight: '8px', background: '#d1d5db', color: '#000' }}>Grand Total</th>
              <th style={{ textAlign: 'right', paddingRight: '8px', background: '#d1d5db', color: '#000' }}>Paid</th>
              <th style={{ textAlign: 'right', paddingRight: '8px', background: '#d1d5db', color: '#000' }}>Due</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No outstanding dues for this period.
                </td>
              </tr>
            ) : (
              invoices.map((inv, idx) => (
                <tr key={inv.id || idx}>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                  <td style={{ paddingLeft: '8px', fontWeight: 700 }}>{inv.invoice_number || `#${inv.id}`}</td>
                  <td style={{ paddingLeft: '8px' }}>
                    <strong>{inv.customer?.company_name || inv.customer?.name || 'N/A'}</strong>
                    {inv.customer?.phone && <div style={{ fontSize: '10px', color: '#64748b' }}>{inv.customer.phone}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }}>{formatDate(inv.invoice_date)}</td>
                  <td style={{ textAlign: 'right', paddingRight: '8px' }}>{formatCurrency(inv.grand_total)}</td>
                  <td style={{ textAlign: 'right', paddingRight: '8px', color: '#16a34a' }}>{formatCurrency(inv.paid_amount)}</td>
                  <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 700, color: '#dc2626' }}>{formatCurrency(inv.due_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          {invoices.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9' }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9' }}>
                  {formatCurrency(invoices.reduce((s, i) => s + (parseFloat(i.grand_total) || 0), 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9', color: '#16a34a' }}>
                  {formatCurrency(invoices.reduce((s, i) => s + (parseFloat(i.paid_amount) || 0), 0))}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, paddingRight: '8px', background: '#f1f5f9', color: '#dc2626' }}>
                  {formatCurrency(totalDue)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default SalesDuePrintPage;
