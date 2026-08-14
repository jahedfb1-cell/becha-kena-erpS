# AI Assist — Customer Create Page
## Product Requirements Document (PRD)

**Project:** Becha Kena ERP
**Module:** Customer Management → New Customer Account
**Feature:** AI Assist (Screenshot / Text / Voice → auto-fill)
**Version:** 1.0
**Date:** August 2026
**Stack:** Laravel 12 + React/TypeScript + MySQL
**AI Provider:** Google Gemini API (free tier)

---

> **Amendment — August 14, 2026:** `notes` was removed from AI Assist's output entirely, and the
> Notes & Remarks field was removed from the New Customer form. Notes now only exists on the
> Edit Customer form, once a customer has a `customer_id` — it is never part of customer
> creation. Every reference to `notes` below (the response schema, the "overflow field" rules
> in §6.4, the writable-fields list) reflects the original design and is superseded by this
> change; the current 9 extractable fields are the 10 originally listed minus `notes`.

---

## 1. Objective / উদ্দেশ্য

**EN —** Reduce manual data entry when creating a B2B customer account. A salesman photographs a visiting card, pastes a WhatsApp message, or speaks in Bengali; the form fields fill automatically. The human always reviews before saving.

**BN —** নতুন B2B কাস্টমার অ্যাকাউন্ট খোলার সময় হাতে টাইপ করার পরিশ্রম কমানো। সেলসম্যান ভিজিটিং কার্ডের ছবি তুলবে, WhatsApp মেসেজ পেস্ট করবে, বা বাংলায় বলবে — ফর্ম নিজে থেকে ফিলআপ হবে। সেভ করার আগে মানুষ সবসময় যাচাই করবে।

### Success metric / সফলতার মাপকাঠি

| Metric | Target |
|---|---|
| Time to create one customer | 90s → under 25s |
| Fields correct without edit | ≥ 80% |
| Monthly AI calls | ≤ 150 (free tier safe) |
| Wrong data saved to DB | 0 (review step blocks it) |

---

## 2. Scope / পরিধি

### In scope / অন্তর্ভুক্ত

- Visiting card photo → form fill
- Pasted text (WhatsApp, SMS, email signature, trade licence, BIN/TIN certificate) → form fill
- Bengali voice note → English transcript → pasted into text box → form fill
- Review screen before applying to form
- Duplicate phone number check

### Out of scope / বাদ

- Bulk card scanning (Phase 5, later)
- Editing an existing customer with AI
- Any AI writing to financial fields
- Offline mode
- **Location tracking of any kind** (see §2.1)

### 2.1 No location tracking / লোকেশন ট্র্যাকিং নেই

**EN —** Address is stored and displayed as plain text across two lines. Nothing more. Specifically excluded: browser geolocation, Google Places or Maps lookup, area / thana / police-station dropdowns, district as a structured field, and latitude / longitude columns.

Structured location data earns its cost only when software acts on it — computing delivery routes or charging by zone. This business does neither. Customer addresses are read by humans: printed on an invoice, written on a delivery challan, told to a salesman. Plain text serves that fully, and skipping the lookup layer removes an API key, a recurring cost, a permission prompt, and a dependency that can break.

**BN —** ঠিকানা দুই লাইনের সাধারণ টেক্সট হিসেবে সংরক্ষণ ও প্রদর্শিত হবে। এর বেশি কিছু নয়। যা বাদ: ব্রাউজার জিওলোকেশন, Google Places বা Maps লুকআপ, এরিয়া / থানা / পুলিশ স্টেশন ড্রপডাউন, স্ট্রাকচার্ড ফিল্ড হিসেবে জেলা, এবং ল্যাটিটিউড / লংগিটিউড কলাম।

স্ট্রাকচার্ড লোকেশন ডেটার খরচ তখনই যুক্তিসঙ্গত যখন সফটওয়্যার নিজে তা দিয়ে কাজ করে — ডেলিভারি রুট বের করে বা জোন অনুযায়ী চার্জ করে। এই ব্যবসা কোনোটাই করে না। কাস্টমারের ঠিকানা মানুষ পড়ে: ইনভয়েসে ছাপা হয়, ডেলিভারি চালানে লেখা হয়, সেলসম্যানকে বলা হয়। সাধারণ টেক্সটেই সেই কাজ পুরোপুরি হয়, আর লুকআপ লেয়ার বাদ দিলে একটা API key, একটা চলমান খরচ, একটা পারমিশন পপআপ, আর একটা ভাঙতে পারে এমন নির্ভরতা কমে যায়।

