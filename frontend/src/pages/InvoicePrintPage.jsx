import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { formatDate } from '../utils/format';

const numberToWords = (num) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_array = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_array) return '';
    let str = '';
    str += (n_array[1] != 0) ? (a[Number(n_array[1])] || b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
    str += (n_array[2] != 0) ? (a[Number(n_array[2])] || b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
    str += (n_array[3] != 0) ? (a[Number(n_array[3])] || b[n_array[3][0]] + ' ' + a[n_array[3][1]]) + 'Thousand ' : '';
    str += (n_array[4] != 0) ? (a[Number(n_array[4])] || b[n_array[4][0]] + ' ' + a[n_array[4][1]]) + 'Hundred ' : '';
    str += (n_array[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n_array[5])] || b[n_array[5][0]] + ' ' + a[n_array[5][1]]) : '';
    return str;
  };

  const amount = parseFloat(num) || 0;
  const taka = Math.floor(amount);
  const paisa = Math.round((amount - taka) * 100);

  let result = inWords(taka) ? inWords(taka) + 'Taka ' : 'Zero Taka ';
  if (paisa > 0) {
    result += 'and ' + inWords(paisa) + 'Paisa ';
  }
  return result.trim() + ' Only.';
};

const InvoicePrintPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoice, setInvoice] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const printType = searchParams.get('type') || 'detailed';

  useEffect(() => {
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
        console.error('Error loading print invoice:', err);
        setError('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  const setType = (newType) => {
    setSearchParams({ type: newType });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif' }}>
        <h2>Loading Invoice Document...</h2>
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

  const isPad = printType === 'pad' || printType === 'pad-sizes';
  const isDetailed = printType === 'detailed' || printType === 'pad-sizes';

  const logoSrc = companyProfile?.invoice_logo_url || companyProfile?.company_logo_url || '/logo-demo.svg';

  const customer = invoice.customer || invoice.quotation?.customer || {};
  const quotation = invoice.quotation || {};
  const items = quotation.items || invoice.items || [];
  const challanNo = invoice.delivery_challans?.[0]?.challan_number || 'N/A';
  const poNo = invoice.po_number || quotation.po_number || 'N/A';

  const buildGroups = (rawItems) => {
    const map = new Map();
    // Same product/section/price (e.g. several sizes of one item) needs to
    // group together too, not just option-group items - otherwise
    // Description of Goods/Colors repeats once per size instead of once
    // per product.
    const unGroupedMap = new Map();
    let groupSeqCounter = 1;

    rawItems.forEach(item => {
      const optGrpId = item.option_group_id || item.group_id;
      const isSel = item.is_selected !== false ? 'sel' : 'alt';
      const prodId = item.product_id || item.product?.id || 'noprod';
      const unitPrice = parseFloat(item.unit_price) || 0;
      const notes = (item.notes || '').trim();
      const sectionName = (item.section_name || item.section_title || '').trim();

      if (optGrpId) {
        const optionKey = `${sectionName}___${optGrpId}___${isSel}___${prodId}___${unitPrice}___${notes}`;
        if (!map.has(optionKey)) {
          const displayLabel = `Option ${groupSeqCounter++}`;
          map.set(optionKey, {
            optionLabel: displayLabel,
            rows: []
          });
        }
        map.get(optionKey).rows.push({ item, idx: item.id });
      } else {
        const variantName = item.variant?.name || item.product?.product_code || '';
        const groupKey = `${sectionName}___${prodId}-${variantName}___${unitPrice}`;
        if (!unGroupedMap.has(groupKey)) {
          unGroupedMap.set(groupKey, { optionLabel: null, rows: [] });
        }
        unGroupedMap.get(groupKey).rows.push({ item, idx: item.id });
      }
    });

    const result = [];
    map.forEach(val => result.push(val));
    unGroupedMap.forEach(val => result.push(val));
    return result;
  };

  return (
    <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP PRINT CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setType('detailed')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: printType === 'detailed' ? '#2563eb' : '#334155',
              color: '#fff'
            }}
          >
            🖨️ Detailed Invoice
          </button>
          <button
            onClick={() => setType('simplified')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: printType === 'simplified' ? '#2563eb' : '#334155',
              color: '#fff'
            }}
          >
            🖨️ View Invoice
          </button>
          <button
            onClick={() => setType('pad-sizes')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: printType === 'pad-sizes' ? '#2563eb' : '#334155',
              color: '#fff'
            }}
          >
            📝 Pad Invoice (Sizes)
          </button>
          <button
            onClick={() => setType('pad')}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: printType === 'pad' ? '#2563eb' : '#334155',
              color: '#fff'
            }}
          >
            📝 Pad Invoice
          </button>
          <button
            onClick={() => navigate(`/invoices/print/${id}/challan`)}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: '#059669',
              color: '#fff'
            }}
          >
            🚚 Delivery Challan
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrint}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: '#0066ff',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🖨️</span> Print PDF
          </button>
          <button
            onClick={() => navigate('/invoices')}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: '#dc2626',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>⬅️</span> Back
          </button>
        </div>
      </div>

      {/* ── PRINTABLE DOCUMENT CANVAS ── */}
      <div style={{ maxWidth: '850px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '4px', boxShadow: '0 4px 25px rgba(0,0,0,0.1)' }} className="printable-area">
        
        {/* HEADER */}
        {!isPad ? (
          <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
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
              Office Address : Chowrangi Super Market, (3rd Floor), 1, Indira Road, Farmgate, Dhaka -1215
            </div>

            {/* Red Divider Line under Logo */}
            <div style={{
              borderBottom: '1.5px solid #dc2626',
              marginBottom: '12px',
              width: '100%'
            }}></div>

                {/* 3-Column Info Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5' }}>
                  <div style={{ flex: 1 }}>
                    Mobile : {companyProfile?.mobile || '01629000200'}<br/>
                    Email : {companyProfile?.email || 'dhakablinds@gmail.com'}<br/>
                    Web : {companyProfile?.company_web || 'www.dhakablinds.com'}
                    {companyProfile?.vat_reg_no && <div>VAT Reg No : {companyProfile.vat_reg_no}</div>}
                  </div>

                  <div style={{ textAlign: 'center', flex: 1.5 }}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#000', letterSpacing: '0.5px' }}>
                      Invoice
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flex: 1, fontSize: '12px' }}>
                    <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                    <div>Invoice No. : <strong>{invoice.invoice_number}</strong></div>
                    <div>Challan : <strong>{challanNo}</strong> | PO No : <strong>{poNo}</strong></div>
                  </div>
                </div>
          </div>
        ) : (
          <div style={{ display: 'block', marginBottom: '16px' }}>
            <div style={{ height: '30mm' }} className="pad-print-spacer"></div>
            {/* Office Address Centered Line for Pad Paper Print */}
            <div style={{
              fontSize: '11px',
              color: '#222',
              textAlign: 'center',
              fontWeight: '700',
              paddingBottom: '4px',
              borderBottom: '1px solid #cbd5e1',
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px'
            }}>
              Office Address : Chowrangi Super Market, (3rd Floor), 1, Indira Road, Farmgate, Dhaka -1215
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div></div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#000' }}>Invoice</div>
              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                <div>Invoice No. : <strong>{invoice.invoice_number}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Bill To Box */}
        <div style={{ width: '280px', border: '1.5px solid #000', padding: '8px 12px', marginBottom: '16px', borderRadius: '2px', background: '#fff' }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>Bill To:</div>
          <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
          {customer?.company_name && <div style={{ fontSize: '12px', color: '#222' }}>Attn: {customer.name}</div>}
          <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka, Bangladesh'}</div>
          <div style={{ fontSize: '12px', color: '#333' }}>{customer?.phone}</div>
        </div>

        {/* Item Table */}
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {isDetailed ? (
              <>
                <tr>
                  <th rowSpan={2} style={{ width: '45px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Sl No.</th>
                  <th rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'middle', paddingLeft: '12px', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af', minWidth: '320px' }}>Description of Goods</th>
                  <th rowSpan={2} style={{ width: '70px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Colors</th>
                  <th colSpan={3} style={{ textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Size</th>
                  <th rowSpan={2} style={{ width: '85px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Quantity/Sq.ft</th>
                  <th rowSpan={2} style={{ width: '75px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Rate Tk.</th>
                  <th rowSpan={2} style={{ width: '95px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Amount Tk.</th>
                </tr>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Width</th>
                  <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Height</th>
                  <th style={{ width: '35px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Pcs</th>
                </tr>
              </>
            ) : (
              <tr>
                <th style={{ width: '50px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Sl No.</th>
                <th style={{ textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af', minWidth: '380px' }}>Description of Goods</th>
                <th style={{ width: '80px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Colors</th>
                <th style={{ width: '100px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Quantity/Sq.ft</th>
                <th style={{ width: '80px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Rate Tk.</th>
                <th style={{ width: '100px', textAlign: 'center', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Amount Tk.</th>
              </tr>
            )}
          </thead>
          <tbody>
            {buildGroups(items).map((group, groupIdx) => {
              const firstItem = group.rows[0]?.item;
              const optionLabel = group.optionLabel;
              const isSelectedChoice = firstItem && firstItem.is_selected !== false;

              const groupTotalSqft = group.rows.reduce((sum, e) => {
                const w = parseFloat(e.item.width) || 0;
                const h = parseFloat(e.item.height) || 0;
                const fallback = Math.round(((w * h) / 144) * 100) / 100;
                return sum + (parseFloat(e.item.billed_sqft) || fallback);
              }, 0);

              const groupTotalAmount = group.rows.reduce((sum, e) => {
                const w = parseFloat(e.item.width) || 0;
                const h = parseFloat(e.item.height) || 0;
                const fallbackSqft = Math.round(((w * h) / 144) * 100) / 100;
                const billedSqft = parseFloat(e.item.billed_sqft) || fallbackSqft;
                const unitPrice = parseFloat(e.item.unit_price) || 0;
                const lineTotal = parseFloat(e.item.line_total) || Math.round(billedSqft * unitPrice * 100) / 100;
                return sum + lineTotal;
              }, 0);

              return (
                <React.Fragment key={`grp_${groupIdx}`}>
                  {optionLabel && (
                    <tr className="option-header-row">
                      <td
                        colSpan={isDetailed ? 9 : 6}
                        style={{
                          textAlign: 'center',
                          padding: '8px 12px',
                          fontSize: '14px',
                          fontWeight: '700',
                          color: isSelectedChoice ? '#111827' : '#475569',
                          border: '1px solid #cbd5e1',
                          background: isSelectedChoice ? '#ffffff' : '#f8fafc'
                        }}
                      >
                        {optionLabel}: {isSelectedChoice ? '✔ Selected Choice' : '⚪ Alternative Choice'}
                      </td>
                    </tr>
                  )}
                  {group.rows.map((entry, rowInGroup) => {
                    const { item, idx } = entry;
                    const width      = parseFloat(item.width) || 0;
                    const height     = parseFloat(item.height) || 0;
                    const pcs        = parseInt(item.pcs) || 1;
                    const unitPrice  = parseFloat(item.unit_price) || 0;
                    const span       = group.rows.length;
                    const isFirst    = rowInGroup === 0;

                    if (!isDetailed && !isFirst) return null;

                    const currentRowSpan = isDetailed ? span : 1;

                    return (
                      <tr key={idx}>
                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {groupIdx + 1}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'left', verticalAlign: 'top', paddingTop: '8px', paddingLeft: '12px', border: '1px solid #cbd5e1' }}>
                            <strong style={{ fontSize: '13px', color: '#111' }}>
                              {item.product?.name || 'Blind Item'}
                            </strong>
                            {item.product?.details && (
                              <div style={{ fontSize: '11px', color: '#444', whiteSpace: 'pre-line', marginTop: '3px' }}>
                                {item.product.details}
                              </div>
                            )}
                            {item.notes && (
                              <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#555', marginTop: '2px' }}>
                                Note: {item.notes}
                              </div>
                            )}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {item.product?.product_code || item.variant?.name || '-'}
                          </td>
                        )}

                        {isDetailed && (
                          <>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{width}</td>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{height}</td>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>{pcs}</td>
                          </>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {groupTotalSqft.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                            {unitPrice.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                            {groupTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Convenience Charge Row */}
            {parseFloat(quotation.convenience_charge) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>{buildGroups(items).length + 1}</td>
                <td colSpan={isDetailed ? 7 : 4} style={{ border: '1px solid #cbd5e1' }}><strong>Conveyance Charge</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(quotation.convenience_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Other Charge Row */}
            {parseFloat(quotation.other_charge) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                  {buildGroups(items).length + (parseFloat(quotation.convenience_charge) > 0 ? 2 : 1)}
                </td>
                <td colSpan={isDetailed ? 7 : 4} style={{ border: '1px solid #cbd5e1' }}><strong>Other Installation Charges</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(quotation.other_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* VAT Row */}
            {parseFloat(quotation.vat_percentage) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>-</td>
                <td colSpan={isDetailed ? 7 : 4} style={{ border: '1px solid #cbd5e1' }}><strong>VAT % ({quotation.vat_percentage}%)</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(quotation.vat_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Discount Amount */}
            {parseFloat(invoice.discount_amount) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>-</td>
                <td colSpan={isDetailed ? 7 : 4} style={{ border: '1px solid #cbd5e1' }}><strong>Discount Amount</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(invoice.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Excluding VAT Note */}
            {(!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && (
              <tr>
                <td colSpan={isDetailed ? 9 : 6} style={{ fontSize: '11px', fontStyle: 'italic', color: '#333', background: '#fafafa', padding: '6px 12px', border: '1px solid #cbd5e1' }}>
                  All prices quoted above are excluding VAT &amp; TAX
                </td>
              </tr>
            )}

            {/* Total Bill / Grand Total */}
            <tr style={{ background: '#d1d5db' }}>
              <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', padding: '6px 12px', border: '1px solid #9ca3af' }}>
                Sub Total
              </td>
              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', padding: '6px 8px', border: '1px solid #9ca3af' }}>
                {(parseFloat(invoice.grand_total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>

            {/* Advance / Paid Amount */}
            {parseFloat(invoice.paid_amount) > 0 && (
              <tr style={{ background: '#fff' }}>
                <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', border: '1px solid #cbd5e1' }}>
                  Advance
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: 'var(--success)', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(invoice.paid_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {/* Balance Row */}
            {parseFloat(invoice.due_amount) > 0 && (
              <tr style={{ background: '#f8f9fa' }}>
                <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', border: '1px solid #cbd5e1' }}>
                  Balance Due
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: 'var(--danger)', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(invoice.due_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Amount in Words (Matching Reference Layout) */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', border: '1px solid #d1d5db', margin: '10px 0', fontSize: '12px', borderRadius: '2px' }}>
          <div style={{ background: '#f3f4f6', padding: '6px 12px', fontWeight: 'bold', color: '#111', borderRight: '1px solid #d1d5db' }}>
            Amount in Words
          </div>
          <div style={{ padding: '6px 12px', color: '#111', fontWeight: 500 }}>
            {numberToWords(invoice.grand_total)}
          </div>
        </div>

        {/* Remarks */}
        {invoice.note && (
          <div style={{ fontSize: '11px', margin: '6px 0', color: '#333' }}>
            <strong>Remarks: </strong> {invoice.note}
          </div>
        )}

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', margin: '12px 0 10px 0', fontSize: '12px' }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '4px', color: '#111' }}>Please Confirm Acceptance of this Quote</strong>
            <div style={{ height: '24px', border: '1px solid #cbd5e1', background: '#fafafa', borderRadius: '4px' }}></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <strong style={{ display: 'block', marginBottom: '4px', color: '#111' }}>Authorized Signature</strong>
            <div style={{ height: '24px', border: '1px solid #cbd5e1', background: '#fafafa', borderRadius: '4px', marginBottom: '2px' }}></div>
            <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px' }}>Dhaka Blinds</div>
          </div>
        </div>

        {/* ── BOTTOM CENTERED ACTION BUTTONS (PRINT & BACK) ── */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              background: '#0066ff',
              color: '#ffffff',
              border: 'none',
              padding: '10px 28px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0, 102, 255, 0.3)'
            }}
          >
            <span>🖨️</span> Print
          </button>
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '10px 28px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
            }}
          >
            <span>⬅️</span> Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default InvoicePrintPage;
