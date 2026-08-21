# Dhaka Blinds IMS (becha-kena-erp)
## Database Architecture, Seeder & Reusable-Template Deep-Dive

**Companion document to:** `PROJECT_OVERVIEW_PRD.md` (page-by-page feature inventory)
**Purpose:** Document the backend's database schema, model relationships, RBAC seeding, and multi-brand pattern in enough depth that an AI coding agent — given only this file, no source access — could recreate an equivalent architecture for a **new, different** business-management project.
**Audit date:** 2026-08-20
**Source scanned:** `database/migrations/` (61 files), `app/Models/` (~32 models), `database/seeders/`, `config/sanctum.php`, `config/auth.php`, `app/Traits/`, `frontend/src/api/axios.js`

---

## 0. How to Use This Document / এই ডকুমেন্ট কীভাবে ব্যবহার করবেন

**EN —** Section H (`Reusable Architecture Patterns`) is the most important part for template reuse — it lists the domain-agnostic design decisions (not specific to blinds/trading) that made this codebase maintainable: status-driven lifecycles instead of duplicate tables, archive-not-delete, polymorphic ledgers, running balances, brand-tagging via one trait, etc. Read Sections A–G for the concrete schema this project uses; read Section H to know **which parts to copy into a different business domain**.

**BN —** টেমপ্লেট হিসেবে পুনরায় ব্যবহারের জন্য সবচেয়ে গুরুত্বপূর্ণ অংশ হলো Section H (`Reusable Architecture Patterns`) — এখানে ডোমেইন-নিরপেক্ষ (শুধু ব্লাইন্ড ব্যবসার জন্য না) ডিজাইন সিদ্ধান্তগুলো তালিকাভুক্ত করা আছে যা এই কোডবেসকে মেইনটেইনেবল করেছে। Section A–G পড়ুন এই প্রজেক্টের নির্দিষ্ট স্কিমা বোঝার জন্য; Section H পড়ুন বুঝতে **কোন অংশগুলো ভিন্ন বিজনেস ডোমেইনে কপি করা উচিত**।

---

## 1. Stack & Migration Convention

| Layer | Choice |
|---|---|
| Backend | Laravel, MySQL/MariaDB in production, SQLite for tests |
| RBAC | Spatie `laravel-permission` |
| Auth | Laravel Sanctum, **token-based** (Bearer header), not SPA-cookie |
| Frontend↔API | React, Bearer token stored in `localStorage`, attached via axios request interceptor |

**Migration convention (copy this):** one file per logical change, timestamp-prefixed, executed in filename order. Two distinct eras are visible in this codebase and both are worth replicating:

1. **Baseline era** — one-migration-per-table, covering the full initial schema (here: 35 files with sequential fake timestamps just to control ordering, not real dates).
2. **Post-launch era** — every later feature ships as its own small, additive migration (add column / add table / add index), **never editing old migration files**. Each is defensively wrapped:
   ```php
   if (!Schema::hasColumn('table', 'column')) { ... }
   if (!Schema::hasTable('table')) { ... }
   ```
   so it's safe to re-run against a partially-migrated production database. Enum value additions on MySQL use raw SQL instead of Laravel's `change()`:
   ```php
   if (DB::getDriverName() !== 'sqlite') {
       DB::statement("ALTER TABLE quotations MODIFY COLUMN status ENUM('quotation','pending_approval','approved','rejected','pending_reapproval','invoiced') NOT NULL DEFAULT 'quotation'");
   }
   ```
   because Doctrine DBAL's enum-`change()` path drops and recreates the column, risking data loss.

**Template rule:** start every new project with a clean one-table-per-migration baseline; from day one of production, treat every schema change as a new additive file, guarded, never a hand-edit of history.

---

## 2. Table Inventory by Domain Group