---

## 2A. Actor and access / ব্যবহারকারী ও অ্যাক্সেস

**EN —** The user of this feature is a **salesman**, not a customer. He logs into his own profile in the ERP, opens `New Customer Account`, and finds AI Assist there. He is typically in the field, on a phone, on a mobile connection — often standing in front of the customer he is adding.

This shapes several requirements:

- **Permission** — the endpoints sit behind `permission:customer.create`. AI Assist is not a separate permission; anyone who may create a customer may create one this way.
- **Tenancy** — every created customer carries the salesman's `company_id`. The duplicate lookup is scoped to that same `company_id`, so one company's records are never visible to another's.
- **Attribution** — `created_by` records which salesman added the customer, for commission, performance reporting, and tracing a bad record back to its source.
- **Shared quota** — all salesmen share one Gemini API key, and the free tier's per-minute limit is per project, not per user. A per-user throttle does not protect against ten salesmen extracting simultaneously, so a project-level gate sits above it.
- **Field conditions** — a phone camera, uneven light, a card held at an angle, and a slow connection are the normal case, not the exception. Client-side compression and a preview-before-extract step exist for this reason.

**BN —** এই ফিচারের ব্যবহারকারী **সেলসম্যান**, কাস্টমার নয়। সে ERP-তে নিজের প্রোফাইলে লগইন করে, `New Customer Account` খোলে, এবং সেখানে AI Assist পায়। সে সাধারণত মাঠে থাকে, মোবাইলে, মোবাইল নেটওয়ার্কে — প্রায়ই যাকে যোগ করছে সেই কাস্টমারের সামনে দাঁড়িয়ে।

এর ফলে কিছু শর্ত আসে:

- **পারমিশন** — এন্ডপয়েন্ট দুটি `permission:customer.create`-এর অধীনে। AI Assist আলাদা পারমিশন নয়; যে কাস্টমার তৈরি করতে পারে, সে এভাবেও পারবে।
- **টেন্যান্সি** — প্রতিটি তৈরি হওয়া কাস্টমারে সেলসম্যানের `company_id` থাকবে। ডুপ্লিকেট লুকআপও একই `company_id`-তে সীমিত, ফলে এক কোম্পানির রেকর্ড অন্য কোম্পানি কখনো দেখবে না।
- **দায়বদ্ধতা** — `created_by`-তে থাকবে কোন সেলসম্যান কাস্টমারটি যোগ করেছে — কমিশন, পারফরম্যান্স রিপোর্ট, আর খারাপ রেকর্ডের উৎস খুঁজে বের করার জন্য।
- **শেয়ার্ড কোটা** — সব সেলসম্যান একটি Gemini API key ব্যবহার করে, আর ফ্রি টিয়ারের প্রতি-মিনিট লিমিট প্রতি প্রজেক্টে, প্রতি ইউজারে নয়। দশজন সেলসম্যান একসাথে extract চাপলে per-user throttle বাঁচাবে না, তাই তার উপরে একটি প্রজেক্ট-লেভেল গেট থাকবে।
- **মাঠের বাস্তবতা** — মোবাইল ক্যামেরা, অসম আলো, বাঁকা করে ধরা কার্ড, আর ধীর নেটওয়ার্ক — এগুলো ব্যতিক্রম নয়, এটাই স্বাভাবিক। ক্লায়েন্ট-সাইড কম্প্রেশন আর extract-এর আগে প্রিভিউ ধাপ এই কারণেই আছে।

### 2A.1 Decision — Opening Balance is hidden from salesmen
### ২ক.১ সিদ্ধান্ত — Opening Balance সেলসম্যানের কাছে হাইড

**EN —** Two fields are outside AI's reach (§4). They are not treated the same way for humans.

| Field | Salesman sees it? | Who sets it |
|---|---|---|
| Customer Category | **Yes** | Salesman, manually, from the dropdown |
| Opening Balance (Tk) | **No — hidden** | Admin or Accounts, afterwards |

**Customer Category stays visible.** The salesman is standing in front of the customer and knows whether the firm is an interior contractor, a retailer, or a direct client. That knowledge is cheapest to capture at the moment of creation. Only AI is blocked here, because the model cannot know the current Admin-managed option list.

