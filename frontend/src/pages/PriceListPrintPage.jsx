import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { formatDate } from '../utils/format';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import renderRichText from '../utils/renderRichText';
import { downloadPrintPdf } from '../utils/pdfDownload';

/**
 * Standalone print view for a saved price list.
 *
 * Printing happens on its own route, outside DashboardLayout, exactly as
 * QuotationPrintPage and InvoicePrintPage do. That is not a stylistic
 * choice: the app's global @media print rules hide the page chrome by name
 * (`.sidebar`, `.header`, `.main-content > *`), and `.main-content` is not a
 * class this app actually renders — DashboardLayout uses `.dashboard-content`
 * — so nothing hides the dashboard wrapper. Printing from a modal inside the
 * layout therefore emits the dashboard's grey `--bg-base` background over the
 * whole sheet with the document nowhere to be seen. On this route the
 * dashboard is not in the DOM at all, so there is nothing to hide.
 */
const PriceListPrintPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [record, setRecord] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // 'standard' draws our own letterhead; 'pad' leaves the top of the sheet
  // blank for pre-printed company pad paper.
  const printType = searchParams.get('type') === 'pad' ? 'pad' : 'standard';
  const isPad = printType === 'pad';

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/price-lists/${id}`);
        const priceList = res.data?.data;
        if (cancelled) return;

        setRecord(priceList);
        // Brand comes from the record, not the logged-in user: reprinting an
        // old Dhaka Blinds sheet from a Western Blinds account must still
        // produce the original Dhaka Blinds document.
        setCompanyProfile(await fetchProfileForRecord(api, priceList));
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Price list not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const getCustomTitle = () => {
    if (!record) return 'Price List _ Dhaka Blinds';
    const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
    const brandName = brandFields(companyProfile).footerName;
    const customer = record.customer_company || record.customer_name || 'Price List';
    return `${clean(customer)} _ Price List _ ${clean(record.reference_no)} _ by ${clean(brandName)}`;
  };

  // The saved PDF takes its filename from document.title, so it has to name
  // the customer and the brand the sheet was raised under — and that has to
  // be reapplied on the browser's own 'beforeprint' event too, not just set
  // once here, because a native Ctrl+P or browser print-menu click bypasses
  // handlePrint() entirely. 'beforeprint' fires right before *any* print
  // dialog opens regardless of how it was triggered.
  useEffect(() => {
    if (!record) return undefined;
    const applyTitle = () => { document.title = getCustomTitle(); };
    applyTitle();
    window.addEventListener('beforeprint', applyTitle);

    return () => {
      window.removeEventListener('beforeprint', applyTitle);
      document.title = 'Dhakablinds-Ims';
    };
  }, [record, companyProfile]);

  const handlePrint = () => {
    document.title = getCustomTitle();
    window.print();
  };

  // Guaranteed-filename alternative to "Print > Save as PDF": that flow
  // depends on the browser reading document.title at the right moment,
  // which some Chrome setups/timings get wrong. This renders the document
  // straight to a PDF file and downloads it under the exact same name via
  // the <a download> attribute, which every browser honors unconditionally.
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
        <h2>Loading Price List...</h2>
      </div>
    );
  }

  if (error || !record) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>{error || 'Price list not found'}</h2>
        <button onClick={() => navigate('/price-lists')} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ⬅️ Back to Price Lists
        </button>
      </div>
    );
  }

  const brand = brandFields(companyProfile);
  const items = record.items || [];

  const setType = (newType) => setSearchParams({ type: newType });

  const toggleStyle = (type) => ({
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    background: printType === type ? '#2563eb' : '#334155',
    color: '#fff',
  });

  const documentTitle = 'PRICE LIST QUOTATION';

  const documentMeta = (
    <>
      <div>Date: <strong>{formatDate(record.issue_date)}</strong></div>
      <div>Ref No: <strong>{record.reference_no}</strong></div>
    </>
  );

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setType('standard')} style={toggleStyle('standard')}>
            🖨️ Standard Print
          </button>
          <button onClick={() => setType('pad')} style={toggleStyle('pad')}>
            📝 Pad Print
          </button>
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
            onClick={() => navigate('/price-lists')}
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
          // 281mm = A4's 297mm minus the @page rule's 8mm top and bottom
          // margins, i.e. the real printable area of one sheet. Flex only
          // ever grows into leftover space, so a long rate card still
          // paginates normally.
          display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box',
        }}
        className={'printable-area a4-stretch-area' + (isPad ? ' pad-stretch-area' : '')}
      >
        {/* ── HEADER ── */}
        {!isPad ? (
          <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
            {/* Tested on the raw path field, not on *_logo_url: getLogoUrl()
                never returns null — it hands back /logo-demo.svg whenever
                nothing is uploaded, so the _url field is always truthy and
                could never select this branch. A brand with no logo would
                otherwise print the demo placeholder on a client's rate card;
                the trade name as text is the safe stand-in. */}
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              {(companyProfile?.invoice_logo || companyProfile?.company_logo) ? (
                <img
                  src={brand.logoSrc}
                  alt="Invoice & Print Header Logo"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    height: 'auto',
                    maxHeight: '140px',
                    objectFit: 'contain',
                    display: 'block',
                    margin: '0 auto'
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 800, color: '#111' }}>
                  {brand.name}
                </h1>
              )}
            </div>

            <div style={{
              fontSize: '9.5px',
              color: '#222',
              textAlign: 'center',
              fontWeight: '600',
              paddingBottom: '4px',
              borderBottom: '1.5px solid #dc2626',
              marginBottom: '12px'
            }}>
              Fashionable Curtains, Vertical, Horizontal Venetian, Roller blinds, Zebra/Combi Double Layer Shade, Remote Control Roller Curtains &amp; PVC Air Strip Door Curtains Importer &amp; Govt. Supplier
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5' }}>
              <div>
                <strong>{brand.companyAddress || brand.officeAddress}</strong><br/>
                Mobile : {brand.mobile}<br/>
                Email : {brand.email}<br/>
                Web : {brand.web}
                {brand.vatRegNo && <div>VAT Reg No : {brand.vatRegNo}</div>}
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px', textAlign: 'center' }}>
                  {documentTitle}
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                {documentMeta}
              </div>
            </div>
          </div>
        ) : (
          /* Spacer for pre-printed Pad paper */
          <div style={{ display: 'block', marginBottom: '16px' }}>
            <div style={{ height: '36mm' }} className="pad-print-spacer"></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center' }}>
              <div></div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', textAlign: 'center' }}>{documentTitle}</div>
              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                {documentMeta}
              </div>
            </div>
          </div>
        )}

        {/* ── 2-COLUMN METADATA HEADER BOX ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '16px', marginBottom: '16px' }}>
          {/* Customer Box (Left) */}
          <div style={{ flex: 1.2 }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>
              Quotation To:
            </div>
            <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', height: 'calc(100% - 22px)' }}>
              <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{record.customer_name || 'Valued Customer'}</strong>
              {record.customer_company && (
                <div style={{ fontSize: '12px', color: '#333' }}>{record.customer_company}</div>
              )}
              {record.customer_address && (
                <div style={{ fontSize: '12px', color: '#333' }}>Address: {record.customer_address}</div>
              )}
              {record.customer_phone && (
                <div style={{ fontSize: '12px', color: '#333' }}>Mobile: {record.customer_phone}</div>
              )}
            </div>
          </div>

          {/* Info Box (Right) */}
          <div style={{ flex: 0.8, border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>
              Quotation Info:
            </div>
            {record.subject && (
              <div style={{ fontSize: '13px', color: '#000', margin: '4px 0' }}>
                Subject: <strong style={{ fontSize: '14px', color: '#0f172a' }}>{record.subject}</strong>
              </div>
            )}
            {record.validity && (
              <div style={{ fontSize: '12px', color: '#333', marginBottom: '3px' }}>
                Rate Validity: <strong>{record.validity}</strong>
              </div>
            )}
          </div>
        </div>

        {/* ── Rate table ── */}
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          <thead>
            <tr>
              <th style={{ width: '50px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Sl No.</th>
              <th style={{ textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000' }}>Description of Goods &amp; Specifications</th>
              <th style={{ width: '100px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Colors / Code</th>
              <th style={{ width: '90px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>UOM</th>
              <th style={{ width: '90px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Rate Tk.</th>
              <th style={{ width: '130px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No items in price list.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr key={item.id ?? idx}>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {idx + 1}
                  </td>
                  <td style={{ textAlign: 'left', paddingLeft: '12px' }}>
                    <strong style={{ fontSize: '13px', color: '#000', display: 'block' }}>
                      {item.product_name || 'Custom Blind Item'}
                    </strong>
                    {item.description &&
                      renderRichText(item.description, {
                        fontSize: '11.5px',
                        color: '#222',
                        lineHeight: 1.35,
                      })}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {item.color_code || '-'}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>
                    {item.uom || '1 Sq.Ft'}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: 600 }}>
                    {parseFloat(item.rate || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ textAlign: 'center', color: '#333' }}>
                    {item.remarks || '-'}
                  </td>
                </tr>
              ))
            )}

            {/* Absorbs whatever page height the real rows leave over, so a
                three-line rate card still fills the A4 sheet and the terms
                and signature blocks stay pinned to the bottom — the same
                mechanism QuotationPrintPage uses. Each cell keeps its
                left/right/bottom border so the column dividers run on
                through the blank space, but hides its top border so no
                extra line appears where the data ends. Has no effect once
                real rows already fill the page: flex only grows into space
                that is actually left over. */}
            <tr className="a4-filler-row">
              {Array.from({ length: 6 }).map((_, colIdx) => (
                <td
                  key={colIdx}
                  style={{
                    borderTop: 'hidden',
                    borderBottom: '1px solid #ccc',
                    borderLeft: '1px solid #ccc',
                    borderRight: '1px solid #ccc',
                    padding: 0,
                  }}
                ></td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* ── Terms ── */}
        {record.terms && (
          <div
            className="page-break-avoid"
            style={{
              border: '1.5px solid #000',
              padding: '10px 14px',
              marginBottom: '24px',
              background: '#fff',
            }}
          >
            <div
              style={{
                fontWeight: 'bold',
                fontSize: '12px',
                textDecoration: 'underline',
                marginBottom: '4px',
                color: '#000',
              }}
            >
              Terms &amp; Conditions / Special Notes:
            </div>
            <div
              style={{
                fontSize: '11.5px',
                color: '#111',
                whiteSpace: 'pre-line',
                lineHeight: 1.45,
              }}
            >
              {record.terms}
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="page-break-avoid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', margin: '24px 0 16px 0', fontSize: '12px' }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>
              Please Confirm Acceptance of this Quote
            </strong>
            <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px', display: 'flex', alignItems: 'flex-end', padding: '4px 8px', fontSize: '11px', color: '#475569' }}>
              Ref: {record.creator?.name || 'Sales Department'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>Authorized Signature</strong>
            <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px', marginBottom: '4px' }}></div>
            <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px' }}>{brand.footerName}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PriceListPrintPage;
