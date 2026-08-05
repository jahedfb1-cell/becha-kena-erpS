import React, { useState, useEffect } from 'react';
import axios from '../api/axios';
import { formatDate, numberToWords } from '../utils/format';

const DEMO_LOGO = '/logo-demo.svg';

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

  // Group items by product ID & colour/variant to merge identical rows
  const buildGroups = (itemList) => {
    const groups = [];
    itemList.forEach((item) => {
      const prodId = item.product_id;
      const variantName = item.variant?.name || item.product?.product_code || '';
      const key = `${prodId}-${variantName}`;
      
      let existing = groups.find(g => g.key === key);
      if (!existing) {
        existing = { key, rows: [] };
        groups.push(existing);
      }
      existing.rows.push({
        item,
        idx: item.id
      });
    });
    return groups;
  };

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
                  background: activePrintType === 'pad-simplified' ? '#ec4899' : 'transparent',
                  color: '#fff', border: 'none', padding: '5px 12px', fontSize: '11px',
                  borderRadius: '4px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s'
                }}
              >
                📝 Pad Invoice
              </button>
            </div>
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

        {/* Printable Invoice Content (Targeted for window.print) */}
        <div style={{ overflowY: 'auto', flex: 1, background: '#fff', padding: '10px' }}>
          <div className="quotation-print-container printable-area">
            
            {/* ── HEADER ── */}
            {!isPad ? (
              <div className="print-header" style={{ display: 'block', borderBottom: '2px solid #1a2f5a', paddingBottom: '8px', marginBottom: '8px' }}>
                <div style={{ textAlign: 'left', marginBottom: '6px' }}>
                  <img
                    src={logoSrc}
                    alt="Company Logo"
                    style={{
                      height: '70px',
                      maxWidth: '320px',
                      objectFit: 'contain',
                      display: 'block'
                    }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', color: '#444', marginBottom: '4px', lineHeight: '1.4' }}>
                      Fashionable Curtains, Vertical, Horizontal Venetian, Roller blinds, Zebra/Combi Double Layer Shade,<br/>
                      Remote Control Roller Curtains &amp; PVC Air Strip Door Curtains Importer &amp; Govt. Supplier
                    </div>
                    <div style={{ fontSize: '11px', color: '#222', lineHeight: '1.6' }}>
                      <strong>{companyProfile?.company_address || '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh,.'}</strong><br/>
                      Mobile : {companyProfile?.mobile || '01629000200'} &nbsp;|&nbsp; Email : {companyProfile?.email || 'dhakablinds@gmail.com'} &nbsp;|&nbsp; Web : {companyProfile?.company_web || 'www.dhakablinds.com'}
                      {companyProfile?.vat_reg_no && <span> &nbsp;|&nbsp; VAT Reg No : {companyProfile.vat_reg_no}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '220px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#1a2f5a', letterSpacing: '1px', marginBottom: '4px' }}>
                      Invoice
                    </div>
                    <div style={{ fontSize: '12px', color: '#333', lineHeight: '1.7' }}>
                      <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                      <div>Challan : <strong>{challanNo}</strong></div>
                      <div>PO No : <strong>{poNo}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Spacer and Metadata only for pre-printed Pad paper */
              <div style={{ display: 'block', marginBottom: '16px' }}>
                <div style={{ height: '110px' }} className="pad-print-spacer"></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ textAlign: 'right', minWidth: '220px' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#1a2f5a', letterSpacing: '1px', marginBottom: '4px' }}>
                      Invoice
                    </div>
                    <div style={{ fontSize: '12px', color: '#333', lineHeight: '1.7' }}>
                      <div>Date : <strong>{formatDate(invoice.invoice_date || invoice.created_at || new Date())}</strong></div>
                      <div>Challan : <strong>{challanNo}</strong></div>
                      <div>PO No : <strong>{poNo}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bill To & Ship To Address Boxes */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', width: '100%' }}>
              <div className="customer-print-box" style={{ flex: 1, margin: 0, width: 'auto' }}>
                <div className="box-header">Bill To: {invoice.invoice_number}</div>
                <div className="box-body" style={{ minHeight: '80px' }}>
                  <strong style={{ fontSize: '13px' }}>{customer?.company_name || customer?.name}</strong><br/>
                  {customer?.company_name && <div>Attn: {customer.name}</div>}
                  <div>{customer?.address || 'Dhaka, Bangladesh'}</div>
                  <div>{customer?.phone}</div>
                </div>
              </div>

              <div className="customer-print-box" style={{ flex: 1, margin: 0, width: 'auto' }}>
                <div className="box-header">Ship To:</div>
                <div className="box-body" style={{ minHeight: '80px' }}>
                  <div style={{ whiteSpace: 'pre-line' }}>{quotation.delivery_address || customer?.address || 'Dhaka, Bangladesh'}</div>
                </div>
              </div>
            </div>

            {/* Item Table */}
            <table className="print-table">
              <thead>
                {isDetailed ? (
                  <>
                    <tr>
                      <th rowSpan={2} style={{ width: '45px', textAlign: 'center', verticalAlign: 'middle' }}>Item No.</th>
                      <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Description</th>
                      <th rowSpan={2} style={{ width: '75px', textAlign: 'center', verticalAlign: 'middle' }}>Colours</th>
                      <th colSpan={4} style={{ textAlign: 'center' }}>Size</th>
                      <th rowSpan={2} style={{ width: '95px', textAlign: 'right', verticalAlign: 'middle' }}>Quantity / Sq.ft</th>
                      <th rowSpan={2} style={{ width: '80px', textAlign: 'right', verticalAlign: 'middle' }}>Price</th>
                      <th rowSpan={2} style={{ width: '100px', textAlign: 'right', verticalAlign: 'middle' }}>Amount Tk.</th>
                    </tr>
                    <tr>
                      <th style={{ width: '45px', textAlign: 'center' }}>Length</th>
                      <th style={{ width: '45px', textAlign: 'center' }}>Height</th>
                      <th style={{ width: '35px', textAlign: 'center' }}>Pcs</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Sq.ft</th>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={{ width: '45px', textAlign: 'center' }}>Item No.</th>
                    <th>Description</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Colours</th>
                    <th style={{ width: '120px', textAlign: 'right' }}>Quantity / Sq.ft</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>Price</th>
                    <th style={{ width: '110px', textAlign: 'right' }}>Amount Tk.</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {buildGroups(items).map((group, groupIdx) => {
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

                  return group.rows.map((entry, rowInGroup) => {
                    const { item, idx } = entry;
                    const width      = parseFloat(item.width) || 0;
                    const height     = parseFloat(item.height) || 0;
                    const pcs        = parseInt(item.pcs) || 1;
                    const actualSqft = parseFloat(item.actual_sqft) || Math.round(((width * height) / 144) * 100) / 100;
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
                          <td rowSpan={currentRowSpan} style={{ verticalAlign: 'top', paddingTop: '8px' }}>
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
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'center', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                            {item.product?.product_code || item.variant?.name || '-'}
                          </td>
                        )}

                        {isDetailed && (
                          <>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{width}</td>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{height}</td>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{pcs}</td>
                            <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '8px' }}>{actualSqft.toFixed(2)}</td>
                          </>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                            {groupTotalSqft.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'top', paddingTop: '8px' }}>
                            {unitPrice.toFixed(2)}
                          </td>
                        )}

                        {isFirst && (
                          <td rowSpan={currentRowSpan} style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top', paddingTop: '8px' }}>
                            {groupTotalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        )}
                      </tr>
                    );
                  });
                })}

                {/* Convenience Charge Row */}
                {parseFloat(quotation.convenience_charge) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{buildGroups(items).length + 1}</td>
                    <td colSpan={isDetailed ? 8 : 4}><strong>Conveyance Charge</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
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
                    <td colSpan={isDetailed ? 8 : 4}><strong>Other Installation Charges</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {parseFloat(quotation.other_charge).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* VAT Row */}
                {parseFloat(quotation.vat_percentage) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>-</td>
                    <td colSpan={isDetailed ? 8 : 4}><strong>VAT % ({quotation.vat_percentage}%)</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {(parseFloat(quotation.vat_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Discount Amount */}
                {parseFloat(invoice.discount_amount) > 0 && (
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>-</td>
                    <td colSpan={isDetailed ? 8 : 4}><strong>Discount Amount</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {parseFloat(invoice.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* Excluding VAT Note — show ONLY if VAT is empty or 0 */}
                {(!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && (
                  <tr>
                    <td colSpan={isDetailed ? 10 : 6} style={{ fontSize: '11px', fontStyle: 'italic', color: '#555', background: '#fafafa' }}>
                      All prices quoted above are excluding VAT &amp; TAX- AIT
                    </td>
                  </tr>
                )}

                {/* Total Bill / Grand Total */}
                <tr style={{ background: '#f8f9fa' }}>
                  <td colSpan={isDetailed ? 9 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                    Total Bill
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: '#000' }}>
                    {(parseFloat(invoice.grand_total) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Advance / Paid Amount */}
                <tr style={{ background: '#fff' }}>
                  <td colSpan={isDetailed ? 9 : 5} style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>
                    Advance
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: 'var(--success)' }}>
                    {(parseFloat(invoice.paid_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Price is based on sq.ft per slats / Balance Row */}
                <tr className="total-row" style={{ background: '#f8f9fa' }}>
                  <td colSpan={isDetailed ? 8 : 4} style={{ fontSize: '11px', color: '#555', verticalAlign: 'middle', fontWeight: 500 }}>
                    Price is based on sq.ft per slats
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '13px', verticalAlign: 'middle' }}>
                    Balance
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: 'var(--danger)' }}>
                    {(parseFloat(invoice.due_amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Amount in Words */}
            <div className="words-box">
              <strong>Amount in Words: </strong> {numberToWords(invoice.grand_total)}
            </div>

            {/* Remarks */}
            {invoice.note && (
              <div className="remarks-box">
                <strong>Remarks: </strong> {invoice.note}
              </div>
            )}

            {/* Signatures */}
            <div className="signatures-row" style={{ marginTop: '24px' }}>
              <div className="sig-box">
                <div className="sig-line"></div>
                <strong>Invoice Received By</strong>
              </div>
              <div className="sig-box" style={{ textAlign: 'right' }}>
                <div className="sig-line"></div>
                <strong>Thanking You</strong>
                <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 600 }}>Dhaka Blinds</div>
              </div>
            </div>

            {/* NOTES: Block matching official Invoice sample */}
            <div className="remarks-box" style={{ borderTop: '1px solid #ccc', paddingTop: '8px', marginTop: '12px' }}>
              <strong>NOTES:</strong>
              <div style={{ height: '24px' }}></div>
            </div>

            <div className="thank-you-footer">
              THANK YOU FOR DOING BUSINESS WITH US
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoicePrintModal;
