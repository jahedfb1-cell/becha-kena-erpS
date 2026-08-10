/**
 * Format currency in Bangladeshi Taka (BDT)
 */
export const formatCurrency = (value) => {
  const num = parseFloat(value) || 0;
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 2,
  }).format(num).replace('BDT', '৳');
};

/**
 * Format date in readable format safely
 */
export const formatDate = (dateString) => {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch (e) {
    return String(dateString);
  }
};

/**
 * Normalize a phone number into standard Bangladeshi mobile format:
 * 11 digits starting with 0, no spaces/dashes/country code (e.g. 01811941600).
 *
 * Accepts whatever the user actually typed - "+880 1715-100033",
 * "0 1715-100033", "8801715100033", "1715100033" - and cleans it up.
 * Anything that isn't a recognizable 10/11-digit BD mobile number (a
 * landline, a foreign number, an incomplete number) is left as
 * digits-only, since forcing an 11-digit "01..." shape onto it would be
 * wrong, not just unformatted.
 */
export const normalizeBdPhone = (raw) => {
  if (!raw) return raw;
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  // Strip a leading country code, tolerating a stray extra 0 before it
  // (e.g. "+880...", "880...", "0880...").
  digits = digits.replace(/^0*880/, '');
  // Collapse any remaining leading zeros to a single one.
  digits = digits.replace(/^0+/, '');

  if (digits.length === 10) {
    digits = '0' + digits;
  }

  return digits;
};

/**
 * Format square feet formatting
 */
export const formatSqft = (value) => {
  const num = parseFloat(value) || 0;
  return `${num.toFixed(2)} sqft`;
};

/**
 * Convert numbers to words in BDT format
 */
export const numberToWords = (amount) => {
  const num = Math.floor(Math.abs(parseFloat(amount) || 0));
  if (num === 0) return 'Zero Taka Only.';

  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  return `${inWords(num)} Taka Only.`;
};