**Opening Balance is hidden by role.** It is a ledger figure — how much the customer already owes or is owed. A field salesman is not the person who knows it, and a wrong value opens the account with a false debt that propagates silently into vouchers and reports. Customers created by a salesman save with `opening_balance = 0`; Accounts sets the real figure afterwards if there is one.

**Hiding the input is not the control.** A hidden field can still be submitted by hand through the API. The guarantee is server-side: `StoreCustomerRequest` strips `opening_balance` from the payload before validation for any user without the `customer.set_opening_balance` permission, and substitutes zero. The React conditional render is a convenience on top of that, not the enforcement.

**BN —** দুটি ফিল্ড AI-এর নাগালের বাইরে (§৪)। কিন্তু মানুষের জন্য দুটোর নিয়ম এক নয়।

| ফিল্ড | সেলসম্যান দেখবে? | কে বসাবে |
|---|---|---|
| Customer Category | **হ্যাঁ** | সেলসম্যান, ড্রপডাউন থেকে হাতে |
| Opening Balance (Tk) | **না — হাইড** | Admin বা Accounts, পরে |

**Customer Category দেখা যাবে।** সেলসম্যান কাস্টমারের সামনে দাঁড়িয়ে আছে এবং জানে প্রতিষ্ঠানটি ইন্টেরিয়র কনট্রাক্টর, রিটেইলার, নাকি সরাসরি ক্লায়েন্ট। এই তথ্য তৈরির মুহূর্তেই ধরে রাখা সবচেয়ে সহজ। এখানে শুধু AI আটকানো, কারণ মডেল Admin-নিয়ন্ত্রিত বর্তমান অপশন তালিকা জানে না।

**Opening Balance রোল অনুযায়ী হাইড।** এটি লেজারের সংখ্যা — কাস্টমার আগে থেকে কত টাকা দেনা বা পাওনা। মাঠের সেলসম্যান এটি জানে না, আর ভুল ভ্যালু দিয়ে অ্যাকাউন্ট খুললে মিথ্যা দেনা চুপচাপ ভাউচার আর রিপোর্টে ছড়িয়ে পড়ে। সেলসম্যানের তৈরি কাস্টমার `opening_balance = 0` নিয়ে সেভ হবে; থাকলে Accounts পরে আসল সংখ্যা বসাবে।

**ইনপুট লুকানোই নিয়ন্ত্রণ নয়।** হাইড করা ফিল্ডও API দিয়ে হাতে পাঠানো যায়। নিশ্চয়তা সার্ভার-সাইডে: `customer.set_opening_balance` পারমিশন নেই এমন যেকোনো ইউজারের ক্ষেত্রে `StoreCustomerRequest` ভ্যালিডেশনের আগেই পেলোড থেকে `opening_balance` সরিয়ে শূন্য বসায়। React-এর কন্ডিশনাল রেন্ডার তার উপরের সুবিধা মাত্র, বাস্তবায়ন নয়।

### 2A.2 Permission map / পারমিশন ম্যাপ

| Permission | Salesman | Manager | Accounts | Admin |
|---|---|---|---|---|
| `customer.create` | Yes | Yes | Yes | Yes |
| `customer.set_opening_balance` | No | No | Yes | Yes |

---

## 3. Existing form fields / বর্তমান ফর্মের ফিল্ড

Taken from the live `New Customer Account` modal.

| # | Field | Required | AI may fill? | Salesman sees? |
|---|---|---|---|---|
| 1 | Company Name | Yes | **Yes** | Yes |
| 2 | Contact Person Name | No | **Yes** | Yes |
| 3 | 1st Contact Number | Yes | **Yes** | Yes |
| 4 | Customer Category | No | **NO — manual only** | Yes |
| 5 | 2nd Contact Number | No | **Yes** | Yes |
| 6 | 3rd Contact Number | No | **Yes** | Yes |
| 7 | Email ID | No | **Yes** | Yes |
| 8 | Opening Balance (Tk) | No | **NO — manual only** | **No — hidden** |
| 9 | Address Line 1 | Yes | **Yes** | Yes |
| 10 | Address Line 2 | No | **Yes** | Yes |
| 11 | Notes & Remarks | No | **Yes** | Yes |

