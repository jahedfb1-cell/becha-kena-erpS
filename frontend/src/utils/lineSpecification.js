/**
 * The specification text that prints under a line's product name.
 *
 * The quotation form pre-fills this box from the product's master details,
 * so most lines carry their own copy. Three cases have to stay distinct:
 *
 *  - text of its own  -> print that text, because it was written for this
 *    order: a different fabric, an agreed extra, a different minimum.
 *  - never filled in  -> fall back to the product's master details, which
 *    is what older lines and anything created outside the form rely on.
 *  - deliberately emptied -> print nothing. Falling back here would put
 *    back the exact words the salesman just removed, which is the one
 *    thing an empty box must not do.
 *
 * Null and empty string are what separate the last two, so neither may be
 * collapsed into the other on the way here — see PRESERVE_EMPTY_ITEM_FIELDS
 * in app/Http/Requests/QuotationRequest.php for the matching care taken on
 * the way in.
 */
export const lineSpecification = (item) => {
  const notes = item?.notes;

  if (notes === null || notes === undefined) {
    return item?.product?.details || '';
  }

  return notes;
};

/**
 * Whether that text amounts to anything worth printing. Rich text arrives as
 * markup, so an "empty" value is often a stray paragraph or break rather
 * than an empty string.
 */
export const hasSpecification = (item) => {
  const spec = lineSpecification(item);

  return String(spec)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim() !== '';
};

/**
 * Groups rows by the text they will print, so two lines of the same product
 * at the same price stay apart when their specifications differ — otherwise
 * one line's text would be printed as if it spoke for both.
 */
export const specificationKey = (item) => String(lineSpecification(item)).trim();
