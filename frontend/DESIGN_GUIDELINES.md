# 🎨 Frontend Design Guidelines — Becha Kena ERP / Dhaka Blinds IMS

> **Purpose**: This document is the single source of truth for all frontend design decisions in this project.
> Every new page, component, or feature must follow these guidelines.

---

## UX Guidelines

### 1. Clear Navigation
- Persistent **left sidebar** always visible: Dashboard, Orders/Quotations, Invoices, Payments, Purchases, Customers, Suppliers, Products, Reports, Vouchers/Expenses, Settings.
- **Breadcrumbs** on all nested pages (e.g. `Dashboard / Reports / Profit-Loss`).
- Global search (Ctrl+K) for quick lookup of Customers, Invoice numbers, Quotation numbers.
- Active menu item highlighted with a colored left border accent.

### 2. Fast Loading
- Target: **LCP < 2.5s**, **TTI < 3s**, JS bundle < 200KB.
- All large data tables: **server-side pagination** (not client-side filter of all records).
- Use **skeleton loaders** while data is loading — never show a blank page.
- API calls must use **loading state** → success state → error state pattern.
- Virtualized lists for 10,000+ row datasets.

### 3. Mobile Friendly
- Breakpoints: `sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`.
- All touch targets minimum **44px × 44px**.
- Tables on mobile: horizontally scrollable (no wrapping), or collapse to card-style view.
- Sidebar collapses to hamburger on mobile.

### 4. User Flow
- Every critical flow must complete in **≤ 3 primary steps**:
  - Quotation → Approve → Invoice → Payment
  - Purchase Entry → Supplier Payment
  - Add Customer → Create Order → Print Invoice
- Always show a **clear success state** after completing any flow (toast + visual confirmation).
- Destructive actions (Delete, Void, Archive) require a **confirm dialog** before execution.

---

## UI Guidelines

### 5. Color Palette

**Primary Brand Colors:**
- Primary Blue     `#007bff`   — primary actions, links, active states
- Dark Navy        `#1a1f2e`   — sidebar background
- Sidebar Text     `#8892b0`   — inactive menu items

**Semantic Colors:**
- Success Green    `#28a745`   — paid, active, completed
- Warning Amber    `#ffc107`   — pending, low stock, draft
- Danger Red       `#dc3545`   — overdue, void, delete, loss
- Info Teal        `#17a2b8`   — informational, neutral actions
- Electric Blue    `#007bff`   — primary CTA buttons

**Report Card Colors (Match Sample Image):**
- Card Teal        `#17a2b8`   — Sales, Customer, Stock, Expense, Purchase Due Pay
- Card Green       `#28a745`   — Purchase, Customer Ledger, Voucher, Sales Due, Mobile Book, Convenience
- Card Amber       `#ffc107`   — Profit/Loss, Supplier, Daily, Sale Due Pay → **use dark text #212529**
- Card Red         `#dc3545`   — Profit Invoice-wise companion, Supplier Ledger, Order, Cash Book
- Card Blue        `#007bff`   — P&L Invoice Wise, Bank Book

**Neutral Backgrounds:**
- Page Background  `#f4f6f9`   — light grey content area
- Card Background  `#ffffff`   — white cards
- Border           `#dee2e6`   — table borders, dividers
- Muted Text       `#6c757d`
- Body Text        `#333333`
- Heading Text     `#212529`

**Contrast Rule**: All text must meet WCAG AA (4.5:1 body, 3:1 large text). White text on Amber (`#ffc107`) FAILS — use `#212529` dark text instead.

---

### 6. Typography

**Font**: `'Outfit'` (primary) — clean, modern, highly legible. Fallback: `system-ui, sans-serif`.

**Type Scale:**
- h1   `2rem / 32px`     — Page title
- h2   `1.5rem / 24px`   — Section heading
- h3   `1.25rem / 20px`  — Card heading
- h4   `1.125rem / 18px` — Sub-section
- Body `1rem / 16px`     — Standard text
- sm   `0.875rem / 14px` — Labels, descriptions
- xs   `0.75rem / 12px`  — Meta info, badges

