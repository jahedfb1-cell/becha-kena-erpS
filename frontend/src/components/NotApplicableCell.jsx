import React from 'react';

/**
 * Placeholder for a measurement cell that does not apply to this row's unit -
 * PVC slat columns on a plain sq.ft row, or width/height on a per-piece row.
 *
 * These used to render a greyed-out disabled input. That was misleading: an
 * input box, even a dead one, reads as "something belongs here", so estimators
 * kept trying to type into cells that can never hold a value. A quiet dash
 * keeps the column aligned while making it obvious the cell is not theirs to
 * fill.
 */
const NotApplicableCell = ({ className = 'cell-size' }) => (
  <td className={className} style={{ padding: '6px', textAlign: 'center', color: '#cbd5e1', userSelect: 'none' }}>
    –
  </td>
);

export default NotApplicableCell;
