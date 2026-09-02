import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { formatDate } from '../utils/format';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import { pvcSlatCount, isPvcItem } from '../utils/billing';
import renderRichText from '../utils/renderRichText';
import { lineSpecification, hasSpecification, specificationKey } from '../utils/lineSpecification';
import { downloadPrintPdf } from '../utils/pdfDownload';

/**
 * Delivery Challan print page - design matches the reference "Dhaka Blinds"
 * challan layout exactly (company header, No/Date row, Bill To/Ship To
 * boxes, SL/Colour/Length/Height/Pcs/Quantity-Sq.Ft table with sizes
 * grouped under one product row, Received By/Thanking You signatures,
 * Notes box, thank-you footer) but sources its data from the invoice
 * being printed, not the reference document.
 */
// PVC strip-curtain items (e.g. "PVC Strip Door Curtain" / "2mm Clear Water
// Co") are billed by total width — slat count × each slat's width — rather
// than the customer's requested opening width. The printed Length column
// shows that total-width figure for these items instead of the raw width,
// matching the "T. Width (in)" figure shown for the same products in the
// quotation builder and on the quotation print page.
const getDisplayWidth = (item) => {
  const width = parseFloat(item.width) || 0;
  if (!isPvcItem(item)) return width;
  const slatSize = parseFloat(item.product?.product_size) || 8;
  // Falls back to the shared pvcSlatCount() rule (round up only past the
  // 3/4-slat mark) rather than a plain Math.ceil, so an item whose slat
  // count wasn't already saved on the record still bills the same width
  // here as it would in the quotation builder or on the PVC Challan.
  const slats = (item.slats !== undefined && item.slats !== null && item.slats !== '')
    ? parseInt(item.slats)
    : pvcSlatCount(width);
  return Math.round(slats * slatSize * 100) / 100;
};

