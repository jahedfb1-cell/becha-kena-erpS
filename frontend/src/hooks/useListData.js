import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';

/**
 * Shared hooks for the big list pages (invoices / orders).
 *
 * Customers deliberately are NOT here — the Customers list uses the same
 * role-scoped `/customers` endpoint as useCustomers() in useMasterData.js,
 * so that hook is reused instead of fetching the same data under a second key.
 */
export const listKeys = {
  // `archived` is part of the key (mirroring masterDataKeys.customers(all))
  // because it is a genuinely different result set fetched from the server
  // via `?archived=1`, not a client-side filter over one shared list.
  invoices: (archived = false) => ['list', 'invoices', archived ? 'archived' : 'all'],
  // Orders and Quotations both read `/quotations?all=1` and only differ in how
  // they filter it, so they share one cache entry and filter client-side.
  quotations: () => ['list', 'quotations', 'all'],
};

const unwrapList = (response) => {
  const payload = response?.data?.data?.data ?? response?.data?.data ?? [];
  return Array.isArray(payload) ? payload : [];
};

const withArrayData = (query) => ({
  ...query,
  data: query.data ?? [],
});

export const invoicesQueryOptions = ({ archived = false } = {}) => ({
  queryKey: listKeys.invoices(archived),
  queryFn: async () => unwrapList(await api.get(`/invoices?all=1${archived ? '&archived=1' : ''}`)),
});

export function useInvoicesList({ enabled = true, archived = false } = {}) {
  return withArrayData(useQuery({ ...invoicesQueryOptions({ archived }), enabled }));
}

/**
 * Confirmed orders = every quotation that has moved past the 'quotation'
 * stage. `select` filters the shared cache without duplicating the fetch.
 */
export function useOrdersList({ enabled = true } = {}) {
  return withArrayData(useQuery({
    queryKey: listKeys.quotations(),
    queryFn: async () => unwrapList(await api.get('/quotations?all=1')),
    select: (rows) => rows.filter((q) => q && q.status !== 'quotation'),
    enabled,
  }));
}
