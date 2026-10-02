/**
 * Opens one of the app's standalone print routes in a new tab.
 *
 * A plain <a target="_blank"> is not reliable enough for this: a popup
 * blocker, a privacy extension, or the app running as an installed PWA
 * (the manifest declares display: standalone) can all swallow the new tab
 * silently — the user clicks "Print Slip", nothing happens, and the feature
 * looks broken even though the page behind it renders perfectly.
 *
 * So the new tab is opened explicitly, and when the browser refuses, the
 * same tab navigates there instead. Every print route in this app carries
 * its own "Back" button, so landing there in place is a workable fallback
 * rather than a dead end.
 *
 * IMPORTANT: `noopener` must NOT go in the windowFeatures string. Per the
 * HTML spec, window.open() returns null whenever `noopener` is requested
 * there — that is the whole point of the flag, since a null return is what
 * guarantees the opener holds no reference to the new window. The earlier
 * version passed 'noopener' as the third argument and then treated the null
 * return as "the popup was blocked", so the fallback fired every single
 * time: the new tab opened AND the tab the user was on navigated away from
 * the orders list. The opener reference is severed below instead, which
 * gives the same isolation while leaving the return value meaningful, so a
 * genuinely blocked popup can still be told apart from a successful one.
 *
 * @param {string} url      the print route, e.g. /courier-bookings/print/12
 * @param {Function} [navigateFallback]  react-router navigate(), used for the
 *   same-tab fallback so it stays a client-side transition; a full page load
 *   is used when it isn't supplied.
 */
export default function openPrintPage(url, navigateFallback) {
  if (!url) return;

  let opened = null;
  try {
    opened = window.open(url, '_blank');
  } catch (err) {
    // Some embedded webviews throw rather than returning null.
    opened = null;
  }

  if (opened) {
    // Same protection 'noopener' would have given, minus the null return.
    try {
      opened.opener = null;
    } catch (err) {
      // Cross-origin or a locked-down webview — the navigation still happened,
      // which is what matters here.
    }
    return;
  }

  if (typeof navigateFallback === 'function') {
    navigateFallback(url);
  } else {
    window.location.assign(url);
  }
}