const ChallanPrintPage = () => {
  const { id } = useParams(); // invoice id
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const iRes = await api.get(`/invoices/${id}`);
      const record = iRes.data?.data;
      if (record) {
        setInvoice(record);
      } else {
        setError('Invoice not found');
      }
      // Sequential rather than parallel on purpose: which brand's profile
      // to load is only known once the invoice has come back.
      setCompanyProfile(await fetchProfileForRecord(api, record));
    } catch (err) {
      console.error('Error loading challan print data:', err);
      setError('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const getCustomTitle = () => {
    if (!invoice) return 'Delivery Challan _ Dhaka Blinds';
    const cust = invoice.customer || invoice.quotation?.customer || {};
    const rawCustomerName = cust.company_name || cust.name || 'Customer';
    const allItems = (invoice.items && invoice.items.length > 0) ? invoice.items : (invoice.quotation?.items || []);
    
    const categories = Array.from(new Set(
      allItems
        .map(item => item.product?.category?.name || item.product?.category_name || item.product?.name || '')
        .filter(Boolean)
    ));
    const rawCategoryName = categories.length > 0 ? categories.join(', ') : 'Zebra Blinds';

    const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
    const brandName = brandFields(companyProfile).footerName;

    return `${clean(rawCustomerName)} _ ${clean(rawCategoryName)} _ Delivery Challan _ by ${clean(brandName)}`;
  };

  // The saved PDF's filename comes from document.title at the moment the
  // browser's print/save dialog opens. Setting it only here (once the data
  // has loaded) covers the common case, but a native Ctrl+P or a browser
  // print-menu click bypasses handlePrint() entirely — so also re-apply the
  // title on the browser's own 'beforeprint' event, which fires right before
  // *any* print dialog opens regardless of how it was triggered. That's what
  // makes the custom filename reliable everywhere, not just on our button.
  useEffect(() => {
    if (!invoice) return undefined;
    const applyTitle = () => { document.title = getCustomTitle(); };
    applyTitle();
    window.addEventListener('beforeprint', applyTitle);
    return () => {
      window.removeEventListener('beforeprint', applyTitle);
      document.title = 'Dhakablinds-Ims';
    };
  }, [invoice, companyProfile]);

  const handleGenerateChallan = async () => {
    setGenerating(true);
    try {
      await api.post(`/challans/generate/${id}`);
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to generate delivery challan.');
    } finally {
      setGenerating(false);
    }
  };

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
        <h2>Loading Delivery Challan...</h2>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>{error || 'Invoice not found'}</h2>
        <button onClick={() => navigate('/invoices')} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ⬅️ Back to Invoices
        </button>
      </div>
    );
  }

  const challan = invoice.delivery_challans?.[0] || null;
  const customer = invoice.customer || invoice.quotation?.customer || {};
  const quotation = invoice.quotation || {};
  const items = quotation.items || invoice.items || [];
  const brand = brandFields(companyProfile);
  const logoSrc = brand.logoSrc;
  const shipToAddress = challan?.delivery_address || quotation.delivery_address || customer?.address || 'Dhaka, Bangladesh';

  // No challan has been generated for this invoice yet.
  if (!challan) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>No Delivery Challan generated yet for Invoice #{invoice.invoice_number}</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleGenerateChallan}
            disabled={generating}
            style={{ padding: '10px 24px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
          >
            {generating ? 'Generating...' : '🚚 Generate Delivery Challan Now'}
          </button>
          <button onClick={() => navigate(`/invoices/print/${id}`)} style={{ padding: '10px 24px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            ⬅️ Back to Invoice
          </button>
        </div>
      </div>
    );
  }

  // Group items so a product with several sizes shows its description
  // and colour code once (rowSpan) with one merged Quantity/Sq.Ft total,
  // matching how the invoice/quotation print pages already group rows.
  const buildGroups = (rawItems) => {
    const map = new Map();
    rawItems.forEach(item => {
      const prodId = item.product_id || item.product?.id || 'noprod';
      const variantName = item.variant?.name || item.product?.product_code || '';
      const unitPrice = parseFloat(item.unit_price) || 0;
      const notes = specificationKey(item);
      const key = `${prodId}-${variantName}___${unitPrice}___${notes}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(item);
    });
    return Array.from(map.values());
  };

  const groups = buildGroups(items);

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP PRINT CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>🚚 Delivery Challan: {challan.challan_number}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#0066ff', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🖨️</span> Print PDF
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Downloads the PDF directly with the correct filename, instead of going through the browser's Save as PDF dialog"
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⬇️</span> {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          {items.some(isPvcItem) && (
            <button
              onClick={() => navigate(`/invoices/print/${id}/pvc-challan`)}
              style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              🧵 PVC Challan
            </button>
          )}
          <button
            onClick={() => navigate(`/invoices/print/${id}`)}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      {/* Matches InvoicePrintPage and QuotationPrintPage exactly, because the
          A4 fill only works when this element is the sole owner of its box
          model. .quotation-print-container was on here for its typography,
          but it also carries max-width, padding and width:100%, which fight
          the inline flex/min-height sizing this needs — and it is a second
          selector the print rules target, re-applying display:block and
          page-break-inside:avoid to the very element that has to be a
          281mm flex column. The typography it provided is set inline below
          instead, so the sheet still reads the same. */}
      <div
        style={{
          maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
          color: '#000', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: '12px', lineHeight: 1.4,
          display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box'
        }}
        className="printable-area a4-stretch-area"
      >

        {/* ── HEADER ──
            The standard letterhead every printed document in this app uses
            (see QuotationPrintPage): brand logo image, office address, red
            rule, then contact details / document title / document meta laid
            out in three columns. This page previously typed the company name
            as an <h1> and stacked the contact lines, which is why its header
            did not match the rest. `display: block` overrides the flex on
            .print-header while keeping that class's orange bottom rule. */}
        <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
          {/* Tested on the raw path field, not on *_logo_url: getLogoUrl()
              never returns null — it hands back /logo-demo.svg whenever
              nothing is uploaded, so the _url field is always truthy and
              could never select this branch. A brand with no logo would
              otherwise print the demo placeholder on a customer's challan;
              the trade name as text is what this page printed before it
              gained the standard letterhead. */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            {(companyProfile?.invoice_logo || companyProfile?.company_logo) ? (
              <img
                src={logoSrc}
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

          {/* Office Address Centered Horizontal Line */}
          <div style={{
            fontSize: '11px',
            color: '#222',
            textAlign: 'center',
            fontWeight: '700',
            paddingBottom: '4px',
            marginBottom: '2px',
            textTransform: 'uppercase',
            letterSpacing: '0.3px'
          }}>
            Office Address : {brand.officeAddress}
          </div>

          {/* Red Divider Line under Logo */}
          <div style={{
            borderBottom: '1.5px solid #dc2626',
            marginBottom: '12px',
            width: '100%'
          }}></div>

          {/* 3-Column Info Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'flex-start', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5' }}>
            <div>
              Mobile : {brand.mobile}<br/>
              Email : {brand.email}<br/>
              Web : {brand.web}
              {brand.vatRegNo && <div>VAT Reg No : {brand.vatRegNo}</div>}
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px', textAlign: 'center' }}>
                Delivery Challan
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '12px' }}>
              <div>Date : <strong>{formatDate(challan.delivery_date || challan.created_at)}</strong></div>
              <div>Challan No. : <strong>{challan.challan_number}</strong></div>
            </div>
          </div>
        </div>

        {/* Delivery Challan to box */}
        <div style={{ marginBottom: '20px', width: '30%', minWidth: '240px' }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>DELIVERY CHALLAN to :</div>
            <div style={{ border: '1px solid #000', padding: '8px 12px', borderRadius: '2px' }}>
              <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
              <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka'}</div>
              {customer?.address_2 && (
                <div style={{ fontSize: '12px', color: '#333' }}>{customer.address_2}</div>
              )}
              <div style={{ fontSize: '12px', color: '#333' }}>{customer?.phone}</div>
            </div>
          </div>
        </div>

        {/* Items table */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>SL No.</th>
              <th style={{ textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Description of Goods</th>
              <th style={{ width: '75px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Colour</th>
              <th style={{ width: '65px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>T. Width (in)</th>
              <th style={{ width: '65px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Height</th>
              <th style={{ width: '50px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Pcs</th>
              <th style={{ width: '110px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Quantity / Sq.Ft</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#64748b', border: '1px solid #cbd5e1' }}>No line items found.</td>
              </tr>
            ) : (
              groups.map((rows, groupIdx) => {
                const firstItem = rows[0];
                const span = rows.length;
                // getDisplayWidth() rather than the raw item width, so a
                // PVC row's total-width figure drives the sq.ft math here
                // too, not the doorway width.
                const groupTotalSqft = rows.reduce((sum, item) => {
                  const w = getDisplayWidth(item);
                  const h = parseFloat(item.height) || 0;
                  const fallback = Math.round(((w * h) / 144) * 100) / 100;
                  return sum + (parseFloat(item.billed_sqft) || fallback);
                }, 0);

                return rows.map((item, rowInGroup) => {
                  const isFirst = rowInGroup === 0;
                  return (
                    <tr key={item.id}>
                      {isFirst && (
                        <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                          {groupIdx + 1}
                        </td>
                      )}
                      {isFirst && (
                        <td rowSpan={span} style={{ textAlign: 'left', verticalAlign: 'top', paddingTop: '8px', paddingLeft: '12px', border: '1px solid #cbd5e1' }}>
                          <strong style={{ fontSize: '13px', color: '#111' }}>{firstItem.product?.name || 'Blind Item'}</strong>
                          {hasSpecification(firstItem) ? renderRichText(lineSpecification(firstItem)) : null}
                        </td>
                      )}
                      {isFirst && (
                        <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                          {firstItem.product?.product_code || firstItem.variant?.name || '-'}
                        </td>
                      )}
                      <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{getDisplayWidth(item)}</td>
                      <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{item.height}</td>
                      <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{item.pcs}</td>
                      {isFirst && (
                        <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                          {groupTotalSqft.toFixed(2)} Square feet
                        </td>
                      )}
                    </tr>
                  );
                });
              })
            )}

            {/* Absorbs leftover space so signature/notes stay pinned at bottom of A4 */}
            <tr className="a4-filler-row">
              {Array.from({ length: 7 }).map((_, colIdx) => (
                <td key={colIdx} style={{ borderTop: 'hidden', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: 0 }}></td>
              ))}
            </tr>
          </tbody>
        </table>
        </div>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', margin: '40px 0 16px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <strong style={{ fontSize: '12px', color: '#111' }}>Received By</strong>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <strong style={{ fontSize: '12px', color: '#111' }}>Thanking You</strong>
            <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px', marginTop: '4px' }}>{brand.footerName}</div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ fontSize: '12px', marginBottom: '16px' }}>
          <strong>NOTES:</strong>
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', minHeight: '30px', marginTop: '4px', padding: '6px 10px' }}>
            {challan.notes || ''}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 700, fontSize: '13px', color: '#111' }}>
          THANK YOU FOR DOING BUSINESS WITH US
        </div>

        {/* ── BOTTOM CENTERED ACTION BUTTONS (PRINT & BACK) ── */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{ background: '#0066ff', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(0, 102, 255, 0.3)' }}
          >
            <span>🖨️</span> Print
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Downloads the PDF directly with the correct filename, instead of going through the browser's Save as PDF dialog"
            style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)' }}
          >
            <span>⬇️</span> {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/invoices/print/${id}`)}
            style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default ChallanPrintPage;