### 2.1 Users / Roles / Access
| Table | Key columns | FKs | Notes |
|---|---|---|---|
| `users` | name, email(nullable,unique), password, `role` enum(`salesman`,`manager`,`admin`,`staff` default `staff`), manager_id, department_id, brand_id, phone(20,required), is_active, +archive cols | manager_id→users(null), department_id→departments(null), brand_id→brands(null) | self-referential manager_id for team hierarchy |
| `sessions`, `password_reset_tokens`, `personal_access_tokens` | standard Laravel/Sanctum tables | — | |
| `permissions`, `roles`, `model_has_permissions`, `model_has_roles`, `role_has_permissions` | standard Spatie tables | — | every row carries `guard_name` |
| `departments` | name, description, is_active | — | seeded: Sales, Office Manager, Factory Manager |
| `brands` | name(150), short_name(50), is_default, is_active | — | see §6 Multi-Brand Pattern |

### 2.2 Master Data
| Table | Key columns | FKs |
|---|---|---|
| `customer_categories` | name, description, +created_by/archive | created_by→users(restrict) |
| `customers` | customer_code(unique "CUS-0001"), name, company_name, bin(nullable), phone, 2nd/3rd contact, email, address(+address_2), notes, contact_show_status, opening_balance, customer_category_id, +created_by/archive | category→customer_categories(restrict) |
| `suppliers` | supplier_code(unique "SUP-0001"), name, company_name, phone, email, address, opening_balance, +created_by/archive | created_by→users(restrict) |
| `product_categories` | name, description, +created_by(nullable)/archive | — |
| `products` | product_code(unique, manual e.g. "BL-001"), name, unit(default sqft), product_category_id, default_unit_price, product_size(nullable), details, +created_by/archive | category→product_categories(null) |
| `product_variants` | product_id, variant_name, +created_by/archive | product_id→products(cascade) |
| `product_supplier_links` | product_id, supplier_id, **priority_rank**(tinyint, 1=Preferred/2=Secondary/3=Tertiary), cost_price, min_billing_sqft, +created_by/archive | UNIQUE(product_id,supplier_id); UNIQUE(product_id,priority_rank) |
| `units`, `bank_accounts`, `mobile_accounts`, `balance_transfers`, `expense_categories` | config-style small master tables | — |

### 2.3 Sales Chain — PriceList → Quotation/Order → Invoice → Challan → Payment → Mushak(VAT)
| Table | Key columns | FKs | Notes |
|---|---|---|---|
| `price_lists` | reference_no(unique "PL-2026-0001"), brand_id, customer_id(nullable), **snapshot fields** (customer_name/company/phone/address), issue_date, subject, validity, terms, +created_by/archive | customer_id→customers(null) | never converts to an order |
| `price_list_items` | price_list_id, product_id(nullable), serial_no, product_name, description, color_code, uom, rate, remarks | price_list_id→price_lists(cascade) | |
| **`quotations`** | quotation_number(unique "QT-2025-0001"), customer_id, salesman_id, **`status` enum**(`quotation`,`pending_approval`,`approved`,`rejected`,`pending_reapproval`,`invoiced`), subtotal, convenience_charge, other_charge(+label), vat_percentage/amount/enabled/rate/inclusive, discount_type(`percentage`/`flat`)+value+amount, net_amount, delivery_address, rejection_reason, approved_by/approved_at, brand_id, +created_by/archive | customer_id→customers(restrict), salesman_id→users(null), approved_by→users(null) | **THIS ONE TABLE IS BOTH "QUOTATION" AND "ORDER"** — see §7.1 |
| `quotation_items` | quotation_id, section_name, option_group_id, is_optional, is_selected, is_enabled_for_print, product_id, product_variant_id, supplier_id, width, height, pcs, slats, approx_slats, actual_sqft, min_billing_sqft, billed_sqft, unit_price, cost_price, line_total, **is_supplier_overridden**, notes | quotation_id→quotations(cascade), product_id→products(restrict) | supports optional "choice groups" (alternative product options under one section) |
| `purchase_entries` | purchase_number("PO-2025-0001"), quotation_id, quotation_item_id(nullable — released on reverse), supplier_id, product_id, width, height, pcs, billed_sqft, cost_price, total_cost, purchase_date, `status` enum(`pending`,`ordered`,`received`,`cancelled`), is_reversed, received_at/by, brand_id, +created_by/archive | quotation_id→quotations(restrict) | one row per quotation_item, auto-created on order approval |
| `invoices` | invoice_number(unique "INV-2025-0001"), po_number(nullable), quotation_id, customer_id, salesman_id, subtotal, discount_amount, vat_amount, grand_total, paid_amount, due_amount, `payment_status` enum(`unpaid`,`partial`,`paid`), invoice_date, brand_id, +created_by/archive | quotation_id→quotations(restrict) | |
| `delivery_challans` | challan_number(unique "DC-2025-0001"), invoice_id, customer_id, delivery_address, driver_name/phone, delivery_date, `status` enum(`pending`,`delivered`,`cancelled`), notes, brand_id, +created_by/archive | invoice_id→invoices(restrict) | |
| `payments` | payment_number(unique "PAY-2025-0001"), invoice_id, customer_id, amount, `payment_method` enum(`cash`,`bank`,`mobile`), bank_name, mobile_provider, transaction_id, cheque_number, payment_date, notes, brand_id, +created_by/archive | invoice_id→invoices(restrict) | |
| `mushak_invoices` | challan_number(unique "MUSHAK-2026-0001"), sales_invoice_id, brand_id, issue_date/time, seller_name/bin/address(**snapshot**), buyer_name/address/bin(**snapshot**,nullable), vat_rate/inclusive, taxable_amount, sd_amount, vat_amount, grand_total, issued_by_name/designation, +created_by/archive | sales_invoice_id→invoices(restrict) | Bangladesh-specific VAT challan; snapshot pattern (§7.5) |
| `mushak_invoice_items` | mushak_invoice_id, serial_no, description, unit, quantity, unit_price, total_value, sd_rate/amount, vat_rate/amount, total_including_tax | mushak_invoice_id→mushak_invoices(cascade) | |