---

## 4. Hard rule — two fields AI must never touch
## ৪. কঠিন নিয়ম — দুটি ফিল্ডে AI কখনো হাত দেবে না

### 4.1 Opening Balance (Tk)

**EN —** This is a money field that becomes a ledger entry. A visiting card contains many numbers — house number 1313, a phone fragment, a licence number. If the model writes any of those into Opening Balance, the customer's account opens with a false debt or credit. That error is silent, it survives into vouchers and reports, and finding it later means auditing the ledger by hand.

**BN —** এটি টাকার ফিল্ড, যা লেজার এন্ট্রিতে পরিণত হয়। ভিজিটিং কার্ডে অনেক সংখ্যা থাকে — বাসা নম্বর ১৩১৩, ফোনের অংশ, লাইসেন্স নম্বর। মডেল যদি এর কোনোটা Opening Balance-এ বসিয়ে দেয়, কাস্টমারের হিসাব ভুল দেনা বা পাওনা নিয়ে শুরু হবে। এই ভুল চুপচাপ থাকে, ভাউচার আর রিপোর্টে ছড়িয়ে পড়ে, আর পরে ধরতে হলে হাতে লেজার অডিট করা ছাড়া উপায় থাকে না।

### 4.2 Customer Category

**EN —** A controlled dropdown managed by Admin. The model does not know the current option list, so it would guess a label that does not exist, or pick a plausible-sounding wrong one. Category drives pricing tiers and reporting, so a wrong value is worse than an empty one.

**BN —** এটি Admin-নিয়ন্ত্রিত ড্রপডাউন। মডেল বর্তমান অপশন লিস্ট জানে না, তাই সে এমন নাম বানাবে যা তালিকায় নেই, অথবা শুনতে ঠিক মনে হয় এমন ভুল অপশন বেছে নেবে। ক্যাটাগরির উপর প্রাইসিং টিয়ার আর রিপোর্ট নির্ভর করে, তাই ভুল ভ্যালু খালি রাখার চেয়েও খারাপ।

### 4.3 Enforcement / বাস্তবায়ন

Three independent layers. If one fails, the others still hold.

| Layer | Mechanism |
|---|---|
| Prompt | Fields absent from the schema entirely — not mentioned, not forbidden, simply not there |
| API | `responseSchema` has no `opening_balance` or `customer_category` property |
| Frontend | `applyDraft()` writes to an explicit allow-list of keys; anything else is dropped |

Frontend allow-list — the authoritative guard:

```ts
const AI_WRITABLE_FIELDS = [
  'company_name',
  'contact_person_name',
  'contact_number_1',
  'contact_number_2',
  'contact_number_3',
  'email',
  'address_line_1',
  'address_line_2',
  'notes',
] as const;
```

`opening_balance` and `customer_category` never appear on this list. Even if a future prompt change or a model update returns them, they are discarded before touching form state.

---

## 5. AI output schema / AI আউটপুট স্কিমা

```json
{
  "company_name":        "string",
  "contact_person_name": "string",
  "contact_number_1":    "string",
  "contact_number_2":    "string",
  "contact_number_3":    "string",
  "email":               "string",
  "address_line_1":      "string",
  "address_line_2":      "string",
  "notes":               "string",
  "confidence":           0.0
}
```

Nine writable fields plus a confidence score. No financial field. No category field.

---

## 6. Extraction rules / এক্সট্রাকশন নিয়ম

### 6.1 Company vs Contact Person

**EN —** Company Name is required in this form, Contact Person is not — the opposite of a consumer address book. Rules:

- The firm name goes to `company_name`; the human name goes to `contact_person_name`. Never merge them into one field.
- If the source has only a person's name and no firm (common on a personal card), put that name in **both** fields. Company Name cannot be empty, and the reviewer can correct it in one tap.
- A designation (Director, Proprietor, Managing Director) is not a name. It goes to `notes`.

**BN —** এই ফর্মে Company Name বাধ্যতামূলক, Contact Person নয় — সাধারণ অ্যাড্রেস বুকের উল্টো। নিয়ম:

- প্রতিষ্ঠানের নাম যাবে `company_name`-এ; ব্যক্তির নাম যাবে `contact_person_name`-এ। দুটো কখনো এক ফিল্ডে মেশানো যাবে না।
- সোর্সে যদি শুধু ব্যক্তির নাম থাকে, প্রতিষ্ঠানের নাম না থাকে (ব্যক্তিগত কার্ডে সাধারণ), তাহলে ওই নামটাই **দুই ফিল্ডেই** বসবে। Company Name খালি রাখা যায় না, আর রিভিউয়ার এক ট্যাপে ঠিক করে নিতে পারবে।
- পদবি (Director, Proprietor, Managing Director) নাম নয়। ওটা `notes`-এ যাবে।

### 6.2 Phone numbers / ফোন নম্বর

- Normalize every Bangladeshi mobile to `+8801XXXXXXXXX`.
- Convert Bengali digits `০১২৩৪৫৬৭৮৯` to English digits.
- Fill in the order found: first number → `contact_number_1`, second → `contact_number_2`, third → `contact_number_3`.
- Landline / office numbers: keep as printed, place after mobiles.
- More than three numbers found → the extras go to `notes`, never dropped silently.

### 6.3 Address split / ঠিকানা ভাগ

**EN —** Address Line 1 holds the specific location: house, road, plot, floor, building. Address Line 2 holds the wider area: thana, district, post code. If the address is one short line, all of it goes to Line 1 and Line 2 stays empty. Do not invent a district that is not written.

**BN —** Address Line 1-এ থাকবে নির্দিষ্ট অবস্থান: বাসা, রোড, প্লট, ফ্লোর, বিল্ডিং। Address Line 2-এ থাকবে বড় এলাকা: থানা, জেলা, পোস্ট কোড। ঠিকানা যদি এক লাইনের ছোট হয়, পুরোটাই Line 1-এ যাবে, Line 2 খালি থাকবে। লেখা নেই এমন জেলার নাম বানানো যাবে না।

Example:

```
Source:  1313, D.T. Road, West Madarbari, Chattogram
Line 1:  1313, D. T. Road
Line 2:  West Madarbari, Chattogram
```

### 6.4 Notes & Remarks — the overflow field

Everything found that has no dedicated field goes here, one item per line:

- Designation (Director, Proprietor)
- Website
- BIN / TIN / trade licence number
- Product lines printed on the card (Vertical, Roller, Venetian, Wooden)
- Fourth and later phone numbers
- Anything else legible and relevant

**EN —** This field exists so no information is lost. Extraction should never discard readable data just because there is no matching field.

**BN —** এই ফিল্ডটা আছে যাতে কোনো তথ্য হারিয়ে না যায়। শুধু মিল খাওয়া ফিল্ড নেই বলে পড়া যায় এমন ডেটা ফেলে দেওয়া চলবে না।

### 6.5 Never invent / বানানো নিষেধ

**EN —** If a field is not present in the source, return an empty string. Do not complete a partial phone number. Do not guess a district from a road name. Do not expand an abbreviation unless it is written in full elsewhere on the same card. An empty field costs one manual entry; an invented field corrupts the record and nobody notices.

**BN —** সোর্সে কোনো ফিল্ড না থাকলে খালি স্ট্রিং ফেরত যাবে। অসম্পূর্ণ ফোন নম্বর পূরণ করা যাবে না। রোডের নাম দেখে জেলা অনুমান করা যাবে না। একই কার্ডে অন্য কোথাও পুরো নাম লেখা না থাকলে সংক্ষিপ্ত রূপ বড় করা যাবে না। খালি ফিল্ডে একবার হাতে লিখতে হয়; বানানো ফিল্ড রেকর্ড নষ্ট করে আর কেউ টেরও পায় না।

---

## 7. User flow / ইউজার ফ্লো

### 7.1 Entry point

A banner sits at the top of the New Customer Account modal:

```
[✨]  AI Assist   [NEW]
      Create from card, text or voice — fill the form in one tap.   [>]
```

### 7.2 Three tabs

```
┌──────────────┬──────────────┬──────────────┐
│  Paste text  │  Screenshot  │    Voice     │
└──────────────┴──────────────┴──────────────┘
```

### 7.3 Screenshot flow

1. Tap to pick or capture a photo (JPG, PNG, WEBP — up to 10 MB)
2. Client compresses to max 1600px, ~200 KB
3. Preview shown with a "Choose a different image" link
4. Tap **Extract**
5. Spinner: "Reading the card… this usually takes 10–30 seconds."
6. Review screen (§7.6)