**Numbers in Tables**: Use `font-variant-numeric: tabular-nums` for all price, quantity, and total columns so decimal points and digits align perfectly in tables and invoices.

---

### 7. Consistent Buttons

**Button Variants:**
- `.primary-btn`  — Blue `#007bff`, white text (primary CTA)
- `.logout-btn`   — Light grey, dark text (secondary/cancel)
- `.success-btn`  — Green `#28a745`
- `.danger-btn`   — Red `#dc3545` (destructive — always needs confirm dialog)
- `.ghost-btn`    — Transparent bg, colored border + text (tertiary)

**All buttons must have 6 states**: default, hover, active, focus-visible, disabled, loading.

**Rules:**
- Destructive actions (Delete, Void, Archive) → confirm modal before executing.
- Loading state → disable button + show spinner to prevent double-submit.

---

### 8. Spacing

**Spacing Scale (4px base):**
- `4px`  — Tight inner padding (badges)
- `8px`  — Button padding, small gaps
- `12px` — Standard form field spacing
- `16px` — Card padding
- `20px` — Section gap
- `24px` — Large section spacing
- `32px` — Page-level spacing
- `40px` — Major section breaks

**Data Table Row Padding**: `10px 14px` (tighter than marketing pages).
**Card Padding**: `20px 24px`.
**Grid Gap**: `16px` standard, `12px` compact.

---

## Critical Missing Areas

### 9. Accessibility (a11y)
- All icon-only buttons must have `aria-label`.
- All interactive elements must have visible **focus rings** (never `outline: none`).
- Tables must use `<th scope="col">` headers for screen readers.
- Color must not be the only status indicator — pair with icon or text label.
- All form fields must have explicit `<label>` associations.

### 10. Design System & Component Library

| Component | Notes |
|-----------|-------|
| `Button` | All variants + states |
| `Input` / `Select` | Consistent height 36px, border-radius 6px |
| `DataTable` | Sort, paginate, empty state, skeleton |
| `Modal` | Confirm dialogs, form modals — trapFocus |
| `Toast` | Success/Error/Info — auto-dismiss 4s |
| `Badge` | Status chips: paid/pending/draft/overdue/archived |
| `Spinner` | Inline loader for buttons and pages |
| `Skeleton` | Placeholder loading rows |

### 11. Data Tables — Heart of IMS
Every data table must include:
- Column sorting (click header → ASC/DESC)
- Filter bar (search + date range + status dropdown)
- Pagination with page size selector (25, 50, 100)
- Loading skeleton rows while fetching
- Empty state with friendly message + CTA
- CSV/Excel Export button
- Status Badge column with color-coded chips

### 12. Forms & Validation
- Inline field-level validation — show error below field, not in modal.
- Error message: specific (e.g. "Phone number must be 11 digits"), not generic ("Invalid input").
- Long forms (Quotation/Order): warn before navigating away with unsaved changes.
- Line item tables: Tab moves to next field, Enter adds new line.
- Prevent double-submit: disable button during API call.

### 13. Feedback & Empty States
- **Toast notifications**: success (green), error (red), info (blue) — top-right, auto-dismiss 4s.
- **Loading**: skeleton loaders — never blank pages.
- **Empty state**: every list/table must show a meaningful message with CTA.
  - Example: _"No invoices found. Create your first invoice →"_
- **Success state**: toast + optional redirect after completing a form.

### 14. Error Handling
- Never display raw server errors (e.g. `SQLSTATE[23000]...`) to users.
- Friendly error copy: _"Something went wrong. Please try again."_
- `404 Page`: Branded, link back to Dashboard.
- `403 Page`: _"You don't have permission to view this page."_
- `500 Page`: _"We're experiencing issues. Our team has been notified."_
- API failures: show retry button inline — not just a toast.
- Offline detection: offline banner with auto-retry on reconnect.

### 15. Localization & Currency
- Primary: **Bangla (বাংলা)** UI labels + English data values.
- Date format: **DD/MM/YYYY** (Bangladesh standard).
- Currency: **৳** (BDT) — `৳ 1,20,000.00` Indian-style formatting.
- `formatCurrency(value)` utility must be used **everywhere** — never raw numbers in currency columns.

