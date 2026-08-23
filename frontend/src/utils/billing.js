/**
 * Quotation billing maths: PVC strip-curtain slats, and sq.ft rounding.
 *
 * A PVC door curtain is built from vertical strips ("slats"). Each strip is
 * physically 8" wide but overlaps its neighbour, so one strip only covers
 * about 5.85" of the doorway. Billing is done on the *material* width
 * (slats x 8"), not on the doorway width, which is why a PVC row prices
 * higher than a plain sq.ft row of the same door size.
 *
 * These helpers live in one place because the same rule is needed by the
 * quotation builder, the order builder and every print/PDF view - and when
 * they each had their own copy they had already drifted apart (some used
 * Math.ceil, one used Math.round), so the same door quoted two different
 * prices depending on which screen you were looking at.
 */

/** Doorway width, in inches, covered by a single overlapping slat. */
export const PVC_SLAT_PITCH = 5.85;

/** Default physical width, in inches, of one slat. */
export const PVC_SLAT_WIDTH = 8;

/**
 * Exact (unrounded) slat ratio, kept for the read-only "Approx Pcs" column
 * so the estimator can see the real number behind the rounded count.
 */
export const pvcApproxSlats = (width) => {
  const w = parseFloat(width) || 0;
  return w > 0 ? (w / PVC_SLAT_PITCH).toFixed(2) : '';
};

/**
 * Slat count actually charged for.
 *
 * The trade rule is to drop the fraction unless it reaches three quarters of
 * a slat: 11.74 stays 11, 11.75 becomes 12. Adding 0.25 before flooring
 * expresses exactly that threshold.
 */
export const pvcSlatCount = (width) => {
  const w = parseFloat(width) || 0;
  if (w <= 0) return 0;
  return Math.floor(w / PVC_SLAT_PITCH + 0.25);
};

/**
 * Total material width in inches for a doorway, i.e. what the sq.ft billing
 * is actually measured across.
 */
export const pvcBillingWidth = (width, slatWidth = PVC_SLAT_WIDTH) => {
  const size = parseFloat(slatWidth) || PVC_SLAT_WIDTH;
  return pvcSlatCount(width) * size;
};

/**
 * Billed sq.ft for a plain "Square feet" line.
 *
 * Fabric is cut and sold in quarter-foot steps, so a billed area always moves
 * UP to the next quarter - 45.375 bills as 45.50, and 45.10 bills as 45.25.
 * Note this is a different rule from the PVC slat threshold above: this one
 * never rounds down, because the offcut below the quarter mark is wasted
 * either way.
 *
 * PVC rows do NOT use this - their area already comes from a whole number of
 * slats - and Pcs rows have no area at all.
 */
export const billableSqft = (perPieceSqft, pcs = 1) => {
  const area = parseFloat(perPieceSqft) || 0;
  const count = parseInt(pcs) || 1;
  if (area <= 0) return 0;
  return Math.ceil((area * count) / 0.25) * 0.25;
};

/**
 * Whether a line item is billed by the PVC slat formula above rather than
 * plain sq.ft or per-piece pricing.
 *
 * The product's Measurement Unit field ("PVC sq.ft", set in the product
 * form's Measurement Unit dropdown) is the highest-priority signal - it's
 * what actually drives the slat math everywhere else in the app - so it's
 * checked first and decides the answer outright whenever it says PVC.
 *
 * It cannot be the *only* signal, though: every pre-existing product in
 * this system was created before that three-way Measurement Unit field
 * existed, so their `unit` column holds an older, generic value (`sqft`,
 * `Square feet`, `Pcs`) that says nothing about whether the item is PVC.
 * For those, category name and product name - both of which correctly
 * carry "PVC Strip Curtain" for this product line - are what determines it,
 * exactly as this function did before the Measurement Unit field existed.
 */
export const isPvcItem = (item) => {
  const unit = (item.product?.unit || item.unit || '').toLowerCase();
  if (unit.includes('pvc')) return true;

  const category = (item.product?.category?.name || item.category_name || '').toLowerCase();
  const name = (item.product?.name || item.product_name || '').toLowerCase();
  return category.includes('pvc') || name.includes('pvc') || name.includes('clear water');
};