### 7.4 Paste text flow

1. Paste or type into the textarea (max 10000 chars, live counter)
2. Tap **Extract**
3. Review screen

### 7.5 Voice flow

1. Tap the microphone; recording begins, timer counts up
2. Tap again to stop, or auto-stop at 90 seconds
3. Audio uploads; spinner: "ভয়েস পড়ছে…"
4. **Transcript is written into the Paste text tab**, and the tab switches there automatically
5. A badge appears: "ভয়েস থেকে — মিলিয়ে নিন"
6. User reads the transcript, edits if needed
7. Tap **Extract** — same path as §7.4

**EN —** Voice does not go straight to the form. The transcript is shown first because speech recognition errors are different in kind from OCR errors — a misheard digit reads as perfectly plausible text. Showing the transcript gives the user a cheap chance to catch it before it becomes structured data.

**BN —** ভয়েস সরাসরি ফর্মে যায় না। ট্রান্সক্রিপ্ট আগে দেখানো হয়, কারণ ভয়েস চেনার ভুল OCR-এর ভুল থেকে আলাদা ধরনের — ভুল শোনা একটা সংখ্যা দেখতে একদম স্বাভাবিক টেক্সটের মতো লাগে। ট্রান্সক্রিপ্ট দেখালে স্ট্রাকচার্ড ডেটা হওয়ার আগেই ইউজার সহজে ভুলটা ধরতে পারে।

### 7.6 Review screen / রিভিউ স্ক্রিন

Non-empty fields are listed, label on the left, extracted value on the right:

```
┌──────────────────────────────────────────┐
│  Company Name      Dhaka Blind Company   │
│  Contact Person    Md. Didarul Alam      │
│  1st Contact       +8801815819840        │
│  2nd Contact       +8801814727866        │
│  Address Line 1    1313, D. T. Road      │
│  Address Line 2    West Madarbari,       │
│                    Chattogram            │
│  Notes             Director              │
│                    Vertical, Roller,     │
│                    Venetian, Wooden      │
├──────────────────────────────────────────┤
│  নির্ভরযোগ্যতা: 92%                        │
│  AI ভুল করতে পারে — সেভ করার আগে প্রতিটি   │
│  ফিল্ড মিলিয়ে নিন।                         │
├──────────────────────────────────────────┤
│      [ ফর্মে বসান ]      [ বাতিল ]        │
└──────────────────────────────────────────┘
```

Opening Balance and Customer Category do not appear on this screen at all — there is nothing to review, because nothing was extracted for them.

### 7.7 After apply / বসানোর পর

- Each AI-filled input gets an amber left border and a small "AI" badge
- Editing an input clears its badge — the field is now human-verified
- An "AI এর আগের অবস্থায় ফিরুন" link restores the pre-apply form state
- Opening Balance and Customer Category keep their normal styling, untouched and unbadged

**EN —** The badge is not decoration. It marks which values a human has not yet confirmed, so a reviewer scanning the form knows exactly where to look.

**BN —** ব্যাজটা সাজসজ্জা নয়। এটা দেখায় কোন ভ্যালুগুলো এখনো মানুষ যাচাই করেনি, ফলে ফর্ম দেখার সময় রিভিউয়ার ঠিক কোথায় নজর দিতে হবে বুঝতে পারে।

### 7.8 Duplicate check / ডুপ্লিকেট চেক

After `contact_number_1` is filled, look up the last 10 digits against existing customers. On a match:

```
এই নম্বরে "Rafiq Trading" আগে থেকেই আছে।
[ ওটা খুলুন ]   [ নতুন করে বানান ]
```

**EN —** Duplicate customer records are the most common and most expensive data problem in an ERP — ledgers split across two accounts, and reconciling them later is manual work. Catching it at creation time costs one lookup.

**BN —** ডুপ্লিকেট কাস্টমার রেকর্ড ERP-এর সবচেয়ে সাধারণ আর সবচেয়ে ব্যয়বহুল ডেটা সমস্যা — লেজার দুই অ্যাকাউন্টে ভাগ হয়ে যায়, আর পরে মেলাতে হাতে কাজ করতে হয়। তৈরির সময়েই ধরলে খরচ শুধু একটা লুকআপ।

---

## 8. API contract / API চুক্তি

### 8.1 `POST /api/ai/parse-customer`

