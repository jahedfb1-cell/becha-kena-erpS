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
const ItemLineHeader = ({ productCode, productName, kind, columns, changeProductUI }) => {
  const isPcs = kind === 'pcs';
  const sizeColsCount = columns.filter(c => !['product', 'unit_price', 'billing', 'total', 'action'].includes(c)).length;
  const titles = itemColumnTitles(columns, kind);

  const combinedProductName = (
    <div style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <span>Product Code / Name * </span>
      <strong style={{ marginLeft: '4px' }}>
        {productCode ? productCode.toUpperCase() : 'NO CODE'}
      </strong>
    </div>
  );

  return (
    <>
      <tr className="block-header-product-row">
        <th colSpan={columns.length} style={{ padding: '8px 12px', textAlign: 'left', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', overflow: 'visible' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflowX: 'auto' }}>
            {combinedProductName}
            <div style={{ flexShrink: 0 }}>{changeProductUI}</div>
          </div>
        </th>
      </tr>
      <tr className="block-header-row">
        {isPcs ? (
          <>
            <th scope="col" style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#475569', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
              Unit Price
            </th>
            {/* Spans one extra column vs. its own size-input cell in the row below
                (see the matching colSpan in the table body) so it absorbs what used
                to be a separate "Total Pcs" column - for a Pcs-unit line there's
                always exactly one size row, so "Total Pcs" was just repeating this
                same Quantity value under a second heading. */}
            <th scope="col" colSpan={sizeColsCount + 1} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: '700', textAlign: 'center', color: '#0369a1', background: '#e0f2fe', borderBottom: '1px solid #bae6fd', whiteSpace: 'nowrap' }}>
              Quantity (Pcs / Set)
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
                textAlign: 'center',
                color: '#475569',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
                whiteSpace: 'nowrap',
              }}
            >
              {title || ' '}
            </th>
          ))
        )}
      </tr>
    </>
  );
};

export default ItemLineHeader;