### 16. Print & PDF Layouts
- Every invoice must be **printable via browser print** (Ctrl+P) with a clean print stylesheet.
- PDF export via `barryvdh/laravel-dompdf` (already installed).
- Print CSS: hide sidebar, header, action buttons — show only document content.
- Support **A4** format (standard invoices and challans).
- Delivery challans, quotations, and purchase summaries must also be printable.

### 17. Roles & Permissions UX

| UI Element | Admin | Manager | Salesman | Accountant |
|-----------|-------|---------|----------|------------|
| Sidebar menu | All | All | Orders, Customers | Invoices, Reports, Payments |
| Delete buttons | Show | Show + confirm | Hidden | Hidden |
| Price fields | Editable | Editable | Read-only | Editable |
| Reports section | All | All | Own sales only | All financial |

- Hidden: `display: none` (not just disabled opacity).
- Disabled with tooltip: for visible-but-restricted actions.

### 18. Security UX
- Session timeout warning: 5 minutes before expiry → modal with "Stay logged in / Logout".
- Password change: Current → New → Confirm + strength indicator.
- Audit log viewable by admin.
- "Danger zone" in Settings: red border, requires typed confirmation.

### 19. Analytics & Dashboard UI
Daily opening KPIs:
```
Today's Sales (৳) | Pending Payments (৳) | Outstanding Dues (৳) | Overdue Invoices (#)
```
- Charts: line (monthly revenue), bar (top products), pie (payment methods).
- Date range filter on all charts.
- Pre-aggregate heavy queries or cache them for fast load.

### 20. Notifications
- Bell icon in header with unread count badge.
- Types: Invoice paid, Payment overdue, Supplier payment due, New order.
- Notification panel: mark as read, clear all, link to relevant record.
- User preference page: choose which notifications to receive.

### 21. Design Tokens (CSS Variables)

```css
:root {
  --primary:       #007bff;
  --success:       #28a745;
  --warning:       #ffc107;
  --danger:        #dc3545;
  --info:          #17a2b8;
  --bg-page:       #f4f6f9;
  --bg-card:       #ffffff;
  --text-body:     #333333;
  --text-muted:    #6c757d;
  --border:        #dee2e6;
  --radius-sm:     4px;
  --radius-md:     8px;
  --radius-lg:     12px;
  --shadow-sm:     0 1px 3px rgba(0,0,0,.12);
  --shadow-md:     0 4px 12px rgba(0,0,0,.15);
  --spacing-xs:    4px;
  --spacing-sm:    8px;
  --spacing-md:    16px;
  --spacing-lg:    24px;
  --spacing-xl:    32px;
}
```

Enables white-labeling and future dark mode support.

### 22. Content & Microcopy Guidelines

**Button verbs — action-specific:**
- ✅ "Save Invoice", "Approve Order", "Record Payment", "Generate PDF"
- ❌ "Submit", "OK", "Confirm", "Click Here"

**Tone guidelines:**
- Error: Helpful, non-blaming. _"Couldn't save the invoice — check required fields below."_
- Success: Specific. _"Invoice INV-2026-0012 saved and sent to customer."_
- Empty state: Encouraging. _"No suppliers yet. Add your first supplier to start placing purchase orders."_
- Destructive confirm: Clear consequence. _"Delete Invoice INV-0012? This action cannot be undone."_

---

## ✅ Pre-Shipping Checklist

Before shipping any new page or component, verify:

- [ ] Matches color palette tokens (CSS variables used)
- [ ] Responsive on mobile (test at 375px)
- [ ] Loading, empty, and error states all implemented
- [ ] Accessible labels and visible focus rings
- [ ] `formatCurrency()` used on all money values
- [ ] Destructive actions have confirm dialogs
- [ ] Toast notification on success/failure
- [ ] Matches sidebar navigation structure
- [ ] Print layout works (if applicable)
- [ ] Role-based visibility applied
