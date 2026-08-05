<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Traits\ApiResponse;

class CompanyProfileController extends Controller
{
    use ApiResponse;

    // Settings file path (stored in storage/app/company_profile.json)
    private string $filePath = 'company_profile.json';

    /** GET /api/company-profile */
    public function show()
    {
        if (Storage::exists($this->filePath)) {
            $data = json_decode(Storage::get($this->filePath), true);
        } else {
            // Default pre-filled data
            $data = [
                'company_name'     => 'Dhaka Blinds',
                'company_address'  => '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh,.',
                'mobile'           => '01629000200',
                'email'            => 'dhakablinds@gmail.com',
                'opening_balance'  => '0.00',
                'company_web'      => 'www.dhakablinds.com',
                'company_facebook' => '#',
                'vat_reg_no'       => '',
                'terms_conditions' => "You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.\nPlease make your payment by cash or cheque in favour of \"Dhaka Blinds\" we hope you'll find ours rates reasonable and place an order with us.",
                'company_logo'     => null,
                'invoice_logo'     => null,
            ];
        }

        $data['company_logo_url'] = !empty($data['company_logo'])
            ? url('storage/' . $data['company_logo'])
            : url('logo-demo.svg');
        $data['invoice_logo_url'] = !empty($data['invoice_logo'])
            ? url('storage/' . $data['invoice_logo'])
            : url('logo-demo.svg');

        return $this->successResponse($data, 'Company profile loaded.');
    }

    /** POST /api/company-profile */
    public function update(Request $request)
    {
        $request->validate([
            'company_name'    => 'required|string|max:200',
            'company_address' => 'required|string|max:500',
            'mobile'          => 'required|string|max:20',
            'email'           => 'nullable|email|max:200',
            'opening_balance' => 'nullable|numeric',
            'company_web'     => 'nullable|string|max:200',
            'company_facebook'=> 'nullable|string|max:200',
            'vat_reg_no'      => 'nullable|string|max:100',
            'terms_conditions'=> 'nullable|string|max:3000',
            'company_logo'    => 'nullable|file|mimes:jpg,jpeg,png,svg|max:2048',
            'invoice_logo'    => 'nullable|file|mimes:jpg,jpeg,png,svg|max:2048',
        ]);

        // Load existing data
        $existing = [];
        if (Storage::exists($this->filePath)) {
            $existing = json_decode(Storage::get($this->filePath), true) ?? [];
        }

        $data = [
            'company_name'     => $request->company_name,
            'company_address'  => $request->company_address,
            'mobile'           => $request->mobile,
            'email'            => $request->email,
            'opening_balance'  => $request->opening_balance ?? '0.00',
            'company_web'      => $request->company_web,
            'company_facebook' => $request->company_facebook,
            'vat_reg_no'       => $request->vat_reg_no,
            'terms_conditions' => $request->terms_conditions,
            'company_logo'     => $existing['company_logo'] ?? null,
            'invoice_logo'     => $existing['invoice_logo'] ?? null,
        ];

        // Handle company_logo upload
        if ($request->hasFile('company_logo')) {
            // Delete old file
            if (!empty($existing['company_logo'])) {
                Storage::delete('public/' . $existing['company_logo']);
            }
            $path = $request->file('company_logo')->store('logos', 'public');
            $data['company_logo'] = $path;
        }

        // Handle invoice_logo upload
        if ($request->hasFile('invoice_logo')) {
            if (!empty($existing['invoice_logo'])) {
                Storage::delete('public/' . $existing['invoice_logo']);
            }
            $path = $request->file('invoice_logo')->store('logos', 'public');
            $data['invoice_logo'] = $path;
        }

        Storage::put($this->filePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Attach public URLs
        $data['company_logo_url'] = $data['company_logo']
            ? url('storage/' . $data['company_logo'])
            : null;
        $data['invoice_logo_url'] = $data['invoice_logo']
            ? url('storage/' . $data['invoice_logo'])
            : null;

        return $this->successResponse($data, 'Company profile updated successfully.');
    }
}
