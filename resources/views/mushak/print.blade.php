{{--
    NBR Mushak 6.3 — VAT challan (মূসক ৬.৩)

    Rendered as an ordinary page and printed by the browser, not by dompdf.
    The form is in Bengali, and dompdf does no complex-script shaping: it
    cannot assemble conjuncts or move a vowel sign to the correct side of its
    consonant, so every যুক্তাক্ষর on the page would come out broken. The
    browser does that shaping correctly, so Ctrl+P here produces a document
    the VAT office will accept while dompdf would not.

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
        @page { size: A4; margin: 12mm; }

        body {
            font-family: 'SolaimanLipi', sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            margin: 0;
        }

        .sheet { max-width: 190mm; margin: 0 auto; }

        .form-no { text-align: right; font-size: 11px; margin-bottom: 4px; }

        .head { text-align: center; line-height: 1.5; margin-bottom: 10px; }
        .head .gov { font-size: 13px; }
        .head .title { font-size: 16px; font-weight: bold; }
        .head .rule { font-size: 11px; }

        .party { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        .party td { vertical-align: top; width: 50%; padding: 4px 6px; border: 1px solid #000; }
        .party .lbl { font-weight: bold; }

        .goods { width: 100%; border-collapse: collapse; }
        .goods th, .goods td { border: 1px solid #000; padding: 4px; }
        .goods th { text-align: center; font-weight: bold; font-size: 11px; }
        .goods td.num { text-align: right; }
        .goods td.mid { text-align: center; }
        .goods tfoot td { font-weight: bold; }

        .sign { margin-top: 28px; display: flex; justify-content: flex-end; }
        .sign .box { width: 60mm; text-align: center; }
        .sign .line { border-top: 1px solid #000; padding-top: 4px; }

        .note { margin-top: 10px; font-size: 10px; }

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

    <div class="form-no">মূসক-৬.৩</div>

    <div class="head">
        <div class="gov">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</div>
        <div class="gov">জাতীয় রাজস্ব বোর্ড</div>
        <div class="title">কর চালানপত্র</div>
        <div class="rule">[বিধি ৪০ এর উপ-বিধি (১) এর দফা (গ) দ্রষ্টব্য]</div>
    </div>

    <table class="party">
        <tr>
            <td>
                <div><span class="lbl">সরবরাহকারীর নাম:</span> {{ $challan->seller_name }}</div>
                <div><span class="lbl">বিআইএন:</span> {{ $challan->seller_bin }}</div>
                <div><span class="lbl">ঠিকানা:</span> {{ $challan->seller_address }}</div>
            </td>
            <td>
                <div><span class="lbl">ক্রেতার নাম:</span> {{ $challan->buyer_name }}</div>
                <div><span class="lbl">বিআইএন:</span> {{ $challan->buyer_bin ?: '—' }}</div>
                <div><span class="lbl">ঠিকানা:</span> {{ $challan->buyer_address ?: '—' }}</div>
            </td>
        </tr>
        <tr>
            <td>
                <div><span class="lbl">চালানপত্র নম্বর:</span> {{ $challan->challan_number }}</div>
            </td>
            <td>
                <div>
                    <span class="lbl">ইস্যুর তারিখ:</span> {{ $challan->issue_date?->format('d/m/Y') }}
                    &nbsp;
                    <span class="lbl">সময়:</span> {{ \Illuminate\Support\Carbon::parse($challan->issue_time)->format('h:i A') }}
                </div>
            </td>
        </tr>
    </table>

    <table class="goods">
        <thead>
            <tr>
                <th style="width:6%">ক্রমিক<br>নং</th>
                <th style="width:26%">পণ্য বা সেবার বর্ণনা</th>
                <th style="width:9%">সরবরাহের<br>একক</th>
                <th style="width:9%">পরিমাণ</th>
                <th style="width:11%">একক মূল্য<br>(টাকা)</th>
                <th style="width:11%">মোট মূল্য<br>(টাকা)</th>
                <th style="width:7%">সম্পূরক<br>শুল্কের হার</th>
                <th style="width:8%">সম্পূরক শুল্কের<br>পরিমাণ</th>
                <th style="width:6%">মূসকের<br>হার</th>
                <th style="width:8%">মূসকের<br>পরিমাণ</th>
                <th style="width:11%">সব ধরনের কর<br>সহ মূল্য</th>
            </tr>
            <tr>
                @for ($i = 1; $i <= 11; $i++)
                    <th>({{ $i }})</th>
                @endfor
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
                    <td class="mid">{{ number_format($item->sd_rate, 2) }}%</td>
                    <td class="num">{{ number_format($item->sd_amount, 2) }}</td>
                    <td class="mid">{{ number_format($item->vat_rate, 2) }}%</td>
                    <td class="num">{{ number_format($item->vat_amount, 2) }}</td>
                    <td class="num">{{ number_format($item->total_including_tax, 2) }}</td>
                </tr>
            @empty
                <tr><td colspan="11" class="mid">কোনো লাইন নেই</td></tr>
            @endforelse
        </tbody>
        <tfoot>
            <tr>
                <td colspan="5" style="text-align:right">সর্বমোট</td>
                <td class="num">{{ number_format($challan->taxable_amount, 2) }}</td>
                <td class="mid">—</td>
                <td class="num">{{ number_format($challan->sd_amount, 2) }}</td>
                <td class="mid">—</td>
                <td class="num">{{ number_format($challan->vat_amount, 2) }}</td>
                <td class="num">{{ number_format($challan->grand_total, 2) }}</td>
            </tr>
        </tfoot>
    </table>

    <div class="sign">
        <div class="box">
            <div class="line">
                <div>{{ $challan->issued_by_name ?: '' }}</div>
                <div>{{ $challan->issued_by_designation ?: '' }}</div>
                <div>প্রস্তুতকারীর স্বাক্ষর ও সীল</div>
            </div>
        </div>
    </div>

    <div class="note">
        সংশ্লিষ্ট বিক্রয় চালান: {{ $challan->salesInvoice?->invoice_number ?? '—' }}
    </div>

</div>
</body>
</html>
