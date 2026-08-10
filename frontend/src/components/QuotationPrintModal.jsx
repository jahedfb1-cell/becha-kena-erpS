import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api/axios';
import { formatDate, numberToWords } from '../utils/format';

const DEMO_LOGO = '/logo-demo.svg';

const QuotationPrintModal = ({ isOpen, onClose, quotation, printType = 'detailed', isOrderPrint = false }) => {
  const [logoSrc, setLogoSrc] = useState(DEMO_LOGO);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [activePrintType, setActivePrintType] = useState(printType);

  const isOrder = isOrderPrint || (quotation && quotation.status !== 'quotation');

  // Toggle state to hide/show prices (defaults to true if printing an Order)
  const [hidePrices, setHidePrices] = useState(isOrder);

  useEffect(() => {
    setActivePrintType(printType);
  }, [printType]);

  useEffect(() => {
    if (quotation) {
      const checkOrder = isOrderPrint || quotation.status !== 'quotation';
      setHidePrices(checkOrder);
    }
  }, [quotation, isOrderPrint]);

  // Automatically load official company profile & logo saved in Company Profile page
  useEffect(() => {
    if (!isOpen) return;
    axios.get('/company-profile')
      .then(res => {
        const d = res.data?.data || res.data;
        setCompanyProfile(d);
        const logo = d.invoice_logo_url || d.company_logo_url || DEMO_LOGO;
        setLogoSrc(logo);
      })
      .catch(() => {
        setLogoSrc(DEMO_LOGO);
      });
  }, [isOpen]);

  const rawItems = quotation?.items || [];

  // Calculate Subtotal and Net Amount strictly from selected items (is_selected !== false)
  const selectedSubtotal = useMemo(() => {
    if (!rawItems || rawItems.length === 0) return 0;
    return rawItems.reduce((sum, item) => {
      if (isOrder || (item.is_selected !== false && item.is_enabled_for_print !== false && item.is_enabled_for_print !== 0 && item.is_enabled_for_print !== '0')) {
        const w = parseFloat(item.width) || 0;
        const h = parseFloat(item.height) || 0;
        const pcs = parseInt(item.pcs) || 1;
        const actualSqft = Math.round(((w * h) / 144) * 100) / 100;
        const minSqft = parseFloat(item.min_billing_sqft) || 0;
        const billedSqft = parseFloat(item.billed_sqft) || Math.round((Math.max(actualSqft, minSqft) * pcs) * 100) / 100;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const lineTotal = parseFloat(item.line_total) || Math.round((billedSqft * unitPrice) * 100) / 100;
        return sum + lineTotal;
      }
      return sum;
    }, 0);
  }, [rawItems, isOrder]);

  const calculatedNetTotal = useMemo(() => {
    if (!quotation) return 0;
    const conv = parseFloat(quotation.convenience_charge) || 0;
    const other = parseFloat(quotation.other_charge) || 0;
    const vatPct = parseFloat(quotation.vat_percentage) || 0;
    const vatAmt = Math.round((selectedSubtotal * vatPct / 100) * 100) / 100;

    let discAmt = 0;
    const discVal = parseFloat(quotation.discount_value) || 0;
    if (quotation.discount_type === 'percentage') {
      discAmt = Math.round((selectedSubtotal * discVal / 100) * 100) / 100;
    } else {
      discAmt = discVal;
    }

    return Math.max(0, Math.round((selectedSubtotal + conv + other + vatAmt - discAmt) * 100) / 100);
  }, [selectedSubtotal, quotation]);

  if (!isOpen || !quotation) return null;

  const handlePrint = () => {
    window.print();
  };

  const customer = quotation.customer || {};
  // Filter items that are enabled for print (for Order Print, always include ALL order items)
  const items = isOrder
    ? rawItems
    : rawItems.filter(i => (i.is_enabled_for_print !== false && i.is_enabled_for_print !== 0 && i.is_enabled_for_print !== '0'));
  
  const uniqueSections = new Set(rawItems.map(i => i.section_name).filter(Boolean));
  const hasMultipleSectionsOrOptions = rawItems.some(i => i.option_group_id || i.is_optional) || 
    uniqueSections.size > 1 || 
    rawItems.some(i => i.section_name && i.section_name !== 'Main Items' && i.section_name !== 'Section A: Main Items');

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

  const isDetailed = activePrintType === 'detailed' || activePrintType === 'pad-detailed';
  const isPad = activePrintType === 'pad-detailed' || activePrintType === 'pad-simplified';

  const documentTitle = isOrder ? (hidePrices ? 'Work Order Sheet' : 'Sales Order') : 'Quotation';
  const documentNoLabel = isOrder ? 'Order No.' : 'Quotation No.';
  const marketingPersonName = quotation.salesman?.name || quotation.salesman_name || quotation.salesman || 'Marketing Dept';

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
            justify: 'space-between',
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
              🖨️ {isOrder ? 'Order Print' : 'Quotation Print'}: {quotation.quotation_number}
            </div>

            {/* Quick Switch Menu - Show full menu for Quotation, but for Order Print keep ONLY Pad Print (Sizes) */}
            {!isOrder ? (
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
                  🖨️ Detailed Print
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
                  🖨️ View Print
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
                  📝 Pad Print (Sizes)
                </button>
                <button
                  type="button"
                  onClick={() => setActivePrintType('pad-simplified')}
                  style={{
                    background: activePrintType === 'pad-simplified' ? '#ec4899' : 'transparent',
                    color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                    borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                  }}
                >
                  📝 Pad Print
                </button>
              </div>
            ) : (
              <div style={{ background: '#8b5cf6', color: '#fff', padding: '5px 14px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                📝 Pad Print (Sizes)
              </div>
            )}

            {/* Price Visibility Toggle Button - Hidden for Order Print */}
            {!isOrder && (
              <button
                type="button"
                onClick={() => setHidePrices(!hidePrices)}
                style={{
                  background: hidePrices ? '#e11d48' : '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 14px',
                  fontSize: '11px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Click to show or hide rate & total amount columns"
              >
                {hidePrices ? '🙈 Prices Hidden (Work Order)' : '💰 Prices Shown'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handlePrint}
              style={{
                background: '#ff7b00',
                color: '#fff',
                border: 'none',
                padding: '6px 16px',
                borderRadius: '4px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>🖨️</span> Print PDF
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

        {/* Printable Quotation / Work Order Content */}
        <div style={{ overflowY: 'auto', flex: 1, background: '#fff', padding: '10px' }}>
          <div className="quotation-print-container printable-area">
            
            {/* ── HEADER ── */}
            {!isPad ? (
              <div className="print-header" style={{ display: 'block', marginBottom: '16px' }}>
                {/* Top Banner Logo Image for Quotations */}
                {!isOrder && (
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
                )}

                {/* Subtitle & Red Divider Line for Quotations */}
                {!isOrder && (
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
                )}

                {/* Top Banner Company Profile Box for Order Print */}
                {isOrder && (
                  <div style={{
                    border: '1.5px solid #000',
                    borderRadius: '4px',
                    padding: '10px 16px',
                    marginBottom: '12px',
                    textAlign: 'center',
                    background: '#fff'
                  }}>
                    <h2 style={{ margin: '0 0 3px 0', fontSize: '22px', fontWeight: 800, color: '#000', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                      {companyProfile?.company_name || 'DHAKA BLINDS'}
                    </h2>
                    <div style={{ fontSize: '11px', color: '#222', fontWeight: 600, marginBottom: '4px' }}>
                      {companyProfile?.company_address || '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh.'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#111', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap', fontWeight: 600 }}>
                      <span>Mobile: <strong>{companyProfile?.mobile || '01629000200'}</strong></span>
                      <span>Email: <strong>{companyProfile?.email || 'dhakablinds@gmail.com'}</strong></span>
                      <span>Web: <strong>{companyProfile?.company_web || 'www.dhakablinds.com'}</strong></span>
                    </div>
                  </div>
                )}

                {/* 3-Column Info Header: Address / Spacer (Left) | Document Title (Center) | Date & Order No (Right) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontSize: '11px', color: '#111', lineHeight: '1.5' }}>
                  <div style={{ flex: 1 }}>
                    {!isOrder && (
                      <>
                        <strong>{companyProfile?.company_address || '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh,.'}</strong><br/>
                        Mobile : {companyProfile?.mobile || '01629000200'}<br/>
                        Email : {companyProfile?.email || 'dhakablinds@gmail.com'}<br/>
                        Web : {companyProfile?.company_web || 'www.dhakablinds.com'}
                        {companyProfile?.vat_reg_no && <div>VAT Reg No : {companyProfile.vat_reg_no}</div>}
                      </>
                    )}
                  </div>

                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: '#000', letterSpacing: '0.5px' }}>
                      {documentTitle}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flex: 1, fontSize: '12px' }}>
                    <div>Date : <strong>{formatDate(quotation.created_at || quotation.date || new Date())}</strong></div>
                    <div>{documentNoLabel} : <strong>{quotation.quotation_number}</strong></div>
                  </div>
                </div>
              </div>
            ) : (
              /* Spacer for pre-printed Pad paper */
              <div style={{ display: 'block', marginBottom: '16px' }}>
                <div style={{ height: '36mm' }} className="pad-print-spacer"></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div></div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: '#000' }}>{documentTitle}</div>
                  <div style={{ textAlign: 'right', fontSize: '12px' }}>
                    <div>Date : <strong>{formatDate(quotation.created_at || quotation.date || new Date())}</strong></div>
                    <div>{documentNoLabel} : <strong>{quotation.quotation_number}</strong></div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2-COLUMN METADATA HEADER BOX ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: '16px', marginBottom: '16px' }}>
              {/* Customer Box (Left) */}
              <div style={{ flex: 1.2, border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff' }}>
                {!isOrder && (
                  <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>
                    Quotation To:
                  </div>
                )}
                <strong style={{ fontSize: '14px', color: '#000', display: 'block' }}>{customer?.company_name || customer?.name}</strong>
                {customer?.company_name && <div style={{ fontSize: '12px', color: '#222' }}>Attn: {customer.name}</div>}
                <div style={{ fontSize: '12px', color: '#333' }}>{customer?.address || 'Dhaka, Bangladesh'}</div>
                {quotation.delivery_address && (
                  <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '2px' }}>
                    Delivery Address: {quotation.delivery_address}
                  </div>
                )}
                <div style={{ fontSize: '12px', color: '#333' }}>Mobile: {customer?.phone}</div>
              </div>

              {/* Order Reference & Marketing Person Box (Right) */}
              <div style={{ flex: 0.8, border: '1.5px solid #000', padding: '8px 12px', borderRadius: '2px', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {!isOrder && (
                  <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textDecoration: 'underline' }}>
                    Quotation Info:
                  </div>
                )}
                <div style={{ fontSize: '13px', color: '#000', margin: '4px 0' }}>
                  Order Ref By: <strong style={{ fontSize: '14px', color: '#0f172a' }}>{marketingPersonName}</strong>
                </div>
                {!isOrder && quotation.salesman?.phone && (
                  <div style={{ fontSize: '12px', color: '#333', marginBottom: '3px' }}>
                    Marketing Contact: <strong>{quotation.salesman.phone}</strong>
                  </div>
                )}
                {!isOrder && (
                  <>
                    <div style={{ fontSize: '12px', color: '#333' }}>
                      {documentNoLabel} : <strong>{quotation.quotation_number}</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#333' }}>
                      Date: <strong>{formatDate(quotation.created_at || quotation.date || new Date())}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── ITEM TABLE ── */}
            <table className="print-table">
              <thead>
                {isDetailed ? (
                  <>
                    <tr>
                      <th rowSpan={2} style={{ width: '45px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Sl No.</th>
                      <th rowSpan={2} style={{ width: isOrder ? '220px' : 'auto', textAlign: 'left', verticalAlign: 'middle', paddingLeft: '12px', background: '#d1d5db', color: '#000' }}>Description of Goods</th>
                      <th rowSpan={2} style={{ width: isOrder ? '90px' : '75px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Colors</th>
                      <th colSpan={4} style={{ textAlign: 'center', background: '#d1d5db', color: '#000', fontSize: '13px', fontWeight: 'bold' }}>Size</th>
                      {!hidePrices && <th rowSpan={2} style={{ width: '80px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Rate Tk.</th>}
                      {!hidePrices && <th rowSpan={2} style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle', background: '#d1d5db', color: '#000' }}>Amount Tk.</th>}
                    </tr>
                    <tr>
                      <th style={{ width: isOrder ? '95px' : '45px', textAlign: 'center', background: '#d1d5db', color: '#000', fontSize: isOrder ? '12px' : '11px' }}>Width</th>
                      <th style={{ width: isOrder ? '95px' : '45px', textAlign: 'center', background: '#d1d5db', color: '#000', fontSize: isOrder ? '12px' : '11px' }}>Height</th>
                      <th style={{ width: isOrder ? '65px' : '35px', textAlign: 'center', background: '#d1d5db', color: '#000', fontSize: isOrder ? '12px' : '11px' }}>Pcs</th>
                      <th style={{ width: isOrder ? '115px' : '95px', textAlign: 'center', background: '#d1d5db', color: '#000', fontSize: isOrder ? '12px' : '11px' }}>Quantity / Sq.ft</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={{ width: '50px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Sl No.</th>
                    <th style={{ width: isOrder ? '220px' : 'auto', textAlign: 'left', paddingLeft: '12px', background: '#d1d5db', color: '#000' }}>Description of Goods</th>
                    <th style={{ width: '90px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Colors</th>
                    <th style={{ width: '110px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Quantity/Sq.ft</th>
                    {!hidePrices && <th style={{ width: '85px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Rate Tk.</th>}
                    {!hidePrices && <th style={{ width: '105px', textAlign: 'center', background: '#d1d5db', color: '#000' }}>Amount Tk.</th>}
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

                  const colSpanVal = isDetailed ? (hidePrices ? 7 : 9) : (hidePrices ? 4 : 6);

                  return (
                    <React.Fragment key={`grp_${groupIdx}`}>
                      {/* Option Header Row */}
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
                                <div>
                                  <strong style={{ fontSize: isOrder ? '14px' : '13px', color: '#111' }}>
                                    {item.product?.name || 'Blind Item'}
                                  </strong>
                                </div>
                                {!isOrder && item.product?.details && (
                                  <div style={{ fontSize: '11px', color: '#444', whiteSpace: 'pre-line', marginTop: '3px' }}>
                                    {item.product.details}
                                  </div>
                                )}
                                {!isOrder && item.notes && item.notes.trim() !== (item.product?.details || '').trim() && (
                                  <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#555', marginTop: '2px' }}>
                                    Note: {item.notes}
                                  </div>
                                )}
                                {!isOrder && (
                                  <div style={{ fontSize: '11px', color: '#555', marginTop: '3px' }}>
                                    Per Blinds Minimum Quantity (MOQ): {(parseFloat(item.min_billing_sqft) || 10).toFixed(2)} Sft
                                  </div>
                                )}
                              </td>
                            )}

                            {isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', fontSize: isOrder ? '13px' : '12px' }}>
                                {item.product?.product_code || item.variant?.name || '-'}
                              </td>
                            )}

                            {isDetailed && (
                              <>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: '8px', fontSize: isOrder ? '15px' : '12px', fontWeight: 700, color: '#000' }}>{width}</td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: '8px', fontSize: isOrder ? '15px' : '12px', fontWeight: 700, color: '#000' }}>{height}</td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: '8px', fontSize: isOrder ? '15px' : '12px', fontWeight: 700, color: '#000' }}>{pcs}</td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle', paddingTop: '8px', fontSize: isOrder ? '14px' : '12px', fontWeight: 700, color: '#000' }}>
                                  {(parseFloat(item.billed_sqft) || (Math.round(((width * height) / 144) * 100) / 100 * pcs)).toFixed(2)}
                                </td>
                              </>
                            )}

                            {!isDetailed && isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                                {groupTotalSqft.toFixed(2)}
                              </td>
                            )}

                            {!hidePrices && isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px' }}>
                                {unitPrice.toFixed(2)}
                              </td>
                            )}

                            {!hidePrices && isFirst && (
                              <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px', paddingRight: '8px', color: (item.is_selected !== false) ? '#000' : '#64748b' }}>
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

                {/* FINANCIAL SUMMARY ROWS (SHOWN ONLY IF PRICES ARE NOT HIDDEN) */}
                {!hidePrices && (
                  <>
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

                    {/* Excluding VAT Note */}
                    {(!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && (
                      <tr>
                        <td colSpan={isDetailed ? 9 : 6} style={{ fontSize: '11px', fontStyle: 'italic', color: '#333', background: '#fafafa', padding: '6px 12px' }}>
                          All prices quoted above are excluding VAT &amp; TAX
                        </td>
                      </tr>
                    )}

                    {/* Sub Total Row */}
                    <tr style={{ background: '#d1d5db' }}>
                      <td colSpan={isDetailed ? 8 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', color: '#000', padding: '6px 12px' }}>
                        Sub Total
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '13px', color: '#000', padding: '6px 8px' }}>
                        {calculatedNetTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {/* Total Sqft Summary Row when Prices are Hidden */}
            {hidePrices && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', border: '1.5px solid #cbd5e1', padding: '8px 16px', margin: '12px 0', fontSize: '12px', fontWeight: 700, borderRadius: '2px' }}>
                <span>Work Order Production Sheet (Factory Copy)</span>
                <span>Order Reference: {marketingPersonName}</span>
              </div>
            )}

            {/* Amount in Words (Shown only if prices are NOT hidden) */}
            {!hidePrices && (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', border: '1px solid #d1d5db', margin: '16px 0', fontSize: '12px', borderRadius: '2px' }}>
                <div style={{ background: '#f3f4f6', padding: '8px 12px', fontWeight: 'bold', color: '#111', borderRight: '1px solid #d1d5db' }}>
                  Amount in Words
                </div>
                <div style={{ padding: '8px 12px', color: '#111', fontWeight: 500 }}>
                  {numberToWords(calculatedNetTotal)}
                </div>
              </div>
            )}

            {/* Remarks & Notes */}
            {(quotation.note || quotation.remark || quotation.terms) && (
              <div style={{ fontSize: '12px', margin: '12px 0', color: '#111', background: '#f8fafc', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '3px' }}>
                <strong>Note / Remarks: </strong> {quotation.note || quotation.remark || quotation.terms}
              </div>
            )}

            {/* Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', margin: '24px 0 16px 0', fontSize: '12px' }}>
              <div>
                <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>
                  {isOrder ? 'Marketing / Salesperson Signature' : 'Please Confirm Acceptance of this Quote'}
                </strong>
                <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px', display: 'flex', alignItems: 'flex-end', padding: '4px 8px', fontSize: '11px', color: '#475569' }}>
                  Ref: {marketingPersonName}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ display: 'block', marginBottom: '8px', color: '#111' }}>Authorized Factory Signature</strong>
                <div style={{ height: '45px', border: '1px solid #e2e8f0', background: '#fafafa', borderRadius: '4px', marginBottom: '4px' }}></div>
                <div style={{ fontWeight: 'bold', color: '#000', fontSize: '12px' }}>Dhaka Blinds</div>
              </div>
            </div>

            {/* Terms & Conditions (Shown if prices not hidden or standard order terms) */}
            {!hidePrices && (
              <div style={{ margin: '16px 0' }}>
                <strong style={{ fontSize: '12px', color: '#000', display: 'block', marginBottom: '4px' }}>TERMS &amp; CONDITIONS:</strong>
                <div style={{ border: '1px solid #d1d5db', padding: '10px 12px', fontSize: '11px', color: '#333', background: '#fafafa', borderRadius: '2px', lineHeight: '1.5' }}>
                  {companyProfile?.terms_conditions || `You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.
  Please make your payment by cash or cheque in favour of "Dhaka Blinds" we hope you'll find ours rates reasonable and place an order with us.`}
                </div>
              </div>
            )}

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

export default QuotationPrintModal;
