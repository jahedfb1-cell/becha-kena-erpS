import { pvcSlatCount, isPvcItem } from './billing';

/**
 * Numbers shared by the quotation print page and its Excel export, so the two
 * can never disagree. Moved here unchanged from QuotationPrintPage.jsx.
 */

export const numberToWords = (num) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_array = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_array) return '';
    let str = '';
    str += (n_array[1] != 0) ? (a[Number(n_array[1])] || b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
    str += (n_array[2] != 0) ? (a[Number(n_array[2])] || b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
    str += (n_array[3] != 0) ? (a[Number(n_array[3])] || b[n_array[3][0]] + ' ' + a[n_array[3][1]]) + 'Thousand ' : '';
    str += (n_array[4] != 0) ? (a[Number(n_array[4])] || b[n_array[4][0]] + ' ' + a[n_array[4][1]]) + 'Hundred ' : '';
    str += (n_array[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n_array[5])] || b[n_array[5][0]] + ' ' + a[n_array[5][1]]) : '';
    return str;
  };

  const amount = parseFloat(num) || 0;
  const taka = Math.floor(amount);
  const paisa = Math.round((amount - taka) * 100);

  let result = inWords(taka) ? inWords(taka) + 'Taka ' : 'Zero Taka ';
  if (paisa > 0) {
    result += 'and ' + inWords(paisa) + 'Paisa ';
  }
  return result.trim() + ' Only.';
};

// PVC strip-curtain items (e.g. "PVC Strip Door Curtain" / "2mm Clear Water
// Co") are billed by total width — slat count × each slat's width — rather
// than the customer's requested opening width. The printed Width column
// shows that total-width figure for these items instead of the raw width,
// matching the "T. Width (in)" figure shown for the same products in the
// quotation builder.
export const getDisplayWidth = (item) => {
  const width = parseFloat(item.width) || 0;
  if (!isPvcItem(item)) return width;
  const slatSize = parseFloat(item.product?.product_size) || 8;
  // Falls back to the shared pvcSlatCount() rule (round up only past the
  // 3/4-slat mark) rather than a plain Math.ceil, so an item whose slat
  // count wasn't already saved on the record still bills the same width
  // here as it would in the quotation builder or on the PVC Challan.
  const slats = (item.slats !== undefined && item.slats !== null && item.slats !== '')
    ? parseInt(item.slats)
    : pvcSlatCount(width);
  return Math.round(slats * slatSize * 100) / 100;
};

/** Amount of one line: the saved total, or billed sq.ft x rate when the total was not saved. */
export const lineTotalOf = (item) => {
  const w = getDisplayWidth(item);
  const h = parseFloat(item.height) || 0;
  const fallbackSqft = Math.round(((w * h) / 144) * 100) / 100;
  const billedSqft = parseFloat(item.billed_sqft) || fallbackSqft;
  const unitPrice = parseFloat(item.unit_price) || 0;
  return parseFloat(item.line_total) || Math.round(billedSqft * unitPrice * 100) / 100;
};

/** Billed quantity (Quantity/Sq.ft column) of one line. */
export const lineSqftOf = (item) => {
  const w = getDisplayWidth(item);
  const h = parseFloat(item.height) || 0;
  const fallback = Math.round(((w * h) / 144) * 100) / 100;
  return parseFloat(item.billed_sqft) || fallback;
};

/** Quantity and amount of a printed product line (all its size rows together). */
export const groupTotals = (group) => ({
  sqft: group.rows.reduce((sum, e) => sum + lineSqftOf(e.item), 0),
  amount: group.rows.reduce((sum, e) => sum + lineTotalOf(e.item), 0),
});

/** Sub Total: the chosen lines plus the charges and VAT, exactly as printed. */
export const quotationNetTotal = (quotation) =>
  (quotation.items || []).reduce((sum, item) => (item.is_selected === false ? sum : sum + lineTotalOf(item)), 0)
  + (parseFloat(quotation.convenience_charge) || 0)
  + (parseFloat(quotation.other_charge) || 0)
  + (parseFloat(quotation.vat_amount) || 0);
