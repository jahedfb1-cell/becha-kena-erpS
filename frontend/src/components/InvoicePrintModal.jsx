import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { formatDate, numberToWords } from '../utils/format';
import { pvcSlatCount } from '../utils/billing';

const DEMO_LOGO = '/logo-demo.svg';

// PVC strip-curtain items are billed by total width — slat count × each
// slat's width — rather than the customer's requested opening width. Used
// to keep every sq.ft/total fallback in this modal consistent with the
// T. Width figure the detailed table itself shows for these rows.
const isPvcItem = (item) => {
  const unit = (item.product?.unit || item.unit || '').toLowerCase();
  const category = (item.product?.category?.name || item.category_name || '').toLowerCase();
  const name = (item.product?.name || item.product_name || '').toLowerCase();
  return unit.includes('pvc') || category.includes('pvc') || name.includes('pvc') || name.includes('clear water');
};

const getDisplayWidth = (item) => {
  const width = parseFloat(item.width) || 0;
  if (!isPvcItem(item)) return width;
  const slatSize = parseFloat(item.product?.product_size || item.product_size) || 8;
  const slats = (item.slats !== undefined && item.slats !== null && item.slats !== '')
    ? parseInt(item.slats)
    : pvcSlatCount(width);
  return Math.round(slats * slatSize * 100) / 100;
};