### 2.4 Ledgers / Books — running-balance, polymorphic-reference pattern
| Table | Key columns | Polymorphic ref types |
|---|---|---|
| `customer_ledgers` | customer_id, salesman_id, `transaction_type` enum(`invoice`,`payment`,`discount`,`adjustment`,`opening_balance`), reference_type/reference_id, description, debit, credit, **balance**(running), transaction_date, brand_id, +created_by/archive | Invoice / Payment / Voucher |
| `supplier_ledgers` | supplier_id, `transaction_type` enum(`purchase`,`payment`,`adjustment`,`opening_balance`), reference_type/reference_id, description, debit, credit, **balance**(running payable), transaction_date, brand_id, +created_by/archive | PurchaseOrder / Voucher / Adjustment |
| `cash_book_entries` | `entry_type` enum(`in`,`out`), reference_type/reference_id, description, amount, **balance**(running), entry_date, brand_id, +created_by/archive | Payment / Expense / Voucher |
| `bank_book_entries` | bank_name, account_number(nullable), entry_type, reference_type/reference_id, description, cheque_number, amount, **balance**(running per-account), entry_date, brand_id, +created_by/archive | Payment / Voucher / Transfer |
| `mobile_book_entries` | `provider` enum(`bkash`,`nagad`,`rocket`), account_number, entry_type, reference_type/reference_id, description, transaction_id, amount, **balance**(running per-wallet), entry_date, brand_id, +created_by/archive | Payment / Voucher / Expense |

### 2.5 Vouchers / Expenses
| Table | Key columns | Notes |
|---|---|---|
| `vouchers` | voucher_number(unique "VCH-2025-0001"), `voucher_type` enum(`debit`,`credit`,`journal`), date, description, total_amount, `payment_method` enum(`cash`,`bank`,`mobile`,nullable for journal), bank_name, mobile_provider, reference_number, note, brand_id, +created_by/archive | general ledger adjustments, not just expenses |
| `voucher_items` | voucher_id, account_head, reference_type/reference_id(nullable, polymorphic — Supplier/Customer/NULL), debit, credit, description | **no archive columns** — cascades logically with parent voucher |
| `expenses` | expense_number(unique "EXP-2025-0001"), expense_category_id, amount, `payment_method` enum, bank_name, mobile_provider, reference_number, description, expense_date, brand_id, +created_by/archive | |

