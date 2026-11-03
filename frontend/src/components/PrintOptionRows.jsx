import React from 'react';

/**
 * Table rows the quotation print pages put around quotation options and
 * rooms (see utils/printGroups.js). Inline styles on purpose: these render
 * inside the printable sheet, which is styled inline throughout so the
 * PDF/print output does not depend on the app stylesheet.
 */
const fmt = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function OptionHeadingRow({ colSpan, no, selected }) {
  return (
    <tr className="option-header-row">
      <td
        colSpan={colSpan}
        style={{
          textAlign: 'left',
          padding: '9px 12px',
          fontSize: '14px',
          fontWeight: 800,
          color: '#111827',
          background: '#eef2ff',
          border: '1px solid #94a3b8',
          borderTop: '2px solid #475569',
        }}
      >
        Option {no}
      </td>
    </tr>
  );
}

export function RoomHeadingRow({ colSpan, name }) {
  return (
    <tr className="room-header-row">
      <td
        colSpan={colSpan}
        style={{
          textAlign: 'left',
          padding: '6px 12px',
          fontSize: '12.5px',
          fontWeight: 700,
          color: '#1f2937',
          background: '#fafafa',
          border: '1px solid #cbd5e1',
        }}
      >
        {name}
      </td>
    </tr>
  );
}

export function OptionTotalRow({ labelSpan, no, selected, total }) {
  return (
    <tr className="option-total-row">
      <td
        colSpan={labelSpan}
        style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 700, fontSize: '12.5px', color: '#111827', border: '1px solid #cbd5e1', background: '#f8fafc' }}
      >
        Option {no} Total
      </td>
      <td
        style={{ textAlign: 'right', padding: '7px 8px', fontWeight: 800, fontSize: '13px', color: '#111827', border: '1px solid #cbd5e1', background: '#f8fafc' }}
      >
        {fmt(total)}
      </td>
    </tr>
  );
}
