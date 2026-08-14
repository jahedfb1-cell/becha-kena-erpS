import { useQuery } from '@tanstack/react-query';
import api from '../api/axios';

/**
 * Shared master-data hooks (customers / products / suppliers).
 *
 * These lists change rarely but are currently re-fetched by almost every
 * page and every form open. Routing them through React Query means they are
 * fetched once and then shared across the whole app until they go stale.
 *
 * Query keys are exported so that mutations elsewhere (e.g. after saving a
 * new customer or product) can invalidate them:
 *   queryClient.invalidateQueries({ queryKey: masterDataKeys.customers() })
 */
export const masterDataKeys = {
  customers: (all = false) => ['master', 'customers', { all: !!all }],
  products: () => ['master', 'products'],
  suppliers: () => ['master', 'suppliers'],
};

/**
 * The API wraps payloads as { success, message, data }. A few endpoints have
 * historically been called with an extra nesting level, so unwrap defensively
 * and always hand back an array — callers do `.map()` on this directly.
 */
const unwrapList = (response) => {
  const payload = response?.data?.data?.data ?? response?.data?.data ?? [];
  return Array.isArray(payload) ? payload : [];
};

/**
 * Guarantees `data` is always an array so callers can `.map()` without a
 * guard, while leaving isLoading/isFetching/error untouched.
 *
 * Deliberately NOT using React Query's `placeholderData: []` for this: that
 * flips the query straight to "success", so isLoading would always be false
 * and a page would render an empty list instead of its loading spinner.
 */
const withArrayData = (query) => ({
  ...query,
  data: query.data ?? [],
});

/**
 * Customers.
 *
 * IMPORTANT: `/customers` is role-scoped on the backend (a salesman only sees
 * customers they created) while `/customers?all=1` returns every customer.
 * They are genuinely different result sets, so `all` is part of the cache key
 * — otherwise a salesman's scoped list would leak into the quotation form and
 * vice versa.
 */
export const customersQueryOptions = ({ all = false } = {}) => ({
  queryKey: masterDataKeys.customers(all),
  queryFn: async () => unwrapList(await api.get(all ? '/customers?all=1' : '/customers')),
});

export function useCustomers({ all = false, enabled = true } = {}) {
  return withArrayData(useQuery({
    ...customersQueryOptions({ all }),
    enabled,
  }));
}

/**
 * Products. The Products page passes a longer timeout because this list is
 * the largest; keep that behaviour so slow connections don't abort early.
 */
/**
 * Shared options object so the same fetch can be used either as a hook or
 * imperatively via queryClient.ensureQueryData() — needed where code must
 * `await` the product list before it can map order items (e.g. edit forms).
 */
export const productsQueryOptions = () => ({
  queryKey: masterDataKeys.products(),
  queryFn: async () => unwrapList(await api.get('/products', { timeout: 20000 })),
});

export function useProducts({ enabled = true } = {}) {
  return withArrayData(useQuery({
    ...productsQueryOptions(),
    enabled,
  }));
}

export function useSuppliers({ enabled = true } = {}) {
  return withArrayData(useQuery({
    queryKey: masterDataKeys.suppliers(),
    queryFn: async () => unwrapList(await api.get('/suppliers')),
    enabled,
  }));
}