### 2.6 Complaints
| Table | Key columns | Notes |
|---|---|---|
| `complaint_tickets` | ticket_number(unique "TKT-2025-0001"), invoice_id(**no FK constraint** — forward reference), quotation_item_id(same), customer_id, salesman_id, `issue_type` enum(`cutting_mistake`,`defect`,`wrong_size`,`wrong_color`,`others`), description, `status` enum(`open`,`in_review`,`resolved`,`rejected`), `resolution_type` enum(`replacement`,`refund`,`repair`,`no_action`,nullable), resolution_note, replacement_quotation_id(no FK), resolved_at/by, +created_by/archive | intentionally unenforced FKs — see §7.11 forward-reference pattern |

### 2.7 Audit / Notifications
| Table | Key columns | Notes |
|---|---|---|
| `audit_logs` | user_id(nullOnDelete), **user_name(snapshot string)**, `action_type` enum(`create`,`update`,`delete`,`archive`,`restore`,`approve`,`reject`,`login`,`logout`,`generate`,`void`,`convert`), module, reference_number/id, **old_value(json)**, **new_value(json)**, description, ip_address, user_agent | **immutable** — no archive columns, no update/delete path anywhere in the app |
| `notifications` | user_id, title, message, `type` enum(`quotation`,`order`,`invoice`,`payment`,`complaint`,`system`), reference_type/reference_id, is_read, read_at | |
| `notification_settings` | user_id(**unique** — one row per user), email_enabled(default true), sms_enabled(default false), **events(json — per-event {email,sms} toggle map)** | |
| `ai_assist_logs` | user_id, mode(default 'text' — card/text/voice), confidence(nullable), applied(bool) | deliberately stores **no PII/content**, only usage metrics |

### 2.8 Company / Brand
`brands` table as above. **Per-brand company profile (logo, address, terms, footer) is NOT a DB table** — it's a JSON file on disk: `storage/app/company_profile.json` for the default brand, `company_profile_{id}.json` for others (see `Brand::profilePath()`). A pragmatic choice for a rarely-changing, file-upload-heavy config blob.

**`brand_id` is applied to:** users, quotations, invoices, delivery_challans, payments, vouchers, expenses, customer_ledgers, supplier_ledgers, cash_book_entries, bank_book_entries, mobile_book_entries, purchase_entries, mushak_invoices, price_lists.
**Deliberately NOT applied to:** customers, products, suppliers, and their sub-entities — shared master data across brands.

---

## 3. The Universal Archive / Soft-Delete Pattern

**Not Laravel's native `SoftDeletes` trait.** A custom 4-column set, identical everywhere, driven by a shared `App\Traits\Archivable` trait:

```php
// Migration — add to every archivable table:
$table->boolean('is_archived')->default(false);
$table->timestamp('archived_at')->nullable();
$table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
$table->text('archive_reason')->nullable();
```

```php
// app/Traits/Archivable.php — apply to the Eloquent model:
trait Archivable {
    public function scopeActive($q)   { return $q->where('is_archived', false); }
    public function scopeArchived($q) { return $q->where('is_archived', true); }
    public function archive(int $userId, ?string $reason = null) {
        $this->update([
            'is_archived' => true,
            'archived_at' => now(),
            'archived_by' => $userId,
            'archive_reason' => $reason,
        ]);
    }
    public function restore(?int $userId = null) {
        $this->update([
            'is_archived' => false,
            'archived_at' => null,
            'archived_by' => null,
            'archive_reason' => null,
        ]);
    }
}
```

Rows are **never** physically deleted — referential integrity stays intact, audit trail is preserved, and "Restore" is a real, trivial operation for any admin.

**Has the pattern:** users, customer_categories, customers, suppliers, products, product_variants, product_supplier_links, product_categories, expense_categories, customer_ledgers, supplier_ledgers, cash_book_entries, bank_book_entries, mobile_book_entries, vouchers, expenses, complaint_tickets, quotations, purchase_entries, invoices, delivery_challans, payments, mushak_invoices, price_lists.

