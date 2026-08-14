import api from './axios';
import { queryClient } from './queryClient';
import { customersQueryOptions } from '../hooks/useMasterData';

/**
 * AI Assist client — talks to the two endpoints in AI_Assist_PRD.md §8.
 *
 * The PRD names extracted fields by role (contact_number_1) while the customer
 * form uses this app's own column names (phone). The mapping lives here so the
 * modal never has to know both vocabularies.
 */

/**
 * PRD §4.3 layer 3 — the authoritative guard.
 *
 * applyDraft() writes only these keys into form state. `opening_balance` and
 * `customer_category` are absent by design: even if a future prompt change or
 * a model update returns them, they are dropped before touching the form.
 *
 * `notes` is absent too, for a different reason: Notes & Remarks only exists
 * on the Edit Customer form, once a customer has an ID — AI Assist only runs
 * on the New Customer form, so there is no field for it to write into.
 */
export const AI_WRITABLE_FIELDS = [
  'company_name',
  'contact_person_name',
  'contact_number_1',
  'contact_number_2',
  'contact_number_3',
  'email',
  'address_line_1',
  'address_line_2',
];

/** AI field name -> CustomerModal state key. */
export const FIELD_TO_FORM = {
  company_name: 'companyName',
  contact_person_name: 'name',
  contact_number_1: 'phone',
  contact_number_2: 'secondContactNumber',
  contact_number_3: 'thirdContactNumber',
  email: 'email',
  address_line_1: 'address',
  address_line_2: 'address2',
};

/** Human labels for the review screen (PRD §7.6). */
export const FIELD_LABELS = {
  company_name: 'Company Name',
  contact_person_name: 'Contact Person',
  contact_number_1: '1st Contact',
  contact_number_2: '2nd Contact',
  contact_number_3: '3rd Contact',
  email: 'Email',
  address_line_1: 'Address Line 1',
  address_line_2: 'Address Line 2',
};

/**
 * Strips anything outside the allow-list and returns { formKey: value } pairs
 * ready to be written into the form. Empty values are skipped so AI never
 * blanks a field the user already typed.
 */
export function toFormPatch(draft) {
  const patch = {};
  AI_WRITABLE_FIELDS.forEach((key) => {
    const value = draft?.[key];
    if (typeof value === 'string' && value.trim() !== '') {
      patch[FIELD_TO_FORM[key]] = value.trim();
    }
  });
  return patch;
}

/**
 * Every failure path must leave the form usable (PRD §8.3), so errors are
 * returned as a readable message rather than thrown as raw axios objects.
 */
function readError(err) {
  const status = err?.response?.status;
  const message = err?.response?.data?.message;
  if (message) return message;
  if (status === 401) return 'সেশন শেষ হয়ে গেছে। আবার লগইন করুন।';
  if (status === 413) return 'ফাইলটি অনেক বড়।';
  return 'AI সার্ভিস এখন কাজ করছে না।';
}

export async function parseCustomer({ image, text, mode }) {
  const body = new FormData();
  if (image) body.append('image', image);
  if (text) body.append('text', text);
  if (mode) body.append('mode', mode);

  try {
    const res = await api.post('/ai/parse-customer', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000, // model calls routinely take 10-30s on a card image
    });
    return { ok: true, data: res.data?.data || {}, logId: res.data?.log_id || null };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}

/**
 * Records that the user accepted a draft (PRD §9.4). Analytics only — every
 * failure is swallowed so it can never block the form.
 */
export async function markDraftApplied(logId) {
  if (!logId) return;
  try {
    await api.post('/ai/log-applied', { log_id: logId });
  } catch {
    /* ignore */
  }
}

/**
 * PRD §10 criterion 12 — a duplicate 1st contact number must be caught before
 * save. Returns the matching customer or null; a failed lookup returns null so
 * a network hiccup never blocks a legitimate save.
 *
 * `/customers` has no server-side search parameter and returns the whole list,
 * so the match is done here against the list React Query already holds. It is
 * scoped to the caller's own visible customers (no `all=1`): a salesman must
 * not be told about a record they cannot see.
 */
export async function findCustomerByPhone(phone) {
  const digits = (phone || '').replace(/[^\d]/g, '');
  if (digits.length < 6) return null;

  // Compare the last 10 digits so +8801… and 01… match the same record.
  const tail = digits.slice(-10);

  try {
    const rows = await queryClient.ensureQueryData(customersQueryOptions());
    if (!Array.isArray(rows)) return null;

    return rows.find((c) =>
      [c.phone, c.second_contact_number, c.third_contact_number].some(
        (p) => (p || '').replace(/[^\d]/g, '').endsWith(tail)
      )
    ) || null;
  } catch {
    return null;
  }
}

export async function transcribeAudio(audioBlob, filename = 'voice.webm') {
  const body = new FormData();
  body.append('audio', audioBlob, filename);

  try {
    const res = await api.post('/ai/transcribe', body, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    });
    return { ok: true, text: res.data?.text || '' };
  } catch (err) {
    return { ok: false, error: readError(err) };
  }
}
