import { isYardUnit, isRftUnit, isQtyUnit } from './quotationSections';

/**
 * How a line's size is shown on a printed document.
 *
 * A square-foot or PVC line is described by Width x Height x Pcs. A line sold
 * by count (pieces, sets, nos), by the yard or by the running foot has no
 * width or height at all - the database keeps 1 x 1 placeholders for them - so
 * those two columns print as a dash and the Pcs column carries the quantity in
 * its own unit ("4 yd", "12.5 ft").
 */
export const lineUnit = (item) => String(item?.product?.unit || item?.unit || '').trim();

/** True for lines that have no width x height to print. */
export const isQuantityLine = (item) => isQtyUnit(lineUnit(item));

const trimNumber = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? String(Number(n.toFixed(2))) : '';
};

/** The text for the Pcs column of a line. */
export const quantityText = (item) => {
  const unit = lineUnit(item);
  const pcs = parseInt(item?.pcs, 10) || 1;

  if (isRftUnit(unit)) return `${trimNumber(item?.width)} ft`;
  if (isYardUnit(unit)) return `${pcs} yd`;
  return String(pcs);
};

/** Quantity with its unit, spelled out for on-screen lists: "4 yd", "12.5 ft", "3 Pcs". */
export const quantityLabel = (item) => {
  const unit = lineUnit(item);
  if (isRftUnit(unit) || isYardUnit(unit)) return quantityText(item);
  return `${parseInt(item?.pcs, 10) || 1} Pcs`;
};

/** The billed amount of a line followed by the unit it is billed in. */
export const billedText = (item) => {
  const unit = lineUnit(item);
  const billed = item?.billed_sqft ?? 0;
  if (isRftUnit(unit)) return `${billed} ft`;
  if (isYardUnit(unit)) return `${billed} yd`;
  if (isQtyUnit(unit)) return `${billed} pcs`;
  return `${billed} sqft`;
};
