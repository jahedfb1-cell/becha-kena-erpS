# Session Summary — 2026-08-16

সব change GitHub-এ push হয়ে গেছে এবং production (dhakablinds.shop)-এ deploy + verify করা হয়েছে।

---

## 1. Quotation validation error fix
- **সমস্যা:** Quotation-এ product add করে submit করলে "Validation Error: The given data was invalid" আসতো।
- **কারণ:** `items.*.notes` field-এর max length ছিল `500`, কিন্তু product details থেকে auto-fill হওয়া text প্রায়ই তার চেয়ে বড় হতো।
- **Fix:** limit বাড়িয়ে `5000` করা হয়েছে (`QuotationRequest.php`), সাথে একটা leftover debug logger সরানো হয়েছে।

## 2. Money Receipt — সম্পূর্ণ নতুন ডিজাইন
- Sample paper-এর মতো plain grid layout (আগের রঙিন label design বাদ)
- Company Profile-এ যে "Money Receipt Logo" upload করা হয়, সেটা ব্যবহার হয়
- Product Name → product code দেখায় (যেমন: `TQA25 REAX, DBB 1116`)
- Price (TK) → প্রতিটা product-এর দাম আলাদাভাবে (আগে গড় করে একটাই সংখ্যা দেখাতো)
- Salesman-এর নাম footer-এ
- QR code যোগ করা হয়েছে — scan করলে receipt-এর URL-এ নিয়ে যায়
- **Dynamic QR Template:** Company Profile-এ QR code-এর ভেতরের data customize করার option — click করে token বসানো যায় (Verify Link, Receipt No, Customer Name, Paid Amount, ইত্যাদি)
- WhatsApp-এ Share বাটন (PDF বানিয়ে পাঠায়)
- একাধিক product থাকলেও fixed half-A4 print size-এ overflow হয় না

## 3. PVC Product-এর "T. Width (in)" fix
- Quotation, Invoice, Delivery Challan — তিনটা print page-এই PVC strip curtain product-এর Width column এখন raw width-এর বদলে total width (slat count × slat size) দেখায়
- Column header-ও "Width" থেকে "T. Width (in)" এ rename করা হয়েছে

## 4. Purchase → Supplier Ledger system check
- পুরো Order-approve → Purchase Entry → Supplier Ledger flow live test করে confirm করা হয়েছে যে এটা ঠিকভাবে কাজ করে
- একটা gap পাওয়া গেছে: Direct Confirmed Order তৈরি হলে `approved_by` ফাঁকা থাকতো — এখন ঠিক করা হয়েছে (audit trail-এর জন্য)
- (Permission bypass issue নিয়ে user নিজে confirm করেছেন যে সেটা intentional, fix করা হয়নি)

## 5. Multi-Brand Support (Dhaka Blinds / Western Blinds Ltd)
এটা এই session-এর সবচেয়ে বড় কাজ:

- **Western Blinds Ltd admin account তৈরি:** login `admin2@dhakablinds.shop` / password `1234` (উভয় local + production-এ)
- **Print branding fix:** প্রতিটা quotation/invoice/challan/receipt নিজের brand-এর logo/ঠিকানা নিয়ে print হয় (যে brand-এ তৈরি হয়েছে, সেটাই — যে login করে খুলছে তার brand না)
- **Data isolation (মূল fix):** আগে brand_id ট্যাগ থাকলেও কোনো list/report filter করতো না — Western Blinds account দিয়ে login করলে Dhaka Blinds-এর সব ~১০০০ quotation/invoice/payment দেখা যেত। এখন সম্পূর্ণ আলাদা:
  - Quotations, Orders, Invoices, Payments, Purchases, Vouchers, Expenses, Reports/Dashboard — সব শুধু নিজের brand-এর data দেখায়
  - Customers, Products, Suppliers — ইচ্ছাকৃতভাবে shared থেকেছে (দুই brand-ই ব্যবহার করতে পারে)
  - এই fix করতে গিয়ে একটা numbering collision bug পাওয়া গেছে ও ঠিক করা হয়েছে (নতুন brand-এর প্রথম quotation/invoice/ইত্যাদি পুরনো brand-এর number-এর সাথে collide করছিল) — এখন ৭টা জায়গাতেই (QT/INV/DC/PAY/PO/VOU/EXP) shared numbering সঠিকভাবে কাজ করে

---

## Deploy History (এই session-এ)
সব commit GitHub `main` branch-এ, এবং প্রতিটার পর production pull + cache clear + live verify করা হয়েছে:

1. Quotation notes validation fix
2. Money Receipt redesign + PVC Width fix
3. QR code template + double currency label fix
4. QR template click-to-insert buttons
5. `approved_by` fix on Direct Confirmed Orders
6. Multi-brand support (schema + branding)
7. Multi-brand data isolation (global scope + numbering fix)

**Production:** https://dhakablinds.shop — সব change live এবং real data দিয়ে verify করা।
