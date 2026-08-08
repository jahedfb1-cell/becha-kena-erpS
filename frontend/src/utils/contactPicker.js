// Wrapper around the browser Contact Picker API (navigator.contacts.select).
// This lets users import a name/phone number directly from their mobile
// device's saved contacts instead of typing it manually.
//
// Support: Android Chrome/Edge (and other Chromium browsers) over HTTPS
// (or localhost) only. iOS Safari and desktop browsers do not support it,
// so callers must check `isContactPickerSupported()` before showing any
// "import from contacts" UI.

export const isContactPickerSupported = () =>
  typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

/**
 * Opens the native contact picker and resolves the first selected contact's
 * name and phone number. Returns null if the API is unsupported, the user
 * cancels the picker, or the selected contact has no phone number.
 */
export async function pickContact() {
  if (!isContactPickerSupported()) return null;

  try {
    const props = ['name', 'tel'];
    const opts = { multiple: false };
    const contacts = await navigator.contacts.select(props, opts);

    if (!contacts || contacts.length === 0) return null;

    const contact = contacts[0];
    const name = Array.isArray(contact.name) && contact.name.length > 0 ? contact.name[0] : '';
    const phone = Array.isArray(contact.tel) && contact.tel.length > 0 ? contact.tel[0] : '';

    if (!phone) return null;

    return { name, phone };
  } catch (err) {
    // User cancelled the picker, or permission was denied — not an error worth surfacing.
    console.warn('Contact picker cancelled or failed:', err);
    return null;
  }
}