**Does NOT have it (by design):** `voucher_items`/`quotation_items`/`mushak_invoice_items`/`price_list_items` (child line items with no independent lifecycle — they live and die with their parent), `audit_logs` (immutable), `notifications`/`notification_settings`/`ai_assist_logs` (ephemeral/system), `departments`/`brands`/`units`/`bank_accounts`/`mobile_accounts`/`balance_transfers` (small config tables), pivot/system tables.

**Cascade rule used app-wide:** archiving only ever cascades **downstream** (archiving an Order also archives its Purchase Entries), never upstream (archiving a child unlocks/reverts the parent's status but never archives the parent itself). E.g. archiving an Invoice rolls its source Quotation's `status` back out of `invoiced` rather than archiving the Quotation.

---

## 4. Full Eloquent Relationship Map (condensed)

- **User** — belongsTo Department, Brand, User(manager); hasMany User(salesmen via manager_id), Customer(createdCustomers), Notification; hasOne NotificationSetting. Traits: `HasApiTokens, HasRoles, Archivable`.
- **Brand** — hasMany User. Static `resolveIdFor(User)`, `profilePath()`/`profileData()`.
- **Customer** — belongsTo CustomerCategory, User(creator); hasMany CustomerLedger, ComplaintTicket. Custom `getCurrentDue()` (reads last ledger row's balance), `openingBalanceLedger()`.
- **Supplier** — belongsTo User(creator); hasMany ProductSupplierLink, SupplierLedger.
- **Product** — belongsTo ProductCategory, User(creator); hasMany ProductVariant, ProductSupplierLink. Appends computed `supplier_links` (only if relation preloaded).
- **ProductSupplierLink** — belongsTo Product, Supplier, User(creator).
- **Quotation** — belongsTo Customer, User(salesman/creator/approver); hasMany QuotationItem, PurchaseEntry. Helpers: `isEditable()`, `isPendingApproval()`, `getTotalAttribute()`.
- **QuotationItem** — belongsTo Quotation, Product, ProductVariant, Supplier.
- **PurchaseEntry** — belongsTo Quotation, QuotationItem, Supplier, Product, ProductVariant, User(creator).
- **Invoice** — belongsTo Quotation, Customer, User(salesman/creator); hasMany Payment, DeliveryChallan, ComplaintTicket, MushakInvoice(all incl. archived); hasOne MushakInvoice(activeMushakInvoice, where is_archived=false).
- **DeliveryChallan / Payment** — belongsTo Invoice, Customer, User(creator).
- **MushakInvoice** — belongsTo Invoice(salesInvoice), User(creator); hasMany MushakInvoiceItem (ordered by serial_no).
- **PriceList** — belongsTo Customer, User(creator); hasMany PriceListItem (ordered by serial_no).
- **CustomerLedger / SupplierLedger / CashBookEntry / BankBookEntry / MobileBookEntry** — belongsTo their owner entity + User(creator); **morphTo `reference`** (polymorphic source document).
- **Voucher** — hasMany VoucherItem. **VoucherItem** — belongsTo Voucher; morphTo `reference` (Supplier/Customer/NULL).
- **Expense** — belongsTo ExpenseCategory, User(creator).
- **ComplaintTicket** — belongsTo Customer, User(salesman/resolver/creator), Invoice, QuotationItem, Quotation(replacementQuotation).
- **AuditLog** — belongsTo User. Static `AuditLog::record(...)` one-line logging helper.
- **Notification** — belongsTo User; morphTo `reference`. **NotificationSetting** — belongsTo User (1:1, unique FK).

Every ledger/book/transactional model additionally uses `BelongsToBrand` (auto-tag + global scope, see §6). Every archivable model uses `Archivable`.

---

## 5. RBAC Seeder — Exact Roles & Permissions

**Naming convention:** `module:action`, e.g. `customers:view-own`, `quotations:edit-team`, `price_lists:view-all`, `settings:bank_account`. **Guard is always `web`**, even though the API's actual auth guard is `sanctum` — Spatie roles/permissions are created explicitly under `web`, and the codebase carries an explicit warning comment: always resolve `Permission`/`Role` as **model instances** before granting, never bare strings, or Spatie silently targets the wrong guard.

**68 total permissions**, grouped: customers(5), users(4), quotations(7), orders(4), price_lists(4), purchase_entries(2), invoices/challans(5), mushak(2), payments(3), vouchers(3), expenses(2), salary(3), suppliers(3), products(4), complaints(2), reports(4), audit_logs(2), access_setup(2), settings(11).

**4 roles:**

| Role | Grants |
|---|---|
| **admin** | `syncPermissions(Permission::all())` — everything, re-synced whenever new permissions are added |
| **manager** | customers:create/view-team; quotations:create/edit-team/convert/approve/reject; orders:view-team; price_lists:create/view-team/archive; payments:create; complaints:create; reports:view-sales/view-purchase/view-ledger; challans:view/generate; vouchers:view/create; expenses:view/create |
| **salesman** | customers:create/view-own; quotations:create/edit-own/convert; orders:view-own; price_lists:create/archive; complaints:create; payments:create — **no report permissions** |
| **staff** | products:create/edit; challans:view/generate; vouchers:view/create; expenses:view/create; complaints:create |

**Production-safety caveat (important pattern, see §7.14):** the seeder's `syncPermissions()` call is safe only for a fresh install — it *replaces* the whole permission set. On an already-live database, adding a new permission must instead be a migration using `firstOrCreate()` + `givePermissionTo()`, never `syncPermissions()`, so it doesn't silently wipe an admin's hand-tuned per-role permission grants in production.

---

## 6. Auth / Sanctum Setup

- **Token-based, not SPA-cookie.** Frontend stores a Bearer token in `localStorage`; an axios request interceptor attaches `Authorization: Bearer <token>`; a response interceptor clears storage and dispatches a global `auth:unauthorized` event on HTTP 401 (letting the app redirect to login from anywhere without prop-drilling).
- API routes wrapped in `Route::middleware('auth:sanctum')`.
- `config/sanctum.php`'s `stateful` domains list is populated but effectively unused — boilerplate left from Sanctum's default publish; the app never uses cookie/session auth.
- `config/auth.php` default guard = `web` (session, used for Spatie role checks); API requests authenticate via Sanctum's token guard, resolving to the same `User` model/provider — so `$user->hasRole()`/`hasPermissionTo()` work identically regardless of which guard authenticated the request.
- Password-reset emails link to the **React frontend URL**, not Laravel's default web route — achieved by overriding `User::sendPasswordResetNotification()` with a custom notification class.

---

## 7. Multi-Brand Pattern (not multi-tenant)

Two trade names share **one database**, one shared set of customers/products/suppliers, but every *transactional* record carries `brand_id`:

- `brands`: id, name, short_name, is_default, is_active. Company-profile branding lives per-brand as a JSON file on disk (`storage/app/company_profile.json` / `company_profile_{id}.json`), not a DB table — avoids a schema migration every time a new brand-config field is needed.
- `users.brand_id` — fixed per user account, nullable FK, backfilled to the default brand for pre-existing rows.
- `App\Traits\BelongsToBrand`, applied to every transactional model listed in §2.8:
  - On the model's `creating` event, auto-stamps `brand_id` from the currently authenticated user (falls back to a `Brand::DEFAULT_ID` constant outside a request context — console commands, seeders, queued jobs) **unless the value was already explicitly set** (an explicit value always wins — e.g. a ledger row derived from an existing invoice must inherit that invoice's brand, not the current actor's).
  - Adds a **global query scope** filtering every query by the authenticated user's `brand_id`, so ordinary Eloquent calls (including nested relation eager-loads) are automatically brand-isolated with zero per-query code. No authenticated user (console context) = unscoped, so seeders/jobs can touch all brands.
  - Deliberately **not** applied to Customer/Product/Supplier — those stay shared/global master data across brands, matching the real-world case of one company selling two trade names from the same catalogue and customer base.
- **Document numbering stays global across brands**, deliberately *not* brand-scoped: the numbering trait calls `withoutGlobalScope('brand')` when computing the "next number" for a series, so two brands never collide on the same invoice/quotation number.

---

## 8. Seeder Call Order & Demo Data

`DatabaseSeeder::run()`, in strict order (dependency-driven):

1. **`RolesAndPermissionsSeeder`** — all permissions + 4 roles. Must run first; everything downstream assigns roles.
2. **`AdminUserSeeder`** — one admin user, `assignRole('admin')`.
3. **`CustomerCategorySeeder`** — 5 categories, `created_by` = the admin user.
4. **`ExpenseCategorySeeder`** — 5 categories (Rent, Utility, Transport, Salary, Misc.).
5. **`DemoDataSeeder`** — full end-to-end workflow demo, wrapped in **one `DB::transaction`**, and — this is the important pattern — **reuses the real application Service classes** (`QuotationService`, `InvoiceService`, `PaymentService`, `DeliveryChallanService`, `CustomerOpeningBalanceService`) instead of raw `Model::create()` calls, so seeded ledgers/running-balances/book entries obey exactly the same business invariants production code enforces. It seeds, in order: users (a manager + 2 salesmen under them + 1 staff, each `assignRole()`'d) → suppliers → products (each with 2–3 variants and 2 prioritized supplier links) → customers (some with an opening balance synced through the real service) → quotations covering **every status value** in the enum (draft, pending_approval, approved-with-auto-purchase-entries, invoiced+fully-paid+challan, invoiced+partially-paid, rejected) → expenses.

**Template rule:** for a new project, write your demo/seed data generator to call the same service-layer classes your controllers call — this is what catches "the seeder produces data your own business-rule code would never actually produce" bugs before they reach a demo or QA environment.

---

## 9. Reusable Architecture Patterns — Template Cheat Sheet

This is the section to hand an AI agent building a *different* business app. Every pattern below is domain-agnostic.

1. **Status-only lifecycle instead of duplicate tables.** A document that changes meaning as it progresses (here: Quotation → Order) is **one table with a status enum**, not two parallel tables kept in sync. Downstream artifacts created *by* a status transition (Invoice, PurchaseEntry, DeliveryChallan) get their own tables, created by a service method, not by duplicating the parent.

2. **Archive-not-delete, uniformly.** One 4-column set (`is_archived`, `archived_at`, `archived_by`, `archive_reason`) + one shared trait (scopes + `archive()`/`restore()`) applied to every business-meaningful table. Never hard-delete transactional data. Master-data FKs use `restrictOnDelete()`; audit/dependent-row FKs use `nullOnDelete()`/`cascadeOnDelete()`.

3. **`created_by` + `archived_by` snapshot-FK pair** on every business table — who made it, who archived it (nullable + `nullOnDelete()` so deleting a user account never breaks historical records).

4. **Polymorphic `reference_type`/`reference_id` for anything that logs "what caused this row."** Ledgers, books, vouchers, notifications all use this pair with a composite index, instead of a wide set of nullable single-purpose FK columns.

5. **Running-balance columns on every ledger/book row**, computed by the service layer at insert time (prior row's balance ± this row's debit/credit) — gives O(1) statement/PDF generation with no `SUM()` aggregation over history.

6. **One shared document-numbering trait/helper** — format `PREFIX-YYYY-0001`, globally unique (never scoped per tenant/brand, to guarantee no collision when a new tenant/brand starts), sorts numerically (cast to int in ORDER BY) to avoid `"0010"` sorting before `"0009"`, and relies on a DB unique index to catch races rather than app-level locking.

7. **Snapshot-at-issue-time for anything legally/formally printed.** VAT challans, price lists, and their line items copy buyer/seller/product data at the moment of issue rather than joining live through FKs, so a reprint months later reproduces exactly what was issued even if the source record changed since. The FK to the live record is kept only for UI convenience (pre-filling a new form), never for computing print output.

8. **Priority-ranked multi-vendor linking for anything sourced externally.** A join table (here: `product_supplier_links`) with a `priority_rank` tinyint (1=preferred), a double-unique constraint (one row per pair, one row per rank), plus per-link overrideable fields (cost, minimum quantity) — enables auto-routing to the preferred vendor with a manual per-transaction override flag (`is_supplier_overridden`).

9. **Business rules captured as columns, not just code.** A "minimum billable quantity" rule stores `actual_qty`, `min_qty`, and `billed_qty` as three separate columns on the line item — so a historical record stays self-explanatory even if the business rule changes later; you're not forced to recompute history to know what was actually charged.

10. **Brand/storefront tagging via one trait, not per-table code.** A single trait (auto-stamp-on-create + global query scope) applied selectively only to transactional tables, leaving shared master data untagged — cheap "multiple storefronts sharing one backend" without full multi-tenancy (no tenant-per-schema/DB) overhead. Document numbering explicitly opts *out* of the brand scope so numbering stays globally unique.

11. **Forward-reference FK deferral, documented not accidental.** When table A must reference table B that doesn't exist yet at migration time, store the column as a plain unsigned integer with a code comment explaining the deferral, and consciously decide whether to add the real FK constraint later or leave it permanently unenforced-but-indexed (a legitimate, documented tradeoff — not an oversight to "fix" blindly).

12. **Immutable, append-only audit log.** Separate table, no archive columns, no update/delete code path anywhere in the app, storing JSON `old_value`/`new_value` snapshots plus a denormalized actor-name string (survives the user being deleted). One static helper method standardizes every call site (`AuditLog::record(...)`) so logging call sites stay one-liners.

13. **Permission strings as `module:action`, one fixed guard regardless of API auth guard.** Document the guard-mismatch gotcha explicitly in code comments (resolve as model instances, not bare strings) since it's an easy silent-failure trap with Spatie.

14. **Additive-only permission changes once live.** Initial seed uses `syncPermissions()` (safe, replaces everything). Every permission added after go-live ships as its own migration using `firstOrCreate()` + `givePermissionTo()` — never `syncPermissions()` again — so it can't silently wipe an admin's production role customizations.

15. **Idempotent, defensive incremental migrations.** Every post-launch migration guards its `Schema::table()` calls with `hasColumn()`/`hasTable()` checks so it's safe to re-run against a partially-migrated production DB — cheap insurance against a failed deploy leaving the migration queue stuck.

16. **Seed/demo data goes through real Service classes, not raw model factories.** Guarantees seeded data obeys the same business invariants application code enforces, catching "this seeder produces data your own validation would reject" bugs before a demo/QA environment does.

17. **Nullable-until-actually-needed fields for real-world data that arrives late.** e.g. a tax ID that's only required at the moment a tax document is issued should stay nullable at account-creation time and get collected exactly when first needed — don't force it mandatory up front just because it will eventually matter.

---

## 10. Quick-Reference: What to Copy vs. What's Domain-Specific

| Copy into a new project (domain-agnostic) | Leave behind (blinds/Bangladesh-specific) |
|---|---|
| Archivable trait + 4-column pattern | Mushak/VAT-challan tables (Bangladesh tax law specific) |
| BelongsToBrand trait + global scope | `product_supplier_links.min_billing_sqft` rule (blinds-billing specific, though the *pattern* — "business rule as columns" — generalizes) |
| GeneratesDocumentNumbers trait | PVC slat-count fields |
| Polymorphic ledger/book reference pattern | Bengali number-to-words currency formatting |
| Status-only lifecycle for a multi-stage document | |
| RBAC permission-string convention + safe-migration rule | |
| Snapshot-at-issue-time for printed/legal documents | |
| Service-class-backed demo seeder | |

---

*This document is a manually-maintained architecture snapshot (companion to `PROJECT_OVERVIEW_PRD.md`), generated from a full migration/model/seeder audit on 2026-08-20. Refresh it after any schema or RBAC change significant enough to affect how a new project would copy this architecture.*
