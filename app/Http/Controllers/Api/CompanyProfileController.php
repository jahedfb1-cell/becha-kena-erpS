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

    /** Helper to format public logo URL */
    private function getLogoUrl(?string $path): string
    {
        if (empty($path)) {
            return url('logo-demo.svg');
        }
        
        $filename = basename($path);
        $publicFile = public_path('uploads/logos/' . $filename);
        if (file_exists($publicFile)) {
            return url('uploads/logos/' . $filename);
        }

        // Fallback to storage or fallback controller endpoint
        if (Storage::exists('public/' . $path)) {
            return url('api/company-profile/logo/' . $filename);
        }

        return url('logo-demo.svg');
    }

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
                'favicon'          => null,
            ];
        }

        $data['company_logo_url'] = $this->getLogoUrl($data['company_logo'] ?? null);
        $data['invoice_logo_url'] = $this->getLogoUrl($data['invoice_logo'] ?? null);
        $data['favicon_url']      = $this->getLogoUrl($data['favicon'] ?? null);

        return $this->successResponse($data, 'Company profile loaded.');
    }

    /** GET /api/company-profile/logo/{filename} */
    public function getLogoFile($filename)
    {
        // basename() strips any directory traversal segments (../, ..\) so the
        // lookup can never escape the intended uploads/logos directories.
        $filename = basename($filename);

        $publicPath = public_path('uploads/logos/' . $filename);
        if (file_exists($publicPath)) {
            return response()->file($publicPath);
        }

        $storagePath = storage_path('app/public/logos/' . $filename);
        if (file_exists($storagePath)) {
            return response()->file($storagePath);
        }

        return response()->file(public_path('logo-demo.svg'));
    }

    /** POST /api/company-profile */
    public function update(Request $request)
    {
        if (!$request->user()->can('settings:company_profile')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

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
            // SVG deliberately excluded: it's an active content type (can embed
            // <script>) and would be served back on this origin, enabling stored XSS.
            'company_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'invoice_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'favicon'         => 'nullable|file|mimes:jpg,jpeg,png,ico|max:2048',
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
            'favicon'          => $existing['favicon'] ?? null,
        ];

        // Ensure public/uploads/logos directory exists
        $uploadDir = public_path('uploads/logos');
        if (!file_exists($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }

        // Handle company_logo upload
        if ($request->hasFile('company_logo')) {
            $file = $request->file('company_logo');
            $filename = 'company_logo_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);
            
            // Also keep storage copy for backup
            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            
            $data['company_logo'] = 'logos/' . $filename;
        }

        // Handle invoice_logo upload
        if ($request->hasFile('invoice_logo')) {
            $file = $request->file('invoice_logo');
            $filename = 'invoice_logo_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));

            $data['invoice_logo'] = 'logos/' . $filename;
        }

        // Handle favicon upload
        if ($request->hasFile('favicon')) {
            $file = $request->file('favicon');
            $filename = 'favicon_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));

            $data['favicon'] = 'logos/' . $filename;
        }

        Storage::put($this->filePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Attach public URLs
        $data['company_logo_url'] = $this->getLogoUrl($data['company_logo'] ?? null);
        $data['invoice_logo_url'] = $this->getLogoUrl($data['invoice_logo'] ?? null);
        $data['favicon_url']      = $this->getLogoUrl($data['favicon'] ?? null);

        return $this->successResponse($data, 'Company profile updated successfully.');
    }
}
