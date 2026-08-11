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
      <button onClick={() => navigate(-1)} style={{ padding: '8px 20px', border: '1px solid #94a3b8', borderRadius: '6px', cursor: 'pointer' }}>← Back</button>
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
  const productNames = Array.from(new Set(
    items.map(i => i.product?.name || i.product?.product_code || '').filter(Boolean)
  )).join(', ') || 'N/A';
  const productCodes = Array.from(new Set(
    items.map(i => i.product?.product_code || '').filter(Boolean)
  )).join(', ') || '';

  const totalSqft = items.reduce((s, i) => s + (parseFloat(i.billed_sqft) || 0), 0);
  const avgUnitPrice = items.length > 0
    ? items.reduce((s, i) => s + (parseFloat(i.unit_price) || 0), 0) / items.length
    : 0;

  const paymentMethodLabel = () => {
    if (payment.payment_method === 'bank') return `Bank Transfer - ${payment.bank_name || ''}${payment.cheque_number ? ` (Cheque: ${payment.cheque_number})` : ''}`;
    if (payment.payment_method === 'mobile') return `${payment.mobile_provider || 'Mobile Banking'}${payment.transaction_id ? ` (Txn: ${payment.transaction_id})` : ''}`;
    return 'Cash in Hand';
  };

  const amount = parseFloat(payment.amount) || 0;

  return (
    <div style={{ fontFamily: "'Times New Roman', serif", background: '#f0f0f0', minHeight: '100vh', padding: '30px 20px' }}>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .receipt-paper { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
        }
        @page { size: A5 landscape; margin: 10mm; }
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
          onClick={() => navigate(-1)}
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
          padding: '28px 36px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
          borderRadius: '4px',
          border: '1px solid #ddd',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #222', paddingBottom: '12px', marginBottom: '14px' }}>
          {companyLogoUrl && (
            <img src={companyLogoUrl} alt="Company Logo" style={{ height: '60px', objectFit: 'contain', display: 'block', margin: '0 auto 6px' }} />
          )}
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#1e40af', fontFamily: 'Arial Black, sans-serif', lineHeight: 1.2 }}>
            {companyName}
          </div>
          {companyAddress && <div style={{ fontSize: '12px', color: '#374151', marginTop: '2px' }}>{companyAddress}</div>}
          <div style={{ fontSize: '12px', color: '#374151' }}>
            {companyPhone && <span>{companyPhone}</span>}
            {companyPhone && companyEmail && <span> &nbsp;|&nbsp; </span>}
            {companyEmail && <span>Email : {companyEmail}</span>}
          </div>
        </div>

        {/* Receipt Title Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: '#374151' }}>
            <strong>No:</strong> {payment.payment_number}
          </div>
          <div style={{
            background: '#111', color: '#fff', padding: '4px 22px',
            fontSize: '15px', fontWeight: 700, letterSpacing: '1px', borderRadius: '2px'
          }}>
            Money Receipt
          </div>
          <div style={{ fontSize: '13px', color: '#374151' }}>
            <strong>Date:</strong> {formatDate(payment.payment_date || payment.created_at)}
          </div>
        </div>

        {/* Receipt Body Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <tbody>
            {/* Received from */}
            <tr style={{ borderTop: '1px solid #bbb' }}>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f', width: '38%' }}>
                Received with thanks from.
              </td>
              <td style={{ padding: '7px 8px', color: '#111' }} colSpan={3}>
                {customerDisplayName}
              </td>
            </tr>

            {/* Bill No & Product Name */}
            <tr style={{ borderTop: '1px solid #ddd' }}>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f' }}>Bill No:</td>
              <td style={{ padding: '7px 8px', color: '#2563eb', fontWeight: 600 }}>{invoiceNumber}</td>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f', width: '22%' }}>Product Name</td>
              <td style={{ padding: '7px 8px', color: '#2563eb' }}>
                {productNames}
                {productCodes && productCodes !== productNames && (
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>({productCodes})</span>
                )}
              </td>
            </tr>

            {/* Sqft & Price */}
            {totalSqft > 0 && (
              <tr style={{ borderTop: '1px solid #ddd' }}>
                <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f' }}>Total Sft.</td>
                <td style={{ padding: '7px 8px' }}>{totalSqft.toFixed(0)}</td>
                <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f' }}>Price (Tk)</td>
                <td style={{ padding: '7px 8px' }}>{avgUnitPrice > 0 ? avgUnitPrice.toFixed(0) : 'N/A'}</td>
              </tr>
            )}

            {/* Amount by Cash / Cheque */}
            <tr style={{ borderTop: '1px solid #ddd' }}>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f' }}>Amount by Cash / Cheque NO.</td>
              <td style={{ padding: '7px 8px', color: '#2563eb' }} colSpan={3}>{paymentMethodLabel()}</td>
            </tr>

            {/* Amount in words */}
            <tr style={{ borderTop: '1px solid #ddd', borderBottom: '1px solid #bbb' }}>
              <td style={{ padding: '7px 8px', fontWeight: 700, color: '#1e3a5f' }}>Amounts in words:</td>
              <td style={{ padding: '7px 8px', fontStyle: 'italic', color: '#2563eb' }} colSpan={3}>
                {numberToWords(amount)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Footer row: Tk box + For */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700 }}>Tk.</span>
            <div style={{
              border: '2px solid #222', padding: '6px 20px',
              fontSize: '18px', fontWeight: 900, minWidth: '100px', textAlign: 'center',
              background: '#f9fafb',
            }}>
              {formatCurrency(amount)}
            </div>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, textAlign: 'right' }}>
            for : <span style={{ fontSize: '16px', fontWeight: 900 }}>{companyName}</span>
          </div>
        </div>

        {/* Thank you */}
        <div style={{ textAlign: 'center', marginTop: '18px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '1px', color: '#374151' }}>
            THANK YOU FOR DOING BUSINESS WITH US
          </span>
        </div>
      </div>
    </div>
  );
};

export default MoneyReceiptPage;