**Auth:** `auth:sanctum`
**Throttle:** 20 requests / minute / user

**Request** — `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `image` | file | jpg, jpeg, png, webp — max 6 MB |
| `text` | string | max 8000 chars |
| `mode` | string | `card` \| `text` \| `voice` |

At least one of `image` or `text` required.

**Response 200**

```json
{
  "data": {
    "company_name": "Dhaka Blind Company",
    "contact_person_name": "Md. Didarul Alam",
    "contact_number_1": "+8801815819840",
    "contact_number_2": "+8801814727866",
    "contact_number_3": "",
    "email": "",
    "address_line_1": "1313, D. T. Road",
    "address_line_2": "West Madarbari, Chattogram",
    "notes": "Director\nVertical, Roller, Venetian, Wooden",
    "confidence": 0.92
  }
}
```

### 8.2 `POST /api/ai/transcribe`

**Request** — `multipart/form-data`

| Field | Type | Notes |
|---|---|---|
| `audio` | file | webm, ogg, mp3, wav, m4a, mp4 — max 10 MB |

**Response 200**

```json
{ "text": "Dhaka Blind Company, Didarul Alam, phone 01815819840, 1313 D.T. Road, West Madarbari, Chattogram" }
```

### 8.3 Error responses / এরর রেসপন্স

| Code | Condition | User message |
|---|---|---|
| 422 | No input supplied | `text, image or audio required` |
| 422 | Audio silent / unintelligible | কিছু শোনা যায়নি। আবার বলুন। |
| 422 | Model returned unparseable output | ডেটা পড়া যায়নি। |
| 429 | Free-tier quota reached | এই মুহূর্তে লিমিট শেষ। কিছুক্ষণ পর চেষ্টা করুন বা হাতে লিখুন। |
| 500 | `GEMINI_API_KEY` missing | AI কনফিগার করা হয়নি। |
| 502 | Model name retired (404 upstream) | AI মডেল আপডেট দরকার। ডেভেলপারকে জানান। |
| 502 | Upstream failure | AI সার্ভিস এখন কাজ করছে না। |

**EN —** Every failure path leaves the form usable. AI Assist is an accelerator, never a gate — if it is down, the user types the customer in by hand exactly as before.

**BN —** যেকোনো ব্যর্থতার পরেও ফর্ম ব্যবহারযোগ্য থাকবে। AI Assist গতি বাড়ায়, পথ আটকায় না — কাজ না করলে ইউজার আগের মতোই হাতে কাস্টমার লিখবে।

---

## 9. Technical notes / টেকনিক্যাল নোট

### 9.1 Model

- `.env` → `GEMINI_MODEL=gemini-3.5-flash`
- Model name lives in config, never hardcoded — Google retires models on a schedule and a hardcoded name means an outage
- Flash-Lite is faster but measurably weaker at OCR; visiting cards are an OCR task, so Flash is the right tier here

### 9.2 Image compression

Client-side before upload: max dimension 1600px, JPEG quality 0.82. A 4 MB phone photo becomes roughly 200 KB. On a Dhaka mobile connection this is the difference between a 2-second and a 40-second upload.

### 9.3 Voice capture

`MediaRecorder` with Opus at 32 kbps. A 30-second note is about 120 KB. `MediaRecorder` works on iOS Safari, where the Web Speech API does not — this is why transcription runs server-side through Gemini rather than in the browser.

### 9.4 Quota budget

| Action | Calls |
|---|---|
| Card or text extraction | 1 |
| Voice extraction | 2 (transcribe + parse) |

At the expected 50 customers per month, worst case is 100 calls — far under the free tier's daily allowance, let alone monthly.

### 9.5 Free tier data handling / ফ্রি টিয়ার ডেটা

**EN —** Google states that free-tier API content may be used to improve its products; paid tiers are excluded from this. Visiting cards carry third-party contact details. The business has accepted this trade-off for the current volume. Revisit if a corporate client's contract restricts processing of their contact data, or when volume justifies a paid tier.

**BN —** Google জানিয়েছে ফ্রি টিয়ারের API কন্টেন্ট তাদের প্রোডাক্ট উন্নত করতে ব্যবহৃত হতে পারে; পেইড টিয়ার এর বাইরে। ভিজিটিং কার্ডে তৃতীয় পক্ষের যোগাযোগের তথ্য থাকে। বর্তমান ভলিউমের জন্য ব্যবসা এই আপস মেনে নিয়েছে। কোনো কর্পোরেট ক্লায়েন্টের চুক্তিতে তাদের যোগাযোগ ডেটা প্রসেসিংয়ে বাধা থাকলে, অথবা ভলিউম বেড়ে পেইড টিয়ার যুক্তিসঙ্গত হলে আবার বিবেচনা করতে হবে।

### 9.6 Audit log

Table `ai_assist_logs`:

| Column | Purpose |
|---|---|
| `user_id` | which salesman used it |
| `company_id` | tenant scope, for per-company reporting |
| `mode` | card / text / voice |
| `confidence` | model's self-reported score |
| `applied` | did the user press "ফর্মে বসান" |
| `created_at` | timestamp |

The `applied` flag is the real quality signal — a high extraction count with a low apply rate means the output is not trusted, whatever the confidence score claims.

---

## 10. Acceptance criteria / গ্রহণযোগ্যতার শর্ত

| # | Criterion |
|---|---|
| 1 | Opening Balance is never written by AI under any input |
| 2 | Customer Category is never written by AI under any input |
| 3 | Bengali digits are converted to English digits in every field |
| 4 | Bangladeshi mobiles are normalized to `+8801XXXXXXXXX` |
| 5 | Company Name is never empty when the source contains any name |
| 6 | Company name and person name are never merged into one field |
| 7 | Address is split across Line 1 and Line 2 per §6.3 |
| 8 | Review screen appears before any form field changes |
| 9 | AI-filled fields carry a visible badge until edited |
| 10 | Undo restores the exact pre-apply form state |
| 11 | Every error path leaves the form manually usable |
| 12 | A duplicate `contact_number_1` is detected before save, scoped to the salesman's `company_id` |
| 13 | Voice transcript is shown in the text tab, never applied directly |
| 14 | Tested against at least 5 real visiting cards, not samples |
| 15 | Both endpoints reject a user without `customer.create` permission |
| 16 | Created customers carry the correct `company_id` and `created_by` |
| 17 | Concurrent use by several salesmen degrades to a clear 429 message, never a broken form |
| 18 | Opening Balance input does not render for a salesman |
| 19 | A hand-crafted API request carrying `opening_balance` from a salesman saves as `0` |
| 20 | Customer Category renders for a salesman and rejects any id outside the dropdown |

---

## 11. Phases / ধাপ

| Phase | Deliverable | Done when |
|---|---|---|
| 1 | Laravel: config, routes, `AiAssistController` with both endpoints | curl returns correct JSON for text, image and audio |
| 2 | React: `compressImage.ts`, `aiAssist.ts`, `AIAssistModal` with text + screenshot tabs, review screen | 5 real cards extract correctly end to end |
| 3 | `useVoiceRecorder`, voice tab, transcript-into-textarea flow | Bengali voice note reaches the form correctly |
| 4 | Badges, undo, duplicate lookup, `ai_assist_logs` | All acceptance criteria pass |
| 5 | Bulk card mode (deferred) | — |

One phase per working session. Each phase ships independently — no phase depends on a later one.

---

## 12. Risks / ঝুঁকি

| Risk | Impact | Mitigation |
|---|---|---|
| Free tier withdrawn or limits cut | Feature stops | Provider abstracted behind an interface; swap to self-hosted Ollama or a paid tier by changing one env value |
| Model name retired | 404 on every call | Model in `.env`; upstream 404 logged as `critical` with a distinct user message |
| OCR misreads a digit | Wrong phone saved | Review screen; duplicate lookup; badge on unverified fields |
| User skips review out of habit | Bad data in DB | Review cannot be bypassed; badges persist after apply as a second prompt |
| Card photo too dark or angled | Poor extraction | Preview before extract; "Choose a different image" always available |
| Voice note is long or noisy | Transcript unusable | 90-second cap; transcript shown and editable before extraction |

---

## 13. Open questions / খোলা প্রশ্ন

1. Should a card image be stored on the customer record as proof? Useful for later disputes; adds storage and a retention decision.
2. When a card carries two people, should the modal offer a choice, or always take the first?
3. Should `notes` be appended to an existing value, or overwrite it, when AI Assist is run twice on the same open form?

---

*End of document*
