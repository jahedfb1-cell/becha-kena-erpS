/**
 * Turn a failed save into something the user can act on.
 *
 * A 422 from Laravel carries the useful part in `errors` - one entry per field
 * that failed, keyed like "items.2.notes". The top-level `message` is only ever
 * the generic "The given data was invalid.", so showing that alone (as the
 * quotation and order builders used to) told the user something was wrong but
 * never what, leaving them to guess which of a dozen rows to fix.
 */
export const describeSaveError = (err, fallback = 'Error occurred while saving.') => {
  const data = err?.response?.data;
  const errors = data?.errors;

  if (errors && typeof errors === 'object') {
    const lines = Object.entries(errors).map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages[0] : String(messages);
      // "items.2.notes" points at the 3rd item row - say so in the user's terms.
      const itemMatch = field.match(/^items\.(\d+)\.(.+)$/);
      if (itemMatch) {
        return `Item #${Number(itemMatch[1]) + 1} (${itemMatch[2].replace(/_/g, ' ')}): ${text}`;
      }
      return text;
    });
    if (lines.length) return lines.join('  |  ');
  }

  return data?.message || fallback;
};
