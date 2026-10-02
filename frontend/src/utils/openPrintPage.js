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
 * @param {string} url      the print route, e.g. /courier-bookings/print/12
 * @param {Function} [navigateFallback]  react-router navigate(), used for the
 *   same-tab fallback so it stays a client-side transition; a full page load
 *   is used when it isn't supplied.
 */
export default function openPrintPage(url, navigateFallback) {
  if (!url) return;

  let opened = null;
  try {
    opened = window.open(url, '_blank', 'noopener');
  } catch (err) {
    // Some embedded webviews throw rather than returning null.
    opened = null;
  }

  if (opened) return;

  if (typeof navigateFallback === 'function') {
    navigateFallback(url);
  } else {
    window.location.assign(url);
  }
}