const InvoicePrintModal = ({ isOpen, onClose, invoice, printType = 'detailed' }) => {
  const [logoSrc, setLogoSrc] = useState(DEMO_LOGO);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [activePrintType, setActivePrintType] = useState(printType);

  useEffect(() => {
    setActivePrintType(printType);
  }, [printType]);

  // Automatically load official company profile & logo saved in Company Profile page
  useEffect(() => {
    if (!isOpen) return;
    // Scoped to the record's brand, not the logged-in user's: reopening
    // an old document must show the branding it was created under.
    axios.get('/company-profile', {
      params: invoice?.brand_id ? { brand_id: invoice.brand_id } : {},
    })
      .then(res => {
        const d = res.data?.data || res.data;
        setCompanyProfile(d);
        const logo = d.invoice_logo_url || d.company_logo_url || DEMO_LOGO;
        setLogoSrc(logo);
      })
      .catch(() => {
        setLogoSrc(DEMO_LOGO);
      });
  }, [isOpen, invoice?.brand_id]);

  if (!isOpen || !invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  const customer = invoice.customer || {};
  const quotation = invoice.quotation || {};
  const items = quotation.items || [];
  
  // Get first delivery challan number if any
  const challanNo = invoice.delivery_challans?.[0]?.challan_number || invoice.invoice_number || 'N/A';
  const poNo = quotation.quotation_number || 'N/A';

  // Group items by section & option group & product ID & option variant
  const buildGroups = (itemList) => {
    const groups = [];
    itemList.forEach((item) => {
      const sectionName = item.section_name || 'Main Items';
      const optGrpId = item.option_group_id || 'no_opt';
      const prodId = item.product_id;
      const variantName = item.variant?.name || item.product?.product_code || '';
      const isSel = item.is_selected !== false ? 'selected' : 'unselected';
      const optVarId = item.option_variant_id || item.notes || '';
      
      const key = (optGrpId && optGrpId !== 'no_opt')
        ? `${sectionName}___${optGrpId}___${isSel}___${prodId}___${item.unit_price}___${optVarId}`
        : `${sectionName}___${prodId}-${variantName}___${item.unit_price}`;
      
      let existing = groups.find(g => g.key === key);
      if (!existing) {
        existing = { key, sectionName, optionGroupId: item.option_group_id, isOptional: item.is_optional, rows: [] };
        groups.push(existing);
      }
      existing.rows.push({
        item,
        idx: item.id
      });
    });

    // Dynamically calculate Option 1, Option 2, Option 3 labels per Option Group
    const optionGroupCounts = {};
    groups.forEach(g => {
      if (g.optionGroupId && g.optionGroupId !== 'no_opt') {
        if (!optionGroupCounts[g.optionGroupId]) {
          optionGroupCounts[g.optionGroupId] = 0;
        }
        optionGroupCounts[g.optionGroupId] += 1;
        g.optionLabel = `Option ${optionGroupCounts[g.optionGroupId]}`;
      } else {
        g.optionLabel = null;
      }
    });

    return groups;
  };

  const hasPvc = items.some(i => {
    const u = (i.product?.unit || i.unit || '').trim().toLowerCase();
    const cat = (i.product?.category?.name || i.category_name || '').toLowerCase();
    const pName = (i.product?.name || i.product_name || '').toLowerCase();
    return u.includes('pvc') || cat.includes('pvc') || pName.includes('pvc') || pName.includes('clear water');
  });

  const isDetailed = activePrintType === 'detailed' || activePrintType === 'pad-detailed';
  const isPad = activePrintType === 'pad-detailed' || activePrintType === 'pad-simplified';

  return (
    <div className="custom-modal-overlay no-print-bg">
      <div 
        className="custom-modal-container animate-fade-in" 
        style={{ maxWidth: '960px', width: '98%', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Top Control Bar (Hidden on actual print) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 20px',
            background: '#1a202c',
            color: '#fff',
            borderRadius: '8px 8px 0 0',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
              🖨️ Invoice Print: {invoice.invoice_number}
            </div>

            {/* Quick Switch Menu */}
            <div style={{ display: 'flex', gap: '4px', background: '#2d3748', padding: '3px', borderRadius: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActivePrintType('detailed')}
                style={{
                  background: activePrintType === 'detailed' ? '#17a2b8' : 'transparent',
                  color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                🖨️ Detailed Invoice
              </button>
              <button
                type="button"
                onClick={() => setActivePrintType('simplified')}
                style={{
                  background: activePrintType === 'simplified' ? '#0ea5e9' : 'transparent',
                  color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                🖨️ View Invoice
              </button>
              <button
                type="button"
                onClick={() => setActivePrintType('pad-detailed')}
                style={{
                  background: activePrintType === 'pad-detailed' ? '#8b5cf6' : 'transparent',
                  color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                📝 Pad Invoice (Sizes)
              </button>
              <button
                type="button"
                onClick={() => setActivePrintType('pad-simplified')}
                style={{
                  background: activePrintType === 'pad-simplified' ? '#6366f1' : 'transparent',
                  color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                📝 Pad Invoice (Totals Only)
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#28a745',
                color: '#fff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              🖨️ Print PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#e2e8f0',
                color: '#2d3748',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              ✖ Close
            </button>
          </div>
        </div>

        {/* Printable Invoice Content (Targeted for window.print) */}
        <div style={{ overflowY: 'auto', flex: 1, background: '#fff', padding: '10px' }}>
          <div className="quotation-print-container printable-area">
            
            {/* ── HEADER ── */}
            {!isPad ? (
              <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                  <img
                    src={logoSrc}
                    alt="Invoice Header Logo"
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
                    <strong>{companyProfile?.company_address || '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh.'}</strong><br/>
                    Mobile : {companyProfile?.mobile || '01629000200'}<br/>
                    Email : {companyProfile?.email || 'dhakablinds@gmail.com'}<br/>
                    Web : {companyProfile?.company_web || 'www.dhakablinds.com'}
                    {companyProfile?.vat_reg_no && <div>VAT Reg No : {companyProfile.vat_reg_no}</div>}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', letterSpacing: '0.5px' }}>
                      INVOICE
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                    <div>Invoice No : <strong>{invoice.invoice_number}</strong></div>
                    <div>Challan No : <strong>{challanNo}</strong></div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'block', marginBottom: '16px' }}>
                <div style={{ height: '36mm' }} className="pad-print-spacer"></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center' }}>
                  <div></div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', fontFamily: '"David", "David Libre", "Times New Roman", serif', color: '#000', textAlign: 'center' }}>INVOICE</div>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                    <div>Invoice No : <strong>{invoice.invoice_number}</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2-COLUMN METADATA HEADER BOX ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1.2 }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline', color: '#000' }}>
                  Invoice To:
                </div>
                <div style={{ border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', height: 'calc(100% - 22px)' }}>
                  <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
                  <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka, Bangladesh'}</div>
                  {customer?.address_2 && (
                    <div style={{ fontSize: '12px', color: '#333' }}>{customer.address_2}</div>
                  )}
                  {quotation.delivery_address && quotation.delivery_address !== customer?.address && quotation.delivery_address !== customer?.address_2 && (
                    <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '2px' }}>
                      Delivery Address: {quotation.delivery_address}
                    </div>
                  )}
                  {customer?.phone && customer?.contact_show_status !== 'cannot_show_contact_number' && (
                    <div style={{ fontSize: '12px', color: '#333' }}>Mobile: {customer.phone}</div>
                  )}
                </div>
              </div>

              <div style={{ flex: 0.8, border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>
                  Reference Info:
                </div>
                <div style={{ fontSize: '12px', color: '#333', marginBottom: '3px' }}>
                  Quotation / PO Ref : <strong>{poNo}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#333', marginBottom: '3px' }}>
                  Challan No : <strong>{challanNo}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#333', marginBottom: '3px' }}>
                  Sales Representative : <strong>{quotation.salesman?.name || quotation.salesman_name || 'Marketing Dept'}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#333' }}>
                  Payment Status : <strong style={{ textTransform: 'uppercase', color: invoice.payment_status === 'paid' ? '#16a34a' : '#d97706' }}>{invoice.payment_status || 'unpaid'}</strong>
                </div>
              </div>
            </div>

            {/* Item Table */}
            <table className="print-table">
              <thead>
                {isDetailed ? (
                  <>
                    <tr>
                      <th rowSpan={2} style={{ width: '45px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Sl No.</th>
                      <th rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'middle', paddingLeft: '12px', background: '#d1d5db', color: '#000' }}>Description of Goods</th>
                      <th rowSpan={2} style={{ width: '75px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Colors</th>
                      <th colSpan={hasPvc ? 4 : 3} style={{ textAlign: 'center', background: '#d1d5db', color: '#000' }}>Size</th>
                      <th rowSpan={2} style={{ width: '95px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Quantity/Sq.ft</th>
                      <th rowSpan={2} style={{ width: '80px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Rate Tk.</th>
                      <th rowSpan={2} style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Amount Tk.</th>
                    </tr>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Width</th>
                      {hasPvc && <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>T. Width</th>}
                      <th style={{ width: '45px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Height</th>
                      <th style={{ width: '35px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Pcs</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Sl No.</th>
                    <th style={{ textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000' }}>Description of Goods</th>
                    <th style={{ width: '90px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Colors</th>
                    <th style={{ width: '110px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Quantity/Sq.ft</th>
                    <th style={{ width: '85px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Rate Tk.</th>
                    <th style={{ width: '105px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Amount Tk.</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {buildGroups(items).map((group, groupIdx) => {
                  const firstItem = group.rows[0]?.item;
                  const optionLabel = group.optionLabel;
                  const isSelectedChoice = firstItem && firstItem.is_selected !== false;

                  // Both fallbacks use getDisplayWidth() rather than the raw
                  // item width, so a PVC row's total-width figure drives
                  // the sq.ft math here too, not the doorway width.
                  const groupTotalSqft = group.rows.reduce((sum, e) => {
                    const w = getDisplayWidth(e.item);
                    const h = parseFloat(e.item.height) || 0;
                    const fallback = Math.round(((w * h) / 144) * 100) / 100;
                    return sum + (parseFloat(e.item.billed_sqft) || fallback);
                  }, 0);

                  const groupTotalAmount = group.rows.reduce((sum, e) => {
                    const w = getDisplayWidth(e.item);
                    const h = parseFloat(e.item.height) || 0;
                    const fallbackSqft = Math.round(((w * h) / 144) * 100) / 100;
                    const billedSqft = parseFloat(e.item.billed_sqft) || fallbackSqft;
                    const unitPrice = parseFloat(e.item.unit_price) || 0;
                    const lineTotal = parseFloat(e.item.line_total) || Math.round(billedSqft * unitPrice * 100) / 100;
                    return sum + lineTotal;
                  }, 0);

                  const colSpanVal = isDetailed ? (hasPvc ? 10 : 9) : 6;

                  return (
                    <React.Fragment key={`grp_${groupIdx}`}>
                      {optionLabel && (
                        <tr className="option-header-row">
                          <td
                            colSpan={colSpanVal}
                            style={{
                              textAlign: 'center',
                              padding: '8px 12px',
                              fontSize: '14px',
                              fontWeight: '700',
                              color: isSelectedChoice ? '#111827' : '#475569',
                              borderTop: '1px solid #cbd5e1',
                              borderBottom: '1px solid #cbd5e1',
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
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                                {groupIdx + 1}
                              </td>
                            )}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'left', verticalAlign: 'top', paddingTop: '8px', paddingLeft: '12px' }}>
                                <strong style={{ fontSize: '13px', color: '#111' }}>
                                  {item.product?.name || 'Blind Item'}
                                </strong>
                                {(item.notes || item.product?.details) ? (
                                  <div style={{ fontSize: '11px', color: '#444', whiteSpace: 'pre-line', marginTop: '3px' }}>
                                    {item.notes || item.product.details}
                                  </div>
                                ) : null}
                              </td>
                            )}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                                {item.product?.product_code || item.variant?.name || '-'}
                              </td>
                            )}

                            {isDetailed && (() => {
                              const u = (item.product?.unit || item.unit || '').trim().toLowerCase();
                              const cat = (item.product?.category?.name || item.category_name || '').toLowerCase();
                              const pName = (item.product?.name || item.product_name || '').toLowerCase();
                              const isPvc = u.includes('pvc') || cat.includes('pvc') || pName.includes('pvc') || pName.includes('clear water');
                              const isPcs = u === 'pcs' || u === 'pieces' || u === 'piece' || u === 'box' || u === 'set';

                              let tWidthVal = '-';
                              if (isPvc && width > 0) {
                                const slatSize = parseFloat(item.product?.product_size || item.product_size) || 8;
                                const slatsCount = item.slats !== undefined && item.slats !== null && item.slats !== '' ? parseInt(item.slats) : pvcSlatCount(width);
                                tWidthVal = slatsCount * slatSize;
                              }

                              return (
                                <>
                                  <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{isPcs ? '—' : width}</td>
                                  {hasPvc && (
                                    <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{isPcs ? '—' : (isPvc ? tWidthVal : width)}</td>
                                  )}
                                  <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{isPcs ? '—' : height}</td>
                                  <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{pcs}</td>
                                </>
                              );
                            })()}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                                {groupTotalSqft.toFixed(2)}
                              </td>
                            )}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px' }}>
                                {unitPrice.toFixed(2)}
                              </td>
                            )}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px' }}>
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
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{buildGroups(items).length + 1}</td>
                    <td colSpan={isDetailed ? 7 : 4}><strong>Conveyance Charge</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px' }}>
                      {parseFloat(quotation.convenience_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Other Charge Row */}
                {parseFloat(quotation.other_charge) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {buildGroups(items).length + (parseFloat(quotation.convenience_charge) > 0 ? 2 : 1)}
                    </td>
                    <td colSpan={isDetailed ? 7 : 4}><strong>Other Installation Charges</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px' }}>
                      {parseFloat(quotation.other_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* VAT Row */}
                {parseFloat(quotation.vat_percentage) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>-</td>
                    <td colSpan={isDetailed ? 7 : 4}><strong>VAT % ({quotation.vat_percentage}%)</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px' }}>
                      {(parseFloat(quotation.vat_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Discount Amount */}
                {parseFloat(invoice.discount_amount) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>-</td>
                    <td colSpan={isDetailed ? 7 : 4}><strong>Discount Amount</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, paddingRight: '8px' }}>
                      {parseFloat(invoice.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Excluding VAT Note */}
                {(!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && (
                  <tr>
                    <td colSpan={isDetailed ? 9 : 6} style={{ fontSize: '11px', fontStyle: 'italic', color: '#333', background: '#fafafa', padding: '6px 12px' }}>
                      All prices quoted above are excluding VAT &amp; TAX
                    </td>
                  </tr>
                )}

                {/* Total Bill / Grand Total */}
                <tr style={{ background: '#d1d5db' }}>
                  <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', padding: '6px 12px' }}>
                    Sub Total
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', padding: '6px 8px' }}>
                    {(parseFloat(invoice.grand_total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Advance / Paid Amount */}
                {parseFloat(invoice.paid_amount) > 0 && (
                  <tr style={{ background: '#fff' }}>
                    <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000' }}>
                      Advance
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: 'var(--success)', paddingRight: '8px' }}>
                      {(parseFloat(invoice.paid_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Balance Row */}
                {parseFloat(invoice.due_amount) > 0 && (
                  <tr style={{ background: '#f8f9fa' }}>
                    <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000' }}>
                      Balance Due
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', paddingRight: '8px' }}>
                      {(parseFloat(invoice.due_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Amount in Words (Matching Reference Layout) */}
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', border: '1px solid #d1d5db', margin: '16px 0', fontSize: '12px', borderRadius: '2px' }}>
              <div style={{ background: '#f3f4f6', padding: '8px 12px', fontWeight: 'bold', color: '#111', borderRight: '1px solid #d1d5db' }}>
                Amount in Words
              </div>
              <div style={{ padding: '8px 12px', color: '#111', fontWeight: 500 }}>
                {numberToWords(invoice.grand_total)}
              </div>
            </div>

            {/* Remarks */}
            {invoice.note && (
              <div style={{ fontSize: '12px', margin: '12px 0', color: '#333' }}>
                <strong>Remarks: </strong> {invoice.note}
              </div>
            )}

            {/* Signatures (Matching Reference Layout) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', margin: '24px 0 16px 0', fontSize: '12px' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>Please Confirm Acceptance of this Invoice</strong>
                <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px' }}></div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>Authorized Signature</strong>
                <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px', marginBottom: '4px' }}></div>
                <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px' }}>{companyProfile?.footer_name || companyProfile?.company_name || 'Dhaka Blinds'}</div>
              </div>
            </div>

            {/* ── BOTTOM CENTERED ACTION BUTTONS (PRINT & BACK) ── */}
            {/* Hidden on actual paper print / saved PDF */}
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
                onClick={onClose}
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
      </div>
    </div>
  );
};

export default InvoicePrintModal;
