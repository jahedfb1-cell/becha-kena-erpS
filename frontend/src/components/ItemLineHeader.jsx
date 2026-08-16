import React from 'react';

/**
 * Column titles, keyed by the measurement unit the product line bills in.
 *
 * A single table header at the top of a section can only ever be right for one
 * unit: a Motor line sat under headings like "Width" and "T. Width (in)", which
 * mean nothing for a per-piece item, and a Roller Blind sat under PVC slat
 * headings. So every line carries its own header instead, the way the pricing
 * sheet lays its three blocks out.
 *
 * Columns that do not apply to a unit resolve to an empty title rather than
 * being dropped, because the cells still have to line up with the row below.
 */
const TITLES = {
  pvc: {
    product: 'Product Code / Name *',
    unit_price: 'Unit Price',
    width: 'Actual Width',
    approx: 'Approx Pcs',
    slats: 'pcs of Slats',
    twidth: 'T. Width (in)',
    height: 'Height',
    pcs: 'Pcs / Qty',
    billing: 'Total Sq.Ft',
    total: 'Total Price',
    action: 'Action',
  },
  sqft: {
    product: 'Product Code / Name *',
    unit_price: 'Unit Price',
    width: 'Width',
    height: 'Height',
    pcs: 'Pcs / Qty',
    billing: 'Total Sq.Ft',
    total: 'Total Price',
    action: 'Action',
  },
  pcs: {
    product: 'Product Code / Name *',
    unit_price: 'Unit Price',
    pcs: 'Pcs / Set',
    billing: 'Total Pcs',
    total: 'Total Price',
    action: 'Action',
  },
};

const UNIT_LABELS = {
  pvc: 'PVC sq.ft',
  sqft: 'Square Feet ( sq.ft )',
  pcs: 'Pieces ( pcs )',
};

export const unitKindOf = ({ isPcsBlock, isPvcBlock }) =>
  (isPcsBlock ? 'pcs' : (isPvcBlock ? 'pvc' : 'sqft'));

/**
 * Titles for one line, in the order the caller's table actually renders its
 * columns. `columns` is a list of the keys above - the quotation builder shows
 * the slat columns, the order builder does not, so each passes its own set.
 */
export const itemColumnTitles = (columns, kind) =>
  columns.map((key) => TITLES[kind][key] || '');

/**
 * The two rows that open a product line: the selected product spelled out, then
 * that line's own column titles.
 *
 * The product name is called out on its own row because the Product column is
 * the first cell of a wide, horizontally scrolling table - on a narrow screen
 * it scrolls out of view and leaves a row of numbers with nothing naming them.
 */
const ItemLineHeader = ({ productCode, productName, kind, columns }) => {
  const isPcs = kind === 'pcs';
  const sizeColsCount = columns.filter(c => !['product', 'unit_price', 'billing', 'total', 'action'].includes(c)).length;
  const titles = itemColumnTitles(columns, kind);

  return (
    <>
      <tr className="block-product-row">
        <td
          colSpan={columns.length}
          style={{ padding: '8px 10px', background: '#f8fafc', borderTop: '2px solid #cbd5e1', borderBottom: '1px solid #e2e8f0' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '12px', color: '#0f172a', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>
              {productCode ? productCode.toUpperCase() : 'NO CODE'}
            </span>
            <span style={{ fontWeight: '600', fontSize: '13px', color: '#334155' }}>
              {productName || 'Unnamed product'}
            </span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '10px' }}>
              {UNIT_LABELS[kind]}
            </span>
          </div>
        </td>
      </tr>

      <tr className="block-header-row">
        {isPcs ? (
          <>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'left', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Product Code / Name *
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Unit Price
            </th>
            <th scope="col" colSpan={sizeColsCount} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#0369a1', background: '#e0f2fe', borderBottom: '1px solid #bae6fd', whiteSpace: 'nowrap' }}>
              Quantity (Pcs / Set)
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Total Pcs
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Total Price
            </th>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Action
            </th>
          </>
        ) : (
          titles.map((title, idx) => (
            <th
              key={idx}
              scope="col"
              style={{
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: '700',
                textAlign: idx === 0 ? 'left' : 'center',
                color: '#475569',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                whiteSpace: 'nowrap',
              }}
            >
              {title || ' '}
            </th>
          ))
        )}
      </tr>
    </>
  );
};

export default ItemLineHeader;
