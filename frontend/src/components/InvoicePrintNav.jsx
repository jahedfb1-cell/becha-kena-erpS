import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * The full set of invoice print-view buttons, shared by InvoicePrintPage,
 * PvcInvoicePrintPage, and PvcChallanPrintPage. Each of those pages used to
 * carry only the buttons relevant to itself, so switching from e.g. "PVC
 * Detailed Invoice" to "View Invoice" meant clicking Back first and losing
 * your place - every print view for an invoice is one click away from every
 * other one now, on whichever of the three pages you're currently on.
 */
const BUTTONS = [
  { key: 'invoice-detailed', label: '🖨️ Detailed Invoice', to: (id) => `/invoices/print/${id}?type=detailed` },
  { key: 'invoice-simplified', label: '🖨️ View Invoice', to: (id) => `/invoices/print/${id}?type=simplified` },
  { key: 'invoice-pad-sizes', label: '📝 Pad Invoice (Sizes)', to: (id) => `/invoices/print/${id}?type=pad-sizes` },
  { key: 'invoice-pad', label: '📝 Pad Invoice', to: (id) => `/invoices/print/${id}?type=pad` },
  { key: 'challan', label: '🚚 Delivery Challan', to: (id) => `/invoices/print/${id}/challan` },
];

const PVC_BUTTONS = [
  { key: 'pvc-invoice-detailed', label: '🧵 PVC Detailed Invoice', to: (id) => `/invoices/print/${id}/pvc-invoice?type=detailed` },
  { key: 'pvc-invoice-pad-sizes', label: '🧵 PVC Pad Invoice (Sizes)', to: (id) => `/invoices/print/${id}/pvc-invoice?type=pad-sizes` },
  { key: 'pvc-challan', label: '🧵 PVC Challan', to: (id) => `/invoices/print/${id}/pvc-challan` },
];

const InvoicePrintNav = ({ id, current, hasPvc }) => {
  const navigate = useNavigate();
  const all = hasPvc ? [...BUTTONS, ...PVC_BUTTONS] : BUTTONS;

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {all.map((btn) => {
        const isActive = btn.key === current;
        const isPvc = btn.key.startsWith('pvc-');
        return (
          <button
            key={btn.key}
            onClick={() => navigate(btn.to(id))}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: isActive ? '#2563eb' : (isPvc ? '#7c3aed' : '#334155'),
              color: '#fff'
            }}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
};

export default InvoicePrintNav;
