{{--
    NBR Mushak 6.3 — VAT challan (মূসক ৬.৩)

    Rendered as an ordinary page and printed by the browser, not by dompdf.
    The form is in Bengali, and dompdf does no complex-script shaping: it
    cannot assemble conjuncts or move a vowel sign to the correct side of its
    consonant, so every যুক্তাক্ষর on the page would come out broken. The
    browser does that shaping correctly, so Ctrl+P here produces a document
    the VAT office will accept while dompdf would not.

    The wording, the field order and the eleven numbered columns follow the
    printed NBR pad exactly, because the sheet is filed as-is. Two of its
    fields — সরবরাহের গন্তব্যস্থল and যানবাহনের প্রকৃতি ও নম্বর — are not held
    in the database; they print as ruled blanks, the way they are left blank
    on the pad and written in by hand at dispatch.

    Every value printed here comes off the mushak_invoices row itself, never
    through a relation. The challan is a statement about the moment it was
    issued and must reprint identically years later.
--}}
<!DOCTYPE html>
<html lang="bn">
<head>
    <meta charset="utf-8">
    <title>{{ $challan->challan_number }} — মূসক ৬.৩</title>
    <link rel="stylesheet" href="{{ asset('css/bangla-fonts.css') }}">
    <style>
        @page { size: A4; margin: 10mm; }

        body {
            font-family: 'SolaimanLipi', sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            margin: 0;
        }

        .sheet { max-width: 190mm; margin: 0 auto; }

        .copy-mark { text-align: right; font-size: 12px; line-height: 1.5; }
        .copy-mark .form-no { font-weight: bold; }

        .head { text-align: center; line-height: 1.5; margin-top: -36px; }
        .head .gov { font-size: 12px; }
        .head .title { font-size: 17px; font-weight: bold; }
        .head .rule { font-size: 11px; }

        /* The seller block sits right of centre on the printed pad. */
        .seller { margin: 12px 0 8px 42%; }

        .fld { display: flex; margin-bottom: 4px; }
        .fld .lbl { white-space: nowrap; }
        .fld .val { flex: 1; border-bottom: 1px solid #000; padding-left: 6px; min-height: 15px; }

        .parties { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .parties td { vertical-align: top; padding: 0; }
        .parties .left { width: 58%; padding-right: 20px; }
        .parties .right { width: 42%; }

        .goods { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .goods th, .goods td { border: 1px solid #000; padding: 3px; word-wrap: break-word; }
        .goods th { text-align: center; font-weight: normal; font-size: 10px; line-height: 1.25; vertical-align: middle; }
        .goods td { font-size: 11px; }
        .goods td.num { text-align: right; }
        .goods td.mid { text-align: center; }
        .goods .filler td { height: 150px; }
        .goods tfoot td { font-weight: bold; }

        .foot { width: 100%; border-collapse: collapse; margin-top: 18px; }
        .foot td { vertical-align: bottom; padding: 0; }
        .foot .sign-left { width: 62%; }
        .foot .seal { width: 38%; text-align: center; padding-bottom: 4px; }

        .note { margin-top: 24px; font-size: 11px; }
        .src { margin-top: 8px; font-size: 10px; color: #333; }

        @media print {
            .no-print { display: none; }
        }
    </style>
</head>
<body>
<div class="sheet">

    <div class="no-print" style="text-align:right; margin-bottom:8px;">
        <button onclick="window.print()">প্রিন্ট করুন</button>
    </div>

    <div class="copy-mark">
        <div>দ্বিতীয় কপি</div>
        <div class="form-no">মূসক-৬.৩</div>
    </div>

    <div class="head">
        <div class="gov">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার, জাতীয় রাজস্ব বোর্ড</div>
        <div class="title">কর চালানপত্র</div>
        <div class="rule">[বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) ও (চ) দ্রষ্টব্য]</div>
    </div>

    <div class="seller">
        <div class="fld">
            <span class="lbl">নিবন্ধিত ব্যক্তির নাম ঃ</span>
            <span class="val">{{ $challan->seller_name }}</span>
        </div>
        <div class="fld">
            <span class="lbl">নিবন্ধিত ব্যক্তির বিআইএন ঃ</span>
            <span class="val">{{ $challan->seller_bin }}</span>
        </div>
        <div class="fld">
            <span class="lbl">চালানপত্র ইস্যুর ঠিকানা ঃ</span>
            <span class="val">{{ $challan->seller_address }}</span>
        </div>
    </div>

    <table class="parties">
        <tr>
            <td class="left">
                <div class="fld">
                    <span class="lbl">ক্রেতার নাম ঃ</span>
                    <span class="val">{{ $challan->buyer_name }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">ক্রেতার বিআইএন (প্রযোজ্য ক্ষেত্রে) ঃ</span>
                    <span class="val">{{ $challan->buyer_bin }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">ক্রেতার ঠিকানা ঃ</span>
                    <span class="val">{{ $challan->buyer_address }}</span>
                </div>
                {{-- Written in by hand at dispatch; not held in the database. --}}
                <div class="fld">
                    <span class="lbl">সরবরাহের গন্তব্যস্থল ঃ</span>
                    <span class="val"></span>
                </div>
                <div class="fld">
                    <span class="lbl">যানবাহনের প্রকৃতি ও নম্বর ঃ</span>
                    <span class="val"></span>
                </div>
            </td>
            <td class="right">
                <div class="fld">
                    <span class="lbl">চালানপত্র নম্বর ঃ</span>
                    <span class="val">{{ $challan->challan_number }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">ইস্যুর তারিখ ঃ</span>
                    <span class="val">{{ $challan->issue_date?->format('d/m/Y') }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">ইস্যুর সময় ঃ</span>
                    <span class="val">{{ \Illuminate\Support\Carbon::parse($challan->issue_time)->format('h:i A') }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table class="goods">
        <thead>
            <tr>
                <th style="width:5%">ক্রমিক</th>
                <th style="width:21%">পণ্য বা সেবার বর্ণনা<br>(প্রযোজ্য ক্ষেত্রে ব্র্যান্ড নামসহ)</th>
                <th style="width:7%">সরবরাহের<br>একক</th>
                <th style="width:7%">পরিমাণ</th>
                <th style="width:9%">একক মূল্য<br>(টাকায়)</th>
                <th style="width:10%">মোট মূল্য<br>(টাকায়)</th>
                <th style="width:6%">সম্পূরক<br>শুল্কের<br>হার</th>
                <th style="width:8%">সম্পূরক<br>শুল্কের<br>পরিমাণ<br>(টাকায়)</th>
                <th style="width:7%">মূল্য<br>সংযোজন<br>করের হার/<br>সুনির্দিষ্ট কর</th>
                <th style="width:10%">মূল্য সংযোজন<br>কর/সুনির্দিষ্ট কর<br>এর পরিমাণ<br>(টাকায়)</th>
                <th style="width:10%">সকল প্রকার<br>শুল্ক ও করসহ<br>মূল্য</th>
            </tr>
            <tr>
                <th>(১)</th><th>(২)</th><th>(৩)</th><th>(৪)</th><th>(৫)</th><th>(৬)</th>
                <th>(৭)</th><th>(৮)</th><th>(৯)</th><th>(১০)</th><th>(১১)</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($challan->items as $item)
                <tr>
                    <td class="mid">{{ $item->serial_no }}</td>
                    <td>{{ $item->description }}</td>
                    <td class="mid">{{ $item->unit }}</td>
                    <td class="num">{{ number_format($item->quantity, 2) }}</td>
                    <td class="num">{{ number_format($item->unit_price, 2) }}</td>
                    <td class="num">{{ number_format($item->total_value, 2) }}</td>
                    <td class="mid">{{ $item->sd_rate > 0 ? number_format($item->sd_rate, 2).'%' : '' }}</td>
                    <td class="num">{{ $item->sd_amount > 0 ? number_format($item->sd_amount, 2) : '' }}</td>
                    <td class="mid">{{ number_format($item->vat_rate, 2) }}%</td>
                    <td class="num">{{ number_format($item->vat_amount, 2) }}</td>
                    <td class="num">{{ number_format($item->total_including_tax, 2) }}</td>
                </tr>
            @empty
                <tr><td colspan="11" class="mid">কোনো লাইন নেই</td></tr>
            @endforelse
            {{-- Keeps the ruled box as deep as it is on the printed pad. --}}
            <tr class="filler">
                <td></td><td></td><td></td><td></td><td></td><td></td>
                <td></td><td></td><td></td><td></td><td></td>
            </tr>
        </tbody>
        <tfoot>
            <tr>
                <td colspan="5" style="text-align:right">সর্বমোট</td>
                <td class="num">{{ number_format($challan->taxable_amount, 2) }}</td>
                <td></td>
                <td class="num">{{ $challan->sd_amount > 0 ? number_format($challan->sd_amount, 2) : '' }}</td>
                <td></td>
                <td class="num">{{ number_format($challan->vat_amount, 2) }}</td>
                <td class="num">{{ number_format($challan->grand_total, 2) }}</td>
            </tr>
        </tfoot>
    </table>

    <table class="foot">
        <tr>
            <td class="sign-left">
                <div class="fld">
                    <span class="lbl">প্রতিষ্ঠান কর্তৃপক্ষের দায়িত্বপ্রাপ্ত ব্যক্তির নাম ঃ</span>
                    <span class="val">{{ $challan->issued_by_name }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">পদবী ঃ</span>
                    <span class="val">{{ $challan->issued_by_designation }}</span>
                </div>
                <div class="fld">
                    <span class="lbl">স্বাক্ষর ঃ</span>
                    <span class="val"></span>
                </div>
            </td>
            <td class="seal">সীল ঃ</td>
        </tr>
    </table>

    <div class="note">*“সকল প্রকার কর ব্যতীত মূল্য”।</div>

    <div class="src no-print">
        সংশ্লিষ্ট বিক্রয় চালান: {{ $challan->salesInvoice?->invoice_number ?? '—' }}
    </div>

</div>
</body>
</html>
