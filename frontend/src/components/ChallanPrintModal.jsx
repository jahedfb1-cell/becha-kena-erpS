import React from 'react';
import { formatDate } from '../utils/format';

const ChallanPrintModal = ({ isOpen, onClose, challan, onSendEmail }) => {
  if (!isOpen || !challan) return null;

  const handlePrint = () => {
    window.print();
  };

  const [challanItems, setChallanItems] = React.useState([]);

  React.useEffect(() => {
    if (challan) {
      const initItems = challan.items || challan.invoice?.quotation?.items || [];
      setChallanItems(initItems.map(i => ({ ...i, id: i.id || Date.now() + Math.random() })));
    }
  }, [challan]);

  const handleAddItemRow = () => {
    setChallanItems([
      ...challanItems,
      {
        id: Date.now() + Math.random(),
        product: { product_code: 'NEW', name: 'Custom Item' },
        width: 0,
        height: 0,
        pcs: 1,
        billed_sqft: 0,
        notes: ''
      }
    ]);
  };

  const handleRemoveItemRow = (id) => {
    if (challanItems.length <= 1) return;
    setChallanItems(challanItems.filter(item => item.id !== id));
  };

  const handleItemChange = (id, field, value) => {
    setChallanItems(challanItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'width' || field === 'height' || field === 'pcs') {
        const w = parseFloat(field === 'width' ? value : updated.width) || 0;
        const h = parseFloat(field === 'height' ? value : updated.height) || 0;
        const pcs = parseInt(field === 'pcs' ? value : updated.pcs) || 1;
        const u = (updated.product?.unit || updated.unit || '').trim().toLowerCase();
        const isPcs = u === 'pcs' || u === 'pieces' || u === 'piece' || u === 'box' || u === 'set';
        if (isPcs) {
          updated.billed_sqft = pcs;
        } else if (w > 0 && h > 0) {
          updated.billed_sqft = Math.round(((w * h) / 144 * pcs) * 100) / 100;
        }
      }
      return updated;
    }));
  };

  const hasPvc = challanItems.some(item => {
    const u = (item.product?.unit || item.unit || '').toLowerCase();
    const c = (item.product?.category?.name || item.category_name || '').toLowerCase();
    const p = (item.product?.name || item.product_name || '').toLowerCase();
    return u.includes('pvc') || c.includes('pvc') || p.includes('pvc') || p.includes('clear water');
  });

  return (
    <>
      <div className="custom-modal-overlay no-print" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '880px', maxHeight: '92vh' }}>
          
          {/* Header Action Bar */}
          <div className="custom-modal-header no-print" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="custom-modal-title" style={{ fontSize: '18px', color: '#0f172a' }}>
              🚚 Delivery Challan ({challan.challan_number})
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="secondary-btn no-print"
                onClick={handleAddItemRow}
                style={{ padding: '6px 12px', fontSize: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ➕ Add Line Item
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handlePrint}
                style={{ padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span>🖨️</span> Print PDF
              </button>
              {onSendEmail && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => onSendEmail(challan.id)}
                  style={{ padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>✉️</span> Email PDF
                </button>
              )}
              <button
                type="button"
                className="logout-btn"
                onClick={onClose}
                style={{ padding: '6px 12px', fontSize: '13px' }}
              >
                &times;
              </button>
            </div>
          </div>

          {/* Printable Document Body */}
          <div style={{ padding: '24px', overflowY: 'auto', background: '#fff' }} className="printable-area">
            
            {/* Header / Brand */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
                  DHAKABLINDS-IMS
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Dhaka Blinds & Interior Solutions<br />
                  House 12, Road 5, Block B, Dhaka | Phone: +880 1700-000000
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-block', background: '#0f172a', color: '#fff', padding: '6px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  DELIVERY CHALLAN
                </div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#334155' }}>
                  Challan No: <strong>{challan.challan_number}</strong><br />
                  Date: <strong>{formatDate(challan.delivery_date || challan.created_at)}</strong>
                </div>
              </div>
            </div>

            {/* Info Grid: Customer & Delivery Address */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Customer Information</span>
                <h4 style={{ margin: '4px 0 2px', fontSize: '15px', color: '#0f172a' }}>{customer.company_name || customer.name || 'N/A'}</h4>
                <p style={{ margin: 0, fontSize: '13px', color: '#475569' }}>
                  Contact: {customer.name} ({customer.phone || 'N/A'})<br />
                  Email: {customer.email || 'N/A'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Delivery Details</span>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0f172a', fontWeight: 500 }}>
                  <strong>Address:</strong> {challan.delivery_address || customer.address || 'Site Address'}<br />
                  <strong>Invoice Ref:</strong> {invoice.invoice_number || 'N/A'}<br />
                  <strong>Driver:</strong> {challan.driver_name || 'Assigned Delivery Agent'} ({challan.driver_phone || 'N/A'})
                </p>
              </div>
            </div>

            {/* Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#334155', width: '45px' }}>SN</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Product / Color Code</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#334155', width: '75px' }}>Width</th>
                  {hasPvc && <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#334155', width: '80px' }}>T. Width</th>}
                  <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#334155', width: '75px' }}>Height</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#334155', width: '65px' }}>Pcs</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: '#334155', width: '95px' }}>Billing Qty</th>
                  <th className="no-print" style={{ padding: '10px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#334155', width: '50px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {challanItems.length === 0 ? (
                  <tr>
                    <td colSpan={hasPvc ? 8 : 7} style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No line items found.</td>
                  </tr>
                ) : (
                  challanItems.map((item, idx) => {
                    const u = (item.product?.unit || item.unit || '').trim().toLowerCase();
                    const cat = (item.product?.category?.name || item.category_name || '').toLowerCase();
                    const pName = (item.product?.name || item.product_name || '').toLowerCase();
                    const isPvc = u.includes('pvc') || cat.includes('pvc') || pName.includes('pvc') || pName.includes('clear water');
                    const isPcs = u === 'pcs' || u === 'pieces' || u === 'piece' || u === 'box' || u === 'set';
                    const width = parseFloat(item.width) || 0;

                    let tWidthVal = '-';
                    if (isPvc && width > 0) {
                      const slatSize = parseFloat(item.product?.product_size || item.product_size) || 8;
                      const slats = Math.ceil(width / 5.85);
                      tWidthVal = slats * slatSize;
                    }

                    return (
                      <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '8px 10px', fontSize: '13px', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px', fontSize: '13px' }}>
                          <span className="print-only">
                            <strong>{item.product?.product_code || item.product_code || 'ITEM'}</strong> - {item.product?.name || item.name || 'Custom Line Item'}
                          </span>
                          <input
                            type="text"
                            className="no-print modern-form-control"
                            value={item.name || item.product?.name || 'Custom Item'}
                            onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                            placeholder="Product / Item Description"
                            style={{ width: '100%', fontSize: '12px', padding: '4px 6px', fontWeight: 600 }}
                          />
                          {item.notes && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Note: {item.notes}</div>}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>
                          <span className="print-only">{isPcs ? '—' : (item.width || '—')}</span>
                          <input
                            type="number"
                            className="no-print modern-form-control"
                            value={isPcs ? '' : item.width}
                            disabled={isPcs}
                            placeholder={isPcs ? '—' : 'W'}
                            onChange={(e) => handleItemChange(item.id, 'width', e.target.value)}
                            style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        {hasPvc && (
                          <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
                            {isPcs ? '—' : (isPvc ? tWidthVal : (item.width || '—'))}
                          </td>
                        )}
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px' }}>
                          <span className="print-only">{isPcs ? '—' : (item.height || '—')}</span>
                          <input
                            type="number"
                            className="no-print modern-form-control"
                            value={isPcs ? '' : item.height}
                            disabled={isPcs}
                            placeholder={isPcs ? '—' : 'H'}
                            onChange={(e) => handleItemChange(item.id, 'height', e.target.value)}
                            style={{ width: '60px', textAlign: 'center', padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>
                          <span className="print-only">{item.pcs || 1}</span>
                          <input
                            type="number"
                            className="no-print modern-form-control"
                            value={item.pcs || 1}
                            onChange={(e) => handleItemChange(item.id, 'pcs', e.target.value)}
                            style={{ width: '50px', textAlign: 'center', padding: '4px', fontSize: '12px' }}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                          {isPcs ? `${item.pcs || 1} pcs` : `${item.billed_sqft || 0} sqft`}
                        </td>
                        <td className="no-print" style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(item.id)}
                            style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '4px', width: '24px', height: '24px', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Remove row (-)"
                          >
                            −
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Terms & Signatures */}
            <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ textAlign: 'center', width: '200px' }}>
                <div style={{ borderBottom: '1px solid #0f172a', marginBottom: '8px' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Receiver's Signature & Seal</span>
              </div>
              <div style={{ textAlign: 'center', width: '200px' }}>
                <div style={{ borderBottom: '1px solid #0f172a', marginBottom: '8px' }}></div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Authorized Signature</span>
              </div>
            </div>

          </div>

          {/* Modal Footer */}
          <div className="custom-modal-footer no-print" style={{ background: '#f8fafc' }}>
            <button type="button" className="btn-modal-cancel" onClick={onClose}>
              Close
            </button>
          </div>

        </div>
      </div>
    </>
  );
};

export default ChallanPrintModal;
