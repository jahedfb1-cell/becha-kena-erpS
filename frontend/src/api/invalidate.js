import { masterDataKeys } from '../hooks/useMasterData';
import { listKeys } from '../hooks/useListData';

/**
 * Central place describing which cached lists each business action makes
 * stale, so a page never has to remember the ripple effects itself.
 *
 * Without this, cached data silently goes out of date: e.g. editing a
 * product's price on the Products page would leave the quotation builder
 * quoting the old price until the cache expired.
 *
 * Every helper takes the queryClient and returns nothing — call it right
 * after the API call succeeds, and BEFORE any navigate(), so the destination
 * page renders fresh data instead of a stale cache.
 */

const invalidate = (queryClient, keys) => {
  keys.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
};

/** A customer was created, edited or archived. */
export const invalidateCustomers = (queryClient) =>
  invalidate(queryClient, [
    masterDataKeys.customers(false),
    masterDataKeys.customers(true),
  ]);

/** A product was created or edited — affects quotation/order pricing. */
export const invalidateProducts = (queryClient) =>
  invalidate(queryClient, [masterDataKeys.products()]);

/** A supplier was created, edited or archived. */
export const invalidateSuppliers = (queryClient) =>
  invalidate(queryClient, [masterDataKeys.suppliers()]);

/**
 * A quotation/order changed status (created, edited, converted, approved,
 * rejected, archived, restored). Orders and Quotations read the same feed.
 */
export const invalidateOrders = (queryClient) =>
  invalidate(queryClient, [listKeys.quotations()]);

/** An invoice was created, archived, or its paid/due amounts moved. */
export const invalidateInvoices = (queryClient) =>
  invalidate(queryClient, [listKeys.invoices(false), listKeys.invoices(true)]);

/**
 * Sales step: generating an invoice creates the invoice AND moves the source
 * order to 'invoiced', so both feeds are stale.
 */
export const invalidateAfterInvoiceGenerated = (queryClient) => {
  invalidateInvoices(queryClient);
  invalidateOrders(queryClient);
};

/**
 * Payment recorded, voided or transferred — changes invoice paid/due totals.
 */
export const invalidateAfterPayment = (queryClient) => {
  invalidateInvoices(queryClient);
};

/**
 * Purchase marked complete. The Purchases list is not cached today, but the
 * pipeline sends the user straight back to Orders, so refresh that feed and
 * keep this the single place to extend when Purchases becomes cached too.
 */
export const invalidateAfterPurchaseCompleted = (queryClient) => {
  invalidateOrders(queryClient);
};
