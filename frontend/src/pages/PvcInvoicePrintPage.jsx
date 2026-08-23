import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { formatDate } from '../utils/format';
import { fetchProfileForRecord, brandFields } from '../utils/brandProfile';
import { pvcSlatCount, pvcBillingWidth } from '../utils/billing';
import { lineSpecification, hasSpecification, specificationKey } from '../utils/lineSpecification';
import renderRichText from '../utils/renderRichText';

/**
 * PVC Invoice print page - the Invoice-side counterpart of
 * PvcQuotationPrintPage: same "Calculate the Square Feet of Each Slats"
 * breakdown table underneath the main item table, so the customer can see
 * how the billed sq.ft for a PVC strip-curtain line was derived, but built
 * from Invoice data (invoice_number, grand_total, paid/due amounts) instead
 * of Quotation data.
 *
 * Like PvcQuotationPrintPage, it only offers the two print types that show
 * per-size detail (Detailed Print, Pad Print (Sizes)) - View/Pad Print
 * collapse sizes into one total row, which would leave the slat breakdown
 * with nothing to explain.
 */
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

const isPvcItem = (item) => {
  const unit = (item.product?.unit || '').toLowerCase();
  const category = (item.product?.category?.name || '').toLowerCase();
  const name = (item.product?.name || '').toLowerCase();
  return unit.includes('pvc') || category.includes('pvc') || name.includes('pvc') || name.includes('clear water');
};

const getSlatCount = (item) => {
  if (item.slats !== undefined && item.slats !== null && item.slats !== '') {
    return parseInt(item.slats);
  }
  const width = parseFloat(item.width) || 0;
  return width > 0 ? pvcSlatCount(width) : 0;
};

const getDisplayWidth = (item) => {
  const width = parseFloat(item.width) || 0;
  if (!isPvcItem(item)) return width;
  const slatSize = parseFloat(item.product?.product_size) || 8;
  const slats = getSlatCount(item);
  return Math.round(slats * slatSize * 100) / 100 || pvcBillingWidth(width, slatSize);
};

const PvcInvoicePrintPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoice, setInvoice] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Only two print types make sense here - both show the per-size Width/
  // Height/Pcs columns that the slat breakdown table below explains.
  const rawType = searchParams.get('type') || 'detailed';
  const printType = rawType === 'pad-sizes' ? 'pad-sizes' : 'detailed';

  useEffect(() => {
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
        setCompanyProfile(await fetchProfileForRecord(api, record));
      } catch (err) {
        console.error('Error loading PVC invoice print data:', err);
        setError('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getCustomTitle = () => {
    if (!invoice) return 'PVC Invoice _ Dhaka Blinds';
    const cust = invoice.customer || invoice.quotation?.customer || {};
    const rawCustomerName = cust.company_name || cust.name || 'Customer';
    const brandName = brandFields(companyProfile).footerName;
    const buttonName = printType === 'pad-sizes' ? 'Pad Print (Sizes)' : 'Detailed Print';
    const clean = (str) => String(str || '').replace(/[\\/:*?"<>|]/g, '').trim();
    return `${clean(rawCustomerName)} _ PVC Invoice _ ${clean(buttonName)} _ by ${clean(brandName)}`;
  };

  useEffect(() => {
    if (invoice) {
      document.title = getCustomTitle();
      return () => {
        document.title = 'Dhakablinds-Ims';
      };
    }
  }, [invoice, printType, companyProfile]);

  const handlePrint = () => {
    document.title = getCustomTitle();
    window.print();
  };

  const setType = (newType) => {
    setSearchParams({ type: newType });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#fff', color: '#111', fontFamily: 'sans-serif' }}>
        <h2>Loading PVC Invoice...</h2>
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

  const isPad = printType === 'pad-sizes';

  const brand = brandFields(companyProfile);
  const logoSrc = brand.logoSrc;

  const customer = invoice.customer || invoice.quotation?.customer || {};
  const quotation = invoice.quotation || {};
  const items = quotation.items || invoice.items || [];
  const pvcItems = items.filter(i => i.is_selected !== false && isPvcItem(i));
  const challanNo = invoice.delivery_challans?.[0]?.challan_number || 'N/A';
  const poNo = invoice.po_number || quotation.po_number || 'N/A';

  const buildGroups = (rawItems) => {
    const map = new Map();
    const unGroupedMap = new Map();
    let groupSeqCounter = 1;

    rawItems.forEach(item => {
      const optGrpId = item.option_group_id || item.group_id;
      const isSel = item.is_selected !== false ? 'sel' : 'alt';
      const prodId = item.product_id || item.product?.id || 'noprod';
      const unitPrice = parseFloat(item.unit_price) || 0;
      const notes = specificationKey(item);
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
        const groupKey = `${sectionName}___${prodId}-${variantName}___${unitPrice}___${notes}`;
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

  const groups = buildGroups(items);

  return (
    <div className="print-page-wrapper" style={{ background: '#ffffff', minHeight: '100vh', padding: '20px 0', fontFamily: 'sans-serif' }}>
      {/* ── TOP PRINT CONTROL BAR (HIDDEN ON PRINT) ── */}
      <div className="no-print" style={{ maxWidth: '900px', margin: '0 auto 20px auto', background: '#0f172a', padding: '12px 20px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', paddingRight: '4px' }}>🧵 PVC Invoice</div>
          <button
            onClick={() => setType('detailed')}
            style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer', background: printType === 'detailed' ? '#2563eb' : '#334155', color: '#fff' }}
          >
            🖨️ Detailed Print
          </button>
          <button
            onClick={() => setType('pad-sizes')}
            style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', border: 'none', cursor: 'pointer', background: printType === 'pad-sizes' ? '#2563eb' : '#334155', color: '#fff' }}
          >
            📝 Pad Print (Sizes)
          </button>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handlePrint}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#0066ff', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>🖨️</span> Print PDF
          </button>
          <button
            onClick={() => navigate(`/invoices/print/${id}`)}
            style={{ padding: '6px 16px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📄 Standard Invoice
          </button>
          <button
            onClick={() => navigate('/invoices')}
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
          display: 'flex', flexDirection: 'column', minHeight: '281mm', boxSizing: 'border-box'
        }}
        className={'printable-area a4-stretch-area' + (isPad ? ' pad-stretch-area' : '')}
      >

        {/* HEADER */}
        {!isPad ? (
          <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
            <div style={{ textAlign: 'center', marginBottom: '4px' }}>
              <img
                src={logoSrc}
                alt="Invoice & Print Header Logo"
                style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: '140px', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            </div>

            <div style={{ fontSize: '11px', color: '#222', textAlign: 'center', fontWeight: '700', paddingBottom: '4px', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Office Address : {brand.officeAddress}
            </div>

            <div style={{ borderBottom: '1.5px solid #dc2626', marginBottom: '12px', width: '100%' }}></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'flex-start', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5' }}>
              <div>
                Mobile : {brand.mobile}<br/>
                Email : {brand.email}<br/>
                Web : {brand.web}
                {brand.vatRegNo && <div>VAT Reg No : {brand.vatRegNo}</div>}
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px', textAlign: 'center' }}>
                  Invoice
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                <div>Invoice No. : <strong>{invoice.invoice_number}</strong></div>
                <div>Challan : <strong>{challanNo}</strong> | PO No : <strong>{poNo}</strong></div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'block', marginBottom: '16px' }}>
            <div style={{ height: '36mm' }} className="pad-print-spacer"></div>
            <div style={{ fontSize: '11px', color: '#222', textAlign: 'center', fontWeight: '700', paddingBottom: '4px', borderBottom: '1px solid #cbd5e1', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              Office Address : {brand.officeAddress}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center' }}>
              <div></div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', textAlign: 'center' }}>Invoice</div>
              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                <div>Invoice No. : <strong>{invoice.invoice_number}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* Bill To & Delivery Address Section */}
        {(invoice?.delivery_address || quotation?.delivery_address) ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>Bill To:</div>
              <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', height: 'calc(100% - 22px)' }}>
                <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
                <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka, Bangladesh'}</div>
                {customer?.address_2 && (
                  <div style={{ fontSize: '12px', color: '#333' }}>{customer.address_2}</div>
                )}
                {customer?.phone && customer?.contact_show_status !== 'cannot_show_contact_number' && (
                  <div style={{ fontSize: '12px', color: '#333' }}>{customer.phone}</div>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>Delivery Address:</div>
              <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', height: 'calc(100% - 22px)' }}>
                <div style={{ fontSize: '12px', color: '#333', whiteSpace: 'pre-line' }}>{invoice?.delivery_address || quotation?.delivery_address}</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ width: '300px', marginBottom: '16px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>Bill To:</div>
            <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff' }}>
              <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
              <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka, Bangladesh'}</div>
              {customer?.address_2 && (
                <div style={{ fontSize: '12px', color: '#333' }}>{customer.address_2}</div>
              )}
              {customer?.phone && customer?.contact_show_status !== 'cannot_show_contact_number' && (
                <div style={{ fontSize: '12px', color: '#333' }}>{customer.phone}</div>
              )}
            </div>
          </div>
        )}

        {/* Item Table - no Size (T. Width/Height/Pcs) columns here; that
            detail is shown once, in the slat breakdown table below, rather
            than duplicated in both places. */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto' }}>
        <table className="print-table" style={{ width: '100%', borderCollapse: 'collapse', flex: '1 1 auto' }}>
          <thead>
            <tr>
              <th style={{ width: '45px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Sl No.</th>
              <th style={{ textAlign: 'left', verticalAlign: 'middle', paddingLeft: '12px', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af', minWidth: '320px' }}>Description of Goods</th>
              <th style={{ width: '70px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Colors</th>
              <th style={{ width: '85px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Quantity/Sq.ft</th>
              <th style={{ width: '75px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Rate Tk.</th>
              <th style={{ width: '95px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000', border: '1px solid #9ca3af' }}>Amount Tk.</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIdx) => {
              const optionLabel = group.optionLabel;
              const isSelectedChoice = group.rows[0]?.item && group.rows[0].item.is_selected !== false;

              const groupTotalSqft = group.rows.reduce((sum, e) => {
                const h = parseFloat(e.item.height) || 0;
                const fallback = Math.round(((getDisplayWidth(e.item) * h) / 144) * 100) / 100;
                return sum + (parseFloat(e.item.billed_sqft) || fallback);
              }, 0);

              const groupTotalAmount = group.rows.reduce((sum, e) => {
                const h = parseFloat(e.item.height) || 0;
                const fallbackSqft = Math.round(((getDisplayWidth(e.item) * h) / 144) * 100) / 100;
                const billedSqft = parseFloat(e.item.billed_sqft) || fallbackSqft;
                const unitPrice = parseFloat(e.item.unit_price) || 0;
                const lineTotal = parseFloat(e.item.line_total) || Math.round(billedSqft * unitPrice * 100) / 100;
                return sum + lineTotal;
              }, 0);

              return (
                <React.Fragment key={`grp_${groupIdx}`}>
                  {optionLabel && (
                    <tr className="option-header-row">
                      <td colSpan={6} style={{ textAlign: 'center', padding: '8px 12px', fontSize: '14px', fontWeight: '700', color: isSelectedChoice ? '#111827' : '#475569', border: '1px solid #cbd5e1', background: isSelectedChoice ? '#ffffff' : '#f8fafc' }}>
                        {optionLabel}: {isSelectedChoice ? '✔ Selected Choice' : '⚪ Alternative Choice'}
                      </td>
                    </tr>
                  )}

                  {group.rows.map((entry, rowInGroup) => {
                    const { item, idx } = entry;
                    const unitPrice = parseFloat(item.unit_price) || 0;
                    const span = group.rows.length;
                    const isFirst = rowInGroup === 0;

                    return (
                      <tr key={idx}>
                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {groupIdx + 1}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'left', verticalAlign: 'top', paddingTop: '8px', paddingLeft: '12px', border: '1px solid #cbd5e1' }}>
                            <div>
                              <strong style={{ fontSize: '13px', color: '#111' }}>
                                {item.product?.name || 'Blind Item'}
                              </strong>
                            </div>
                            {hasSpecification(item) ? renderRichText(lineSpecification(item)) : null}
                            <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                              Per Blinds Minimum Quantity (MOQ): {(parseFloat(item.min_billing_sqft) || 10).toFixed(2)} Sft
                            </div>
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {item.product?.product_code || item.variant?.name || '-'}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', border: '1px solid #cbd5e1' }}>
                            {groupTotalSqft.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                            {unitPrice.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={span} style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px', border: '1px solid #cbd5e1', color: (item.is_selected !== false) ? '#000' : '#64748b' }}>
                            {groupTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {(item.is_selected === false) && <div style={{ fontSize: '10px', fontWeight: 'normal', fontStyle: 'italic', color: '#64748b' }}>(Alternative Choice)</div>}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            <tr className="a4-filler-row">
              {Array.from({ length: 6 }).map((_, colIdx) => (
                <td key={colIdx} style={{ borderTop: 'hidden', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', padding: 0 }}></td>
              ))}
            </tr>

            {parseFloat(quotation.convenience_charge) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>{groups.length + 1}</td>
                <td colSpan={4} style={{ border: '1px solid #cbd5e1' }}><strong>Conveyance Charge</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(quotation.convenience_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {parseFloat(quotation.other_charge) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>
                  {groups.length + (parseFloat(quotation.convenience_charge) > 0 ? 2 : 1)}
                </td>
                <td colSpan={4} style={{ border: '1px solid #cbd5e1' }}><strong>Other Installation Charges</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(quotation.other_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {parseFloat(quotation.vat_percentage) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>-</td>
                <td colSpan={4} style={{ border: '1px solid #cbd5e1' }}><strong>VAT % ({quotation.vat_percentage}%)</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(quotation.vat_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {parseFloat(invoice.discount_amount) > 0 && (
              <tr>
                <td style={{ textAlign: 'center', fontWeight: 600, border: '1px solid #cbd5e1' }}>-</td>
                <td colSpan={4} style={{ border: '1px solid #cbd5e1' }}><strong>Discount Amount</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {parseFloat(invoice.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {(!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && (
              <tr>
                <td colSpan={6} style={{ fontSize: '11px', fontStyle: 'italic', color: '#333', background: '#fafafa', padding: '6px 12px', border: '1px solid #cbd5e1' }}>
                  All prices quoted above are excluding VAT &amp; TAX
                </td>
              </tr>
            )}

            <tr style={{ background: '#d1d5db' }}>
              <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', padding: '6px 12px', border: '1px solid #9ca3af' }}>
                Sub Total
              </td>
              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', padding: '6px 8px', border: '1px solid #9ca3af' }}>
                {(parseFloat(invoice.grand_total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>

            {parseFloat(invoice.paid_amount) > 0 && (
              <tr style={{ background: '#fff' }}>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', border: '1px solid #cbd5e1' }}>
                  Advance
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: 'var(--success)', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(invoice.paid_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}

            {parseFloat(invoice.due_amount) > 0 && (
              <tr style={{ background: '#f8f9fa' }}>
                <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', border: '1px solid #cbd5e1' }}>
                  Balance Due
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', paddingRight: '8px', border: '1px solid #cbd5e1' }}>
                  {(parseFloat(invoice.due_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>

        {/* PVC Slat Calculation - the sole place per-line Width/Height/Pcs and
            the derived T. Width appear, explaining how each PVC row's billed
            sq.ft was worked out from the doorway width the customer gave. */}
        {pvcItems.length > 0 && (
          <div style={{ margin: '14px 0', border: '1px solid #ddd6fe', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: 700, padding: '7px 12px', letterSpacing: '0.3px' }}>
              🧵 Calculate the Square Feet of Each Slats
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 10px' }}>Item</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>Actual Width</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>Pcs of Strip</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>T. Width (in)</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>Height (in)</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>Door / Nos</th>
                  <th style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, background: '#f5f3ff', color: '#4c1d95', borderBottom: '1px solid #ddd6fe', padding: '6px 8px' }}>Total (Sq.Ft)</th>
                </tr>
              </thead>
              <tbody>
                {pvcItems.map((item, itemIdx) => {
                  const width = parseFloat(item.width) || 0;
                  const height = parseFloat(item.height) || 0;
                  const pcs = parseInt(item.pcs) || 1;
                  const fallbackSqft = Math.round(((getDisplayWidth(item) * height) / 144) * pcs * 100) / 100;
                  const totalSqft = parseFloat(item.billed_sqft) || fallbackSqft;
                  return (
                    <tr key={item.id} style={{ background: itemIdx % 2 === 1 ? '#faf9ff' : '#fff' }}>
                      <td style={{ textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#111', borderBottom: '1px solid #ede9fe', padding: '6px 10px' }}>
                        {item.product?.name || 'PVC Strip Curtain'}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#dc2626', borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{width}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{getSlatCount(item)}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{getDisplayWidth(item)}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{height}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{pcs}</td>
                      <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#4c1d95', borderBottom: '1px solid #ede9fe', padding: '6px 8px' }}>{totalSqft.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#4c1d95', background: '#f5f3ff', padding: '6px 10px', borderTop: '1px solid #ddd6fe' }}>
                    Total Sq.Ft
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 800, color: '#4c1d95', background: '#ede9fe', padding: '6px 8px', borderTop: '1px solid #ddd6fe' }}>
                    {pvcItems.reduce((sum, item) => {
                      const height = parseFloat(item.height) || 0;
                      const pcs = parseInt(item.pcs) || 1;
                      const fallbackSqft = Math.round(((getDisplayWidth(item) * height) / 144) * pcs * 100) / 100;
                      return sum + (parseFloat(item.billed_sqft) || fallbackSqft);
                    }, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Amount in Words */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', border: '1px solid #d1d5db', margin: '10px 0', fontSize: '12px', borderRadius: '2px' }}>
          <div style={{ background: '#f3f4f6', padding: '6px 12px', fontWeight: 'bold', color: '#111', borderRight: '1px solid #d1d5db' }}>
            Amount in Words
          </div>
          <div style={{ padding: '6px 12px', color: '#111', fontWeight: 500 }}>
            {numberToWords(invoice.grand_total)}
          </div>
        </div>

        {/* Remarks - now edited as rich text, so it prints through
            renderRichText() (which also still handles the plain strings
            saved before this field became a rich text editor). */}
        {invoice.note && (
          <div style={{ fontSize: '11px', margin: '6px 0', color: '#333' }}>
            <strong>Remarks: </strong>
            {renderRichText(invoice.note, { fontSize: '11px', color: '#333', margin: 0 })}
          </div>
        )}

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', margin: '12px 0 10px 0', fontSize: '12px' }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '4px', color: '#111' }}>Please Confirm Acceptance of this Invoice</strong>
            <div style={{ height: '24px', border: '1px solid #cbd5e1', background: '#fafafa', borderRadius: '4px' }}></div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <strong style={{ display: 'block', marginBottom: '4px', color: '#111' }}>Authorized Signature</strong>
            <div style={{ height: '24px', border: '1px solid #cbd5e1', background: '#fafafa', borderRadius: '4px', marginBottom: '2px' }}></div>
            <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px' }}>{brand.footerName}</div>
          </div>
        </div>

        {/* Terms & Conditions */}
        <div style={{ margin: '8px 0' }}>
          <strong style={{ fontSize: '11px', color: '#000', display: 'block', marginBottom: '2px' }}>TERMS &amp; CONDITIONS:</strong>
          <div style={{ border: '1px solid #d1d5db', padding: '8px 12px', fontSize: '10.5px', color: '#333', background: '#fafafa', borderRadius: '2px', lineHeight: '1.4' }}>
            {brand.termsConditions || `You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.
Please make your payment by cash or cheque in favour of "${brand.chequeFavourName}" we hope you'll find ours rates reasonable and place an order with us.`}
          </div>
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
            onClick={() => navigate('/invoices')}
            style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '10px 28px', borderRadius: '6px', fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)' }}
          >
            <span>⬅️</span> Back
          </button>
        </div>

      </div>
    </div>
  );
};

export default PvcInvoicePrintPage;
