import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';

// --- Number to Words (Taka) ---
const numberToWords = (num) => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    const arr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!arr) return '';
    let str = '';
    str += arr[1] != 0 ? (a[Number(arr[1])] || b[arr[1][0]] + ' ' + a[arr[1][1]]) + ' Crore ' : '';
    str += arr[2] != 0 ? (a[Number(arr[2])] || b[arr[2][0]] + ' ' + a[arr[2][1]]) + ' Lakh ' : '';
    str += arr[3] != 0 ? (a[Number(arr[3])] || b[arr[3][0]] + ' ' + a[arr[3][1]]) + ' Thousand ' : '';
    str += arr[4] != 0 ? (a[Number(arr[4])] || b[arr[4][0]] + ' ' + a[arr[4][1]]) + ' Hundred ' : '';
    str += arr[5] != 0 ? ((str !== '') ? 'and ' : '') + (a[Number(arr[5])] || b[arr[5][0]] + ' ' + a[arr[5][1]]) : '';
    return str.trim();
  };

  const amount = parseFloat(num) || 0;
  const taka = Math.floor(amount);
  const paisa = Math.round((amount - taka) * 100);
  let result = inWords(taka) ? inWords(taka) + ' Taka' : 'Zero Taka';
  if (paisa > 0) result += ' and ' + inWords(paisa) + ' Paisa';
  return result + ' Only';
};

const formatDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
};

