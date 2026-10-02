import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import { downloadPrintPdf } from '../utils/pdfDownload';

/**
 * Day-month-year with dashes, the way the courier counter's own book is
 * written and the way the handwritten slip this replaces always read.
 * Deliberately not the app-wide formatDate() ("Sep 26, 2026") - a clerk
 * copying "26-09-2026" across should not have to translate a month name.
 */
const formatSlipDate = (value) => {
  if (!value) return '';
  // Read the calendar date straight off an ISO string rather than through
  // Date(), which would re-interpret "2026-09-26T00:00:00Z" in the viewer's
  // timezone and could print the day before.
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
};

/**
 * Courier booking slip - the paper that goes to the courier counter with a
 * confirmed order.
 *
 * Laid out to match the handwritten slip Dhaka Blinds already books with:
 * the standard letterhead, a short "No : 26-02" reference, the person
 * actually collecting the parcel, then one line per bundle with its colour
 * code and parcel count, and a single COD figure.
 *
 * Deliberately carries NO prices, sizes or sq.ft - a courier's counter staff
 * and every hand the parcel passes through can read this sheet, and the only
 * money on it should be the amount they are to collect.
 */
const CourierBookingPrintPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/courier-bookings/${id}`);
        const record = res.data?.data;
        if (record) {
          setBooking(record);
        } else {
          setError('Courier booking not found');
        }
        // Sequential on purpose: which brand's letterhead to load is only
        // known once the booking has come back.
        setCompanyProfile(await fetchProfileForRecord(api, record));
      } catch (err) {
        console.error('Error loading courier booking:', err);
        setError('Failed to load courier booking');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getCustomTitle = () => {
    if (!booking) return 'Courier Booking _ Dhaka Blinds';
    const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
    const brandName = brandFields(companyProfile).footerName;
    return `${clean(booking.receiver_name)} _ Courier Booking ${clean(booking.booking_number)} _ by ${clean(brandName)}`;
  };

  // The saved PDF's filename comes from document.title at the moment the
  // print dialog opens, and a native Ctrl+P bypasses handlePrint() entirely -
  // so re-apply it on the browser's own 'beforeprint' event too.
  useEffect(() => {
    if (!booking) return undefined;
    const applyTitle = () => { document.title = getCustomTitle(); };
    applyTitle();
    window.addEventListener('beforeprint', applyTitle);
    return () => {
      window.removeEventListener('beforeprint', applyTitle);
      document.title = 'Dhakablinds-Ims';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking, companyProfile]);

  const handlePrint = () => {
    document.title = getCustomTitle();
    window.print();
  };

  // Auto-trigger browser print dialog once booking details are loaded
  useEffect(() => {
    if (!loading && booking && !error) {
      const timer = setTimeout(() => {
        document.title = getCustomTitle();
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [loading, booking, error, companyProfile]);

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
        <h2>Loading Courier Booking...</h2>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif', gap: '16px' }}>
        <h2>{error || 'Courier booking not found'}</h2>
        <button onClick={() => navigate('/orders')} style={{ padding: '8px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ⬅️ Back to Orders
        </button>
      </div>
    );
  }

  const brand = brandFields(companyProfile);
  const lines = booking.lines || [];
  const codAmount = parseFloat(booking.cod_amount) || 0;
  const codLabel = booking.cod_label || "COD 'Condition Tk";
  const totalBundles = lines.reduce((sum, l) => sum + (parseFloat(l.bundles) || 0), 0);

  const headCell = {
    background: '#d1d5db', color: '#000', border: '1px solid #9ca3af',
    textAlign: 'center', padding: '6px 4px', fontSize: '12px',
  };
  const bodyCell = { border: '1px solid #cbd5e1', padding: '8px', verticalAlign: 'top' };

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP PRINT CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>📦 Courier Booking: {booking.booking_number}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#0066ff', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🖨️</span> Print
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            title="Downloads the PDF directly with the correct filename, instead of going through the browser's Save as PDF dialog"
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⬇️</span> {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            onClick={() => navigate('/orders')}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      <div
        style={{
          maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
          color: '#000', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: '12px', lineHeight: 1.4,
          display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box'
        }}
        className="printable-area a4-stretch-area"
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          {/* The letterhead lives inside <thead> so Chromium repeats it at the
              top of every printed page, exactly as on the other print pages.
              Everything below it stays in <tbody>, which never repeats. */}
          <thead>
            <tr>
              <th colSpan={4} style={{ border: 'none', padding: 0, background: '#ffffff' }}>
                <div className="print-header" style={{ display: 'block', marginBottom: '16px', textAlign: 'left', fontWeight: 'normal', textTransform: 'none' }}>
                  <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                    <img
                      src={brand.logoSrc}
                      alt="Print Header Logo"
                      style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: '140px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  </div>

                  <div style={{ fontSize: '11px', color: '#222', textAlign: 'center', fontWeight: '700', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    Office Address : {brand.officeAddress}
                  </div>
                  <div style={{ fontSize: '11px', color: '#222', textAlign: 'center', fontWeight: '700', paddingBottom: '4px', marginBottom: '2px', letterSpacing: '0.3px' }}>
                    Mobile : {brand.mobile}, &nbsp;Email : {brand.email}, &nbsp;Web : {brand.web}{brand.vatRegNo ? <>, &nbsp;VAT Reg No : {brand.vatRegNo}</> : ''}
                  </div>

                  <div style={{ borderBottom: '1.5px solid #dc2626', marginBottom: '4px', width: '100%' }}></div>

                  <div style={{ textAlign: 'center', marginBottom: '2px' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px', textAlign: 'center', lineHeight: 1.1, textDecoration: 'underline' }}>
                      Delivery Challan
                    </div>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* No / Date row, then the receiver box - the short reference the
                courier writes in their own book comes first on the paper slip
                this replaces, so it stays first here. */}
            <tr>
              <td colSpan={4} style={{ border: 'none', padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '10px', fontSize: '13px' }}>
                  <div>No : <strong>{booking.booking_number}</strong></div>
                  <div>Date : <strong>{formatSlipDate(booking.booking_date || booking.created_at)}</strong></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', minHeight: '64px' }}>
                      <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{booking.receiver_name}</strong>
                      {booking.receiver_address && (
                        <div style={{ fontSize: '12px', color: '#333', whiteSpace: 'pre-line' }}>{booking.receiver_address}</div>
                      )}
                      {booking.receiver_phone && (
                        <div style={{ fontSize: '12px', color: '#333' }}>Ph No. {booking.receiver_phone}</div>
                      )}
                    </div>
                  </div>

                  {booking.courier_name ? (
                    <div style={{ textAlign: 'right', fontSize: '12px', lineHeight: '1.6', minWidth: '180px', flexShrink: 0 }}>
                      <div>Courier : <strong>{booking.courier_name}</strong></div>
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}></div>
                  )}
                </div>
              </td>
            </tr>

            <tr>
              <th style={{ ...headCell, width: '55px' }}>SL NO.</th>
              <th style={{ ...headCell, textAlign: 'left', paddingLeft: '12px' }}>Description of Goods</th>
              <th style={{ ...headCell, width: '110px' }}>Colour</th>
              <th style={{ ...headCell, width: '90px' }}>Bundles</th>
            </tr>

            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...bodyCell, padding: '20px', textAlign: 'center', color: '#64748b' }}>No bundle lines added.</td>
              </tr>
            ) : (
              lines.map((line, idx) => (
                <tr key={line.id || idx}>
                  <td style={{ ...bodyCell, textAlign: 'center' }}>{String(idx + 1).padStart(2, '0')}.</td>
                  <td style={{ ...bodyCell, paddingLeft: '12px' }}>{line.description}</td>
                  <td style={{ ...bodyCell, textAlign: 'center', fontWeight: 600 }}>{line.colour || '-'}</td>
                  <td style={{ ...bodyCell, textAlign: 'center', fontWeight: 700 }}>{(parseFloat(line.bundles) || 0).toFixed(2)}</td>
                </tr>
              ))
            )}

            {/* Total bundle count - what the counter clerk actually counts the
                parcels against before accepting the consignment. */}
            {lines.length > 0 && (
              <tr>
                <td colSpan={3} style={{ ...bodyCell, textAlign: 'right', fontWeight: 700, paddingRight: '12px' }}>Total Bundles</td>
                <td style={{ ...bodyCell, textAlign: 'center', fontWeight: 700 }}>{totalBundles.toFixed(2)}</td>
              </tr>
            )}

            {/* The single money figure on the slip. Hidden entirely when the
                consignment is courier-charge-only, so a fully prepaid order
                never goes out with a collectable amount printed on it. */}
            {booking.cod_enabled && (
              <tr>
                <td colSpan={4} style={{ ...bodyCell, textAlign: 'center', fontWeight: 700, fontSize: '14px', padding: '12px 8px' }}>
                  {codLabel} = {codAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Tk
                </td>
              </tr>
            )}

            {/* Absorbs leftover space so signature/notes stay pinned at the
                bottom of the A4 sheet. */}
            <tr className="a4-filler-row">
              {Array.from({ length: 4 }).map((_, colIdx) => (
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
          <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', minHeight: '30px', marginTop: '4px', padding: '6px 10px', whiteSpace: 'pre-line' }}>
            {booking.notes || ''}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontStyle: 'italic', fontWeight: 700, fontSize: '13px', color: '#111' }}>
          THANK YOU FOR DOING BUSINESS WITH US
        </div>

        {/* ── BOTTOM CENTERED ACTION BUTTONS ── */}
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
            style={{ background: '#059669', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: downloadingPdf ? 'wait' : 'pointer', opacity: downloadingPdf ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)' }}
          >
            <span>⬇️</span> {downloadingPdf ? 'Generating...' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/orders')}
            style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default CourierBookingPrintPage;
