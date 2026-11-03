# Brief for an AI agent: frozen customer-ledger wording, payment remarks, date filter, A4 statement

Implement the following in a Laravel + React app that keeps a customer ledger. Adapt names to the target codebase (model/table/column names below are from the original app, a Laravel API + Vite/React SPA).

## Goal (what the owner asked for)

1. Ledger rows must read like this on the statement:
   - Invoice row: `INV-2026-0058 - Color Code : WBR 201`, type shown as `invoice/Bill`.
   - Payment row: `Cash  INV-2026-0058 (PAY-2026-0041)`, plus the payment's remark on a second line `Note: ...`.
   - Payment method wording: `Cash`, `Bank - <bank name>`, `Mobile Banking - <provider>`.
2. **Editing a product (e.g. its product code) later must never change an already-posted ledger row.**
3. Customer page gets a From/To date filter.
4. The statement prints on **A4** (with the same date range), with balance brought forward.

## Key design decision: freeze the text at posting time

Do NOT compute the invoice/payment text when displaying (that was tried first and is wrong: it drifts when products change).
Build the text once, when the ledger row is created, and store it in the row's existing `description` column. Never recompute it afterwards.

Terminology: "Color Code" = the product's `product_code` (e.g. `WBR 201`). Use the distinct codes of the order's **selected** items (`is_selected = true`), comma-separated, in item order. If none, just the invoice number.

## Backend steps

1. On the ledger model add two static builders:
   - `invoiceText(Invoice $inv): string` -> `"{invoice_number} - Color Code : {codes}"` (omit the suffix if no codes). Codes come from `$inv->quotation->items()->where('is_selected', true)->with('product:id,product_code')`.
   - `paymentText(Payment $p): string` -> `trim($method . '  ' . $ref) . " ({$p->payment_number})"`, where `$ref` = the payment's invoice number, else its order/quotation number. Note the **two spaces** between method and reference.
2. Use them where rows are posted: invoice generate, invoice restore, normal payment ledger row, advance-payment ledger row. Leave void/adjustment/discount/opening-balance rows alone.
3. Payment remark (`payments.notes`) stays live and is not frozen: add `attachPaymentDetails($ledgers)` that does ONE query (`Payment::whereIn('id', $ids)->pluck('notes','id')`) and sets a `payment_note` attribute on payment-backed rows. Call it in the customer `show` endpoint and in any customer-ledger report endpoint. Rows can reference a payment via `reference_type` = the class name OR a legacy alias string (`'Payment'`); handle both.
4. Backfill existing rows with an artisan command `ledger:freeze-descriptions` (`--dry-run` supported):
   - Only touch rows whose description still starts with the OLD system wording (e.g. `Generated invoice `, `Restored invoice `, `Legacy invoice `, `Payment received for invoice `, `Advance payment received for order `, `Legacy payment for invoice `). This makes it **idempotent**: a second run, even after a product code changed, leaves converted rows untouched.
   - Use `withoutGlobalScopes()` (brand/tenant scopes), `chunkById`, `saveQuietly()`; never change debit/credit/balance/dates.
   - Skip (and count) rows whose source invoice/payment no longer exists.
   - The owner runs commands/migrations themselves; ALWAYS run `--dry-run` first and show them the output. No schema migration is needed.
5. Update any existing tests that assert the old description strings; add a test that (a) posts an invoice and a payment through the API and asserts the new strings, (b) edits the product code and asserts the stored description is unchanged, (c) runs the command in dry-run and for real, and a third time after a code change to prove idempotency.

## Frontend steps

1. Utility `buildStatement(ledgers, from, to)`:
   - Sort by date then id; compute **balance brought forward** = sum(debit - credit) of rows dated before `from`; keep rows within [from, to]; recompute a running balance from the brought-forward figure; return `{ rows, broughtForward (null when no from), totalDebit, totalCredit, closing }`. Compare dates as `YYYY-MM-DD` strings (slice(0,10)); the API may return ISO timestamps. Recomputing (instead of using the stored `balance`) is what keeps a filtered statement consistent when stored row order is not chronological.
   - `ledgerTypeLabel(type)`: `invoice` -> `invoice/Bill`, `opening_balance` -> `Opening Bal.`, `advance_payment` -> `advance`.
2. Customer detail screen: From/To date inputs (+ Clear), show "Balance brought forward" when From is set, render rows from `buildStatement`, show `description` and the `Note:` line from `payment_note`, add a "Print Statement" button that navigates to the print route with `from_date`/`to_date` query params. Memoise derived arrays (`useMemo`) to avoid the exhaustive-deps lint warning.
3. Standalone print page (outside the dashboard layout, same pattern as the app's other print pages): route like `/customers/:id/ledger-print`. Load the customer + ledger via the existing customer endpoint, run `buildStatement`, render: letterhead/brand header, customer block, table (Date, Type, Particulars, Debit, Credit, Balance), a "Balance brought forward" row, a totals row and closing balance. Style for A4 (the app uses `@page` A4 with ~8mm margins and `page-break-inside: avoid` on rows); hide the control bar with a `no-print` class; set `document.title` to a sensible PDF filename and re-apply it on the `beforeprint` event; offer Print and Download-PDF buttons using whatever the app already has.

## Verification checklist

- Backend: `php -l` on changed files; run the full affected test files with the project's test runner (SQLite in-memory in the original).
- Frontend: production build must succeed; run the linter on touched files.
- Manual: print preview on A4 with and without a date range; closing balance equals the customer's current due when no filter is set.

## Safety / process rules learned in this project

- Run `--dry-run` of the backfill and show real before/after samples; sanity-check odd data (e.g. products whose "code" field contains names; payments with no provider) and report them rather than silently "fixing" them.
- Back up the production database before the real backfill.
- Do not commit machine-generated files that the deploy process deliberately sources from git HEAD (PWA icons here).
- Never enter server passwords for the user; give them the deploy command and let them run it (SSH/SCP prompts for a password).
- Report honestly what was verified (tests, build) and what was not (e.g. no live browser check when the database was down).
