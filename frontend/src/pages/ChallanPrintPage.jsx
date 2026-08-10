import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { formatDate } from '../utils/format';

/**
 * Delivery Challan print page - design matches the reference "Dhaka Blinds"
 * challan layout exactly (company header, No/Date row, Bill To/Ship To
 * boxes, SL/Colour/Length/Height/Pcs/Quantity-Sq.Ft table with sizes
 * grouped under one product row, Received By/Thanking You signatures,
 * Notes box, thank-you footer) but sources its data from the invoice
 * being printed, not the reference document.
 */
const ChallanPrintPage = () => {
  const { id } = useParams(); // invoice id
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [iRes, cRes] = await Promise.all([
        api.get(`/invoices/${id}`),
        api.get('/company-profile').catch(() => ({ data: { data: null } }))
      ]);
      if (iRes.data && iRes.data.data) {
        setInvoice(iRes.data.data);
      } else {
        setError('Invoice not found');
      }
      if (cRes.data && cRes.data.data) {
        setCompanyProfile(cRes.data.data);
      }
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

  useEffect(() => {
    if (invoice) {
      const rawCustomerName = invoice.customer?.company_name || invoice.customer?.name || 'Customer';
      
      const categories = Array.from(new Set(
        (invoice.items || [])
          .map(item => item.product?.category?.name || item.product?.category_name || item.product?.name || '')
          .filter(Boolean)
      ));
      const rawCategoryName = categories.length > 0 ? categories.join(', ') : 'Zebra Blinds';

      const clean = (str) => String(str).replace(/[\\/:*?"<>|]/g, '').trim();

      const customTitle = `${clean(rawCustomerName)} _ ${clean(rawCategoryName)} _ Delivery Challan _ by Dhaka Blinds`;
      document.title = customTitle;

      return () => {
        document.title = 'Becha Kena ERP';
      };
    }
  }, [invoice]);

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
    window.print();
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
  const logoSrc = companyProfile?.invoice_logo_url || companyProfile?.company_logo_url || '/logo-demo.svg';
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
      const key = `${prodId}-${variantName}___${unitPrice}`;
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
      <div className="no-print" style={{ maxWidth: '850px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>🚚 Delivery Challan: {challan.challan_number}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#0066ff', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🖨️</span> Print PDF
          </button>
          <button
            onClick={() => navigate(`/invoices/print/${id}`)}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      <div style={{ maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)' }} className="printable-area">

        {/* HEADER: company name, subtitle, contact lines */}
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 800, color: '#111' }}>Dhaka Blinds</h1>
          <div style={{ fontSize: '11px', color: '#333', margin: '4px 0' }}>
            (VERTICAL BLINDS, VENETIAN, SINGLE, DOUBLE ROLLER, PVC CURTAIN, REMOTE CONTROL CURTAIN SYSTEM SUPPLIER)
          </div>
          <div style={{ fontSize: '12px', color: '#111' }}>
            <strong>Office:</strong> {companyProfile?.company_address || '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh.'}
          </div>
          <div style={{ fontSize: '12px', color: '#111' }}>
            <strong>Cell:</strong> {companyProfile?.mobile || '01629000200'}
          </div>
          <div style={{ fontSize: '12px', color: '#111' }}>
            <strong>Email:</strong> {companyProfile?.email || 'dhakablinds@gmail.com'}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 800, letterSpacing: '6px', textDecoration: 'underline', margin: '12px 0 16px' }}>
          DELIVERY CHALLAN
        </div>

        {/* No / Date row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#111', marginBottom: '12px' }}>
          <div>No: <strong>{challan.challan_number}</strong></div>
          <div>Date: <strong>{formatDate(challan.delivery_date || challan.created_at)}</strong></div>
        </div>

        {/* Bill To / Ship To boxes */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1, border: '1px solid #000', padding: '8px 12px', borderRadius: '2px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>Bill To :</div>
            <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
            <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka'}</div>
            <div style={{ fontSize: '12px', color: '#333' }}>{customer?.phone}</div>
          </div>
          <div style={{ flex: 1, border: '1px solid #000', padding: '8px 12px', borderRadius: '2px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>Ship To:</div>
            <div style={{ fontSize: '12px', color: '#333' }}>{shipToAddress}</div>
          </div>
        </div>

        {/* Items table */}
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>SL No.</th>
              <th style={{ textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}></th>
              <th style={{ width: '75px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Colour</th>
              <th style={{ width: '65px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Length</th>
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
                const groupTotalSqft = rows.reduce((sum, item) => {
                  const w = parseFloat(item.width) || 0;
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
                          {firstItem.product?.details && (
                            <div style={{ fontSize: '11px', color: '#444', whiteSpace: 'pre-line', marginTop: '3px' }}>
                              {firstItem.product.details}
                            </div>
                          )}
                        </td>
                      )}
                      {isFirst && (
                        <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                          {firstItem.product?.product_code || firstItem.variant?.name || '-'}
                        </td>
                      )}
                      <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{item.width}</td>
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
          </tbody>
        </table>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', margin: '40px 0 16px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <strong style={{ fontSize: '12px', color: '#111' }}>Received By</strong>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ borderBottom: '1px solid #000', height: '24px', marginBottom: '4px' }}></div>
            <strong style={{ fontSize: '12px', color: '#111' }}>Thanking You</strong>
            <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px', marginTop: '4px' }}>Dhaka Blinds</div>
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
