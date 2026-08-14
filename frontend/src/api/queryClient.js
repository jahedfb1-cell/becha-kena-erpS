import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client for the whole app.
 *
 * Exported as a module singleton (not created inside a component) so that
 * non-component code — e.g. after recording a payment or completing a
 * purchase — can call queryClient.invalidateQueries(...) to refresh lists.
 *
 * Defaults are deliberately conservative: no page uses React Query yet, and
 * these settings are chosen so that when pages are migrated one by one they
 * behave like the current manual `useState + api.get()` code rather than
 * suddenly refetching on their own.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Master data (customers/products/suppliers) changes rarely. Treating
      // it as fresh for 5 minutes is what removes the repeated re-fetch on
      // every page/form open.
      staleTime: 5 * 60 * 1000,
      // Keep unused data around a while so navigating back is instant.
      gcTime: 30 * 60 * 1000,
      // The app currently never refetches on tab focus; keep it that way so
      // migrating a page doesn't silently change its behaviour.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Retrying a 401/403/404 is pointless and just delays the error state.
      // Only genuine network/5xx failures are worth a second attempt.
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
