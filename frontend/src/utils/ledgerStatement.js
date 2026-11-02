const dayOf = (d) => String(d || '').slice(0, 10);

/**
 * Turns a customer's full ledger into a statement for an optional date range.
 *
 * Rows are ordered by date then id and the running balance is recomputed from
 * the balance brought forward, so a filtered statement is self-consistent even
 * when the stored row order is not chronological (e.g. a backdated payment or
 * an opening balance added after invoices existed). With no filter the closing
 * balance equals the customer's current due.
 */
export const buildStatement = (ledgers, from = '', to = '') => {
  const sorted = [...(ledgers || [])].sort((a, b) => {
    const da = dayOf(a.transaction_date);
    const db = dayOf(b.transaction_date);
    return da === db ? a.id - b.id : (da < db ? -1 : 1);
  });

  let broughtForward = 0;
  const inRange = [];
  sorted.forEach((l) => {
    const day = dayOf(l.transaction_date);
    if (from && day < from) {
      broughtForward += (parseFloat(l.debit) || 0) - (parseFloat(l.credit) || 0);
    } else if (!to || day <= to) {
      inRange.push(l);
    }
  });

  let running = broughtForward;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = inRange.map((l) => {
    const debit = parseFloat(l.debit) || 0;
    const credit = parseFloat(l.credit) || 0;
    running += debit - credit;
    totalDebit += debit;
    totalCredit += credit;
    return { ...l, debit, credit, runningBalance: running };
  });

  return {
    rows,
    broughtForward: from ? broughtForward : null,
    totalDebit,
    totalCredit,
    closing: running,
  };
};

export const ledgerTypeLabel = (type) => {
  if (type === 'opening_balance') return 'Opening Bal.';
  if (type === 'invoice') return 'invoice/Bill';
  if (type === 'advance_payment') return 'advance';
  return type;
};