const formatCurrency = (v) => {
  const n = parseFloat(v) || 0;
  return new Intl.NumberFormat('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const MoneyReceiptPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [payment, setPayment] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharing, setSharing] = useState(false);

  const handleBack = () => {
    if (window.opener) {
      window.close();
    } else if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/payments');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [pRes, cRes] = await Promise.all([
          api.get(`/payments/${id}/receipt`),
          api.get('/company-profile').catch(() => ({ data: { data: null } })),
        ]);
        setPayment(pRes.data.data);
        setCompanyProfile(cRes.data?.data || null);
      } catch (err) {
        setError('Failed to load money receipt.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (payment) {
      document.title = `Money Receipt - ${payment.payment_number}`;
    }
  }, [payment]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      Loading receipt...
    </div>
  );

  if (error || !payment) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '16px', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ color: '#dc2626', fontSize: '16px' }}>{error || 'Receipt not found.'}</div>
      <button onClick={handleBack} style={{ padding: '8px 20px', border: '1px solid #94a3b8', borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
    </div>
  );

  const inv = payment.invoice || {};
  const customer = payment.customer || inv.customer || {};
  const companyName = companyProfile?.company_name || 'Dhaka Blinds';
  const companyAddress = companyProfile?.company_address || '';
  const companyPhone = companyProfile?.mobile || '';
  const companyEmail = companyProfile?.email || '';
  const companyLogoUrl = companyProfile?.receipt_logo_url || companyProfile?.company_logo_url || companyProfile?.invoice_logo_url || null;

  const customerDisplayName = customer.company_name || customer.name || 'N/A';
  const invoiceNumber = inv.invoice_number || 'N/A';

  // Product codes from invoice quotation items
  const items = inv.quotation?.items || [];
  const productCodes = Array.from(new Set(
    items.map(i => i.product?.product_code || '').filter(Boolean)
  )).join(', ') || 'N/A';

  const totalSqft = items.reduce((s, i) => s + (parseFloat(i.billed_sqft) || 0), 0);

  // One price per distinct product, in the same order as productCodes
  // above, instead of a single averaged figure — e.g. "12000, 110, 220"
  // for a 3-product invoice rather than one blended number.
  const seenProductCodes = new Set();
  const unitPriceList = items
    .filter(i => {
      const code = i.product?.product_code || '';
      if (!code || seenProductCodes.has(code)) return false;
      seenProductCodes.add(code);
      return true;
    })
    .map(i => (parseFloat(i.unit_price) || 0).toFixed(0))
    .join(', ') || 'N/A';

  const paymentMethodLabel = () => {
    if (payment.payment_method === 'bank') return `Bank Transfer - ${payment.bank_name || ''}${payment.cheque_number ? ` (Cheque: ${payment.cheque_number})` : ''}`;
    if (payment.payment_method === 'mobile') return `${payment.mobile_provider || 'Mobile Banking'}${payment.transaction_id ? ` (Txn: ${payment.transaction_id})` : ''}`;
    return 'Cash in Hand';
  };

  const amount = parseFloat(payment.amount) || 0;

  const loadHtml2Pdf = () => {
    return new Promise((resolve, reject) => {
      if (window.html2pdf) {
        resolve(window.html2pdf);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => resolve(window.html2pdf);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  };

  const handleWhatsAppShare = async () => {
    try {
      setSharing(true);
      const html2pdfLib = await loadHtml2Pdf();
      const element = document.querySelector('.receipt-paper');
      
      const opt = {
        margin:       10,
        filename:     `MoneyReceipt_${payment.payment_number}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, allowTaint: true },
        jsPDF:        { unit: 'mm', format: 'a5', orientation: 'landscape' }
      };

      // Generate PDF Blob using correct .output('blob') method
      const pdfBlob = await html2pdfLib().from(element).set(opt).output('blob');
      const file = new File([pdfBlob], `MoneyReceipt_${payment.payment_number}.pdf`, { type: 'application/pdf' });

      // Clean and format phone number
      const phoneNum = customer.phone ? customer.phone.replace(/\D/g, '') : '';
      const formattedPhone = phoneNum.length === 11 && phoneNum.startsWith('0') 
        ? '88' + phoneNum 
        : phoneNum;

      const messageText = `Assalamu Alaikum. Here is the Money Receipt #${payment.payment_number} from ${companyName}.`;

      let sharedNatively = false;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Money Receipt - ${payment.payment_number}`,
            text: messageText,
          });
          sharedNatively = true;
        } catch (shareErr) {
          console.warn('Native share failed, falling back to download:', shareErr);
        }
      }

      if (!sharedNatively) {
        // Fallback: download PDF
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `MoneyReceipt_${payment.payment_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Open WhatsApp
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(messageText + ' Please attach the downloaded PDF file.')}`;
        window.open(whatsappUrl, '_blank');
      }
    } catch (err) {
      console.error('WhatsApp share error:', err);
      alert('Failed to generate or share PDF. Please try printing to PDF instead.');
    } finally {
      setSharing(false);
    }
  };

  // Grid-style cell borders, matching the plain black/grey ledger look of the
  // paper sample rather than the previous colored-label design.
  const cellLabel = { border: '1px solid #aaa', padding: '6px 9px', fontWeight: 700, color: '#111', verticalAlign: 'top', fontSize: '14px' };
  const cellValue = { border: '1px solid #aaa', padding: '6px 9px', fontStyle: 'italic', fontWeight: 600, color: '#111', fontSize: '16px' };

  return (
    <div className="print-page-wrapper" style={{ fontFamily: "'Times New Roman', Georgia, serif", background: '#ffffff', minHeight: '100vh', padding: '24px 0' }}>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .receipt-paper {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            height: 148.5mm !important;
            box-sizing: border-box !important;
            border: none !important;
            border-bottom: 1px dashed #000 !important;
            padding: 12mm 18mm !important;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>

      {/* Action Buttons (no print) */}
      <div className="no-print" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 24px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          🖨️ Print
        </button>
        <button
          onClick={handleWhatsAppShare}
          disabled={sharing}
          style={{ padding: '10px 24px', background: '#25d366', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          💬 {sharing ? 'Generating PDF...' : 'Share on WhatsApp'}
        </button>
        <button
          onClick={handleBack}
          style={{ padding: '10px 20px', background: '#64748b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ← Back
        </button>
      </div>

      {/* Receipt Paper */}
      <div
        className="receipt-paper"
        style={{
          background: '#fff',
          maxWidth: '720px',
          margin: '0 auto',
          padding: '22px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          borderRadius: '4px',
          border: '1px solid #e2e8f0',
          color: '#111',
        }}
      >
        {/* Header: logo + address block, centered, no rule beneath it */}
        <div style={{ textAlign: 'center', marginBottom: '8px', position: 'relative' }}>
          {companyLogoUrl ? (
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <img
                src={companyLogoUrl}
                alt={companyName}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  height: 'auto',
                  maxHeight: '120px',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto'
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              {/* Overlay QR Code in the middle whitespace of the header banner */}
              <div style={{
                position: 'absolute',
                top: '46%',
                left: '51.5%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                padding: '2px',
                border: '1px solid #ddd',
                borderRadius: '2px'
              }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(window.location.origin + '/payments/' + payment.id + '/receipt')}`}
                  alt="Receipt Verification QR"
                  style={{ width: '60px', height: '60px', display: 'block' }}
                />
              </div>
            </div>
          ) : (
            <>
              {/* Centered QR Code fallback for text layout */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=${encodeURIComponent(window.location.origin + '/payments/' + payment.id + '/receipt')}`}
                  alt="Receipt Verification QR"
                  style={{ width: '70px', height: '70px', display: 'block' }}
                />
              </div>
              <div style={{ fontSize: '20px', fontWeight: 900, marginBottom: '4px' }}>{companyName}</div>
              {companyAddress && <div style={{ fontSize: '11px' }}>{companyAddress}</div>}
              {companyPhone && <div style={{ fontSize: '11px' }}>{companyPhone}</div>}
              {companyEmail && <div style={{ fontSize: '11px' }}>Email : {companyEmail}</div>}
            </>
          )}
        </div>

        {/* Receipt Title Row: plain text, no badge/pill */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 10px' }}>
          <div style={{ fontSize: '13px' }}>
            <strong>No:</strong> {payment.payment_number}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>
            Money Receipt
          </div>
          <div style={{ fontSize: '13px' }}>
            <strong>Date:</strong> {formatDate(payment.payment_date || payment.created_at)}
          </div>
        </div>

        {/* Receipt Body Table — full grid borders like the sample */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <tbody>
            {/* Received from */}
            <tr>
              <td style={{ ...cellLabel, width: '38%' }}>Received with thanks from.</td>
              <td style={cellValue} colSpan={3}>{customerDisplayName}</td>
            </tr>

            {/* Bill No */}
            <tr>
              <td style={{ ...cellLabel, width: '38%' }}>Bill No:</td>
              <td style={cellValue} colSpan={3}>{invoiceNumber}</td>
            </tr>

            {/* Product Name — shows the product code(s), e.g. "TQA25 REAX, DBB
                1116, 2mm Clear Water Co". Line-clamped so an invoice with
                many distinct products can never push the row past the fixed
                half-A4 print height; the full list is still in the title
                attribute. */}
            <tr>
              <td style={{ ...cellLabel, width: '38%' }}>Product Name</td>
              <td
                style={cellValue}
                colSpan={3}
                title={productCodes}
              >
                <div style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.3,
                }}>
                  {productCodes}
                </div>
              </td>
            </tr>

            {/* Sqft & Price */}
            {totalSqft > 0 && (
              <tr>
                <td style={cellLabel}>Total Sft.</td>
                <td style={cellValue}>{totalSqft.toFixed(0)}</td>
                <td style={cellLabel}>Price (TK)</td>
                <td style={cellValue}>{unitPriceList}</td>
              </tr>
            )}

            {/* Amount by Cash / Cheque */}
            <tr>
              <td style={cellLabel}>Amount by Cash / Cheque NO.</td>
              <td style={cellValue} colSpan={3}>{paymentMethodLabel()}</td>
            </tr>

            {/* Amount in words */}
            <tr>
              <td style={cellLabel}>Amounts in words:</td>
              <td style={cellValue} colSpan={3}>{numberToWords(amount)}</td>
            </tr>
          </tbody>
        </table>

        {/* Footer row: Tk box + For */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontStyle: 'italic' }}>Tk.</span>
            <div style={{
              border: '1.5px solid #222', padding: '5px 18px',
              fontSize: '17px', fontWeight: 800, minWidth: '90px', textAlign: 'center',
            }}>
              {formatCurrency(amount)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', textAlign: 'right' }}>
            {payment.invoice?.salesman?.name && (
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#111', textTransform: 'uppercase' }}>
                {payment.invoice.salesman.name}
              </div>
            )}
            <div style={{ fontSize: '13px', fontStyle: 'italic' }}>
              for : <span style={{ fontSize: '14px', fontWeight: 700 }}>{companyName}</span>
            </div>
          </div>
        </div>

        {/* Thank you */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <span style={{ fontSize: '12px', fontStyle: 'italic', fontWeight: 700, letterSpacing: '0.5px' }}>
            THANK YOU FOR DOING BUSINESS WITH US
          </span>
        </div>
      </div>
    </div>
  );
};

export default MoneyReceiptPage;
