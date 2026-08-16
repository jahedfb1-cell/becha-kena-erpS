<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Traits\ApiResponse;

class CompanyProfileController extends Controller
{
    use ApiResponse;

    /**
     * Resolves which brand's profile a request is talking about.
     *
     * The Settings page passes an explicit brand_id (its brand tabs), while
     * everything else — the dashboard title, the favicon — just wants "my"
     * branding, so an absent parameter falls back to the caller's own brand.
     * An unknown or inactive id falls back to the default rather than 404ing,
     * because a missing logo should never take the whole settings page down.
     */
    private function resolveBrandId(Request $request): int
    {
        $requested = $request->input('brand_id', $request->query('brand_id'));

        if ($requested !== null && Brand::whereKey((int) $requested)->exists()) {
            return (int) $requested;
        }

        return Brand::resolveIdFor($request->user());
    }

    /**
     * Settings file path for a brand (stored under storage/app/).
     *
     * Brand 1 keeps the original unsuffixed `company_profile.json`: that file
     * already holds the live Dhaka Blinds settings, and moving it would reset
     * the profile to defaults on the next load.
     */
    private function filePathFor(int $brandId): string
    {
        return Brand::profilePath($brandId);
    }

    /**
     * Mirrors a file written under public_path() into the real web root too.
     *
     * On this app's Hostinger deploy, `public_path()` resolves to
     * `laravel_app/public/` — a copy of the public folder that only exists
     * for Laravel's own routing needs. The site is actually served from a
     * sibling `public_html/` folder, kept in sync with `laravel_app/public/`
     * by the deploy script. A file this controller writes at runtime (an
     * uploaded logo) never goes through that deploy step, so without this it
     * silently 404s on the live site until someone happens to redeploy.
     *
     * `services.public_html_path` is unset in every other environment, so
     * this is a no-op there — the whole method just doesn't run.
     */
    private function mirrorToPublicHtml(string $absoluteSourcePath, string $relativePath): void
    {
        $target = config('services.public_html_path');
        if (!$target || !is_dir($target)) {
            return;
        }

        $destination = rtrim($target, '/\\') . '/' . ltrim($relativePath, '/\\');
        $destDir = dirname($destination);
        if (!is_dir($destDir)) {
            @mkdir($destDir, 0777, true);
        }

        @copy($absoluteSourcePath, $destination);
    }

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

    /**
     * Starting values for a brand that has never been saved.
     *
     * Western Blinds' details come from the legacy CodeIgniter database this
     * system replaces, so its first print already carries the right address
     * and contact block — only the logo image still needs uploading.
     */
    private function defaultsFor(int $brandId): array
    {
        $shared = [
            'opening_balance'     => '0.00',
            'company_facebook'    => '',
            'vat_reg_no'          => '',
            'company_logo'        => null,
            'invoice_logo'        => null,
            'receipt_logo'        => null,
            'favicon'             => null,
            'app_icon'            => null,
            'receipt_qr_template' => "Receipt: {payment_no}\nCustomer: {customer}\nAmount: {amount}\nVerify: {url}",
        ];

        if ($brandId === Brand::DEFAULT_ID) {
            return $shared + [
                'company_name'      => 'Dhaka Blinds',
                'company_address'   => '1, Indira Road, (3rd Floor) Farmgate, Dhaka-1215, Bangladesh,.',
                'office_address'    => 'Chowrangi Super Market, (3rd Floor), 1, Indira Road, Farmgate, Dhaka -1215',
                'footer_name'       => 'Dhaka Blinds',
                'cheque_favour_name'=> 'Dhaka Blinds',
                'mobile'            => '01629000200',
                'email'             => 'dhakablinds@gmail.com',
                'company_web'       => 'www.dhakablinds.com',
                'browser_title'     => 'Dhaka Blinds - ERP & IMS Portal',
                'terms_conditions'  => "You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.\nPlease make your payment by cash or cheque in favour of \"Dhaka Blinds\" we hope you'll find ours rates reasonable and place an order with us.",
            ];
        }

        $brandName = Brand::find($brandId)?->name ?? 'Company';

        if ($brandId === 2) {
            return $shared + [
                'company_name'      => 'Western Blinds Ltd',
                'company_address'   => 'House: 300, (1st Floor), Road: Shadhinata Shoroni, Uttar Badda, Dhaka-1212',
                'office_address'    => 'House: 300, (1st Floor), Road: Shadhinata Shoroni, Uttar Badda, Dhaka -1212',
                'footer_name'       => 'Western Blinds Ltd',
                'cheque_favour_name'=> 'Western Blinds Ltd',
                'mobile'            => '01718040323',
                'email'             => 'westernblindltd@gmail.com',
                'company_web'       => 'www.westernblindsltd.com',
                'browser_title'     => 'Western Blinds Ltd - ERP & IMS Portal',
                'terms_conditions'  => "You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.\nPlease make your payment by cash or cheque in favour of \"Western Blinds Ltd\" we hope you'll find ours rates reasonable and place an order with us.",
            ];
        }

        return $shared + [
            'company_name'      => $brandName,
            'company_address'   => '',
            'office_address'    => '',
            'footer_name'       => $brandName,
            'cheque_favour_name'=> $brandName,
            'mobile'            => '',
            'email'             => '',
            'company_web'       => '',
            'browser_title'     => $brandName . ' - ERP & IMS Portal',
            'terms_conditions'  => '',
        ];
    }

    /** GET /api/brands — brand list for the Settings page tabs. */
    public function brands()
    {
        return $this->successResponse(
            Brand::where('is_active', true)->orderBy('id')->get(['id', 'name', 'short_name', 'is_default']),
            'Brands loaded.'
        );
    }

    /** GET /api/company-profile?brand_id= */
    public function show(Request $request)
    {
        $brandId  = $this->resolveBrandId($request);
        $defaults = $this->defaultsFor($brandId);

        $path = $this->filePathFor($brandId);
        $data = Storage::exists($path)
            ? (json_decode(Storage::get($path), true) ?: [])
            : [];

        // Saved values win, but any key the saved file predates (office_address
        // and the two name fields were added with brand support) falls back to
        // this brand's defaults instead of coming back empty on the printout.
        $data = array_filter($data, fn ($v) => $v !== null && $v !== '') + $defaults;

        $data['brand_id']   = $brandId;
        $data['brand_name'] = Brand::find($brandId)?->name ?? $data['company_name'];

        $data['company_logo_url'] = $this->getLogoUrl($data['company_logo'] ?? null);
        $data['invoice_logo_url'] = $this->getLogoUrl($data['invoice_logo'] ?? null);
        $data['receipt_logo_url'] = $this->getLogoUrl($data['receipt_logo'] ?? null);
        $data['favicon_url']      = $this->getLogoUrl($data['favicon'] ?? null);
        $data['app_icon_url']     = $this->getLogoUrl($data['app_icon'] ?? null);

        // Home-screen icons are a single set shared by the installed app, so
        // only the default brand drives them — otherwise whichever brand's
        // settings page loaded last would silently rewrite everyone's icon.
        if ($brandId === Brand::DEFAULT_ID) {
            $this->syncAppIcons($data['app_icon'] ?? null, $data['company_logo'] ?? null);
        }

        return $this->successResponse($data, 'Company profile loaded.');
    }

    /**
     * Syncs the PWA/APK home-screen icon files.
     *
     * A dedicated app icon (usually a square, transparent-background mark)
     * is what these icons actually need — a wide banner-shaped company logo
     * gets awkwardly cropped/padded when forced into a square. Prefers an
     * explicitly uploaded app_icon; falls back to the company logo so
     * accounts that never set a dedicated icon keep the icon they had
     * before this field existed.
     */
    private function syncAppIcons(?string $appIconRelativePath, ?string $logoRelativePath): void
    {
        $targetLogo = null;
        foreach ([$appIconRelativePath, $logoRelativePath] as $candidate) {
            if (!$candidate) {
                continue;
            }
            $path = public_path('uploads/logos/' . basename($candidate));
            if (file_exists($path)) {
                $targetLogo = $path;
                break;
            }
        }

        // If neither is found, fall back to whatever app icon or company logo
        // was last uploaded (covers a stale/renamed reference in the JSON).
        //
        // The patterns are pinned to the default brand — uploads are named
        // `<kind>_b<brandId>_...`, so an unqualified `app_icon_*` glob would
        // happily match a Western Blinds upload and push that onto every
        // installed app's home screen. The trailing `_[0-9]*` alternatives
        // match logos uploaded before brand support added the `_b<id>` part.
        if (!$targetLogo) {
            $logoDir = public_path('uploads/logos');
            if (file_exists($logoDir)) {
                $patterns = [
                    '/app_icon_b' . Brand::DEFAULT_ID . '_*',
                    '/company_logo_b' . Brand::DEFAULT_ID . '_*',
                    '/app_icon_[0-9]*',
                    '/company_logo_[0-9]*',
                ];
                foreach ($patterns as $pattern) {
                    $files = glob($logoDir . $pattern) ?: [];
                    if (!empty($files)) {
                        $targetLogo = $files[0];
                        break;
                    }
                }
            }
        }

        if ($targetLogo && file_exists($targetLogo)) {
            $destinations = [
                public_path('pwa-192x192.png'),
                public_path('pwa-512x512.png'),
                public_path('apple-touch-icon.png'),
                base_path('frontend/public/pwa-192x192.png'),
                base_path('frontend/public/pwa-512x512.png'),
                base_path('frontend/public/apple-touch-icon.png'),
            ];
            foreach ($destinations as $dest) {
                @copy($targetLogo, $dest);
            }

            // These are served straight from the web root, same split-folder
            // issue as the logo uploads themselves — see mirrorToPublicHtml().
            $this->mirrorToPublicHtml($targetLogo, 'pwa-192x192.png');
            $this->mirrorToPublicHtml($targetLogo, 'pwa-512x512.png');
            $this->mirrorToPublicHtml($targetLogo, 'apple-touch-icon.png');
        }
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
            'brand_id'        => 'nullable|exists:brands,id',
            'company_name'    => 'required|string|max:200',
            'company_address' => 'required|string|max:500',
            'office_address'  => 'nullable|string|max:500',
            'footer_name'     => 'nullable|string|max:200',
            'cheque_favour_name' => 'nullable|string|max:200',
            'mobile'          => 'required|string|max:20',
            'email'           => 'nullable|email|max:200',
            'opening_balance' => 'nullable|numeric',
            'company_web'     => 'nullable|string|max:200',
            'company_facebook'=> 'nullable|string|max:200',
            'vat_reg_no'      => 'nullable|string|max:100',
            'terms_conditions'=> 'nullable|string|max:3000',
            'receipt_qr_template' => 'nullable|string|max:1000',
            // SVG deliberately excluded: it's an active content type (can embed
            // <script>) and would be served back on this origin, enabling stored XSS.
            'company_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'invoice_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'receipt_logo'    => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'favicon'         => 'nullable|file|mimes:jpg,jpeg,png,ico|max:2048',
            'app_icon'        => 'nullable|file|mimes:jpg,jpeg,png|max:5120',
            'browser_title'   => 'nullable|string|max:200',
        ]);

        $brandId  = $this->resolveBrandId($request);
        $filePath = $this->filePathFor($brandId);
        $defaults = $this->defaultsFor($brandId);

        // Load existing data
        $existing = [];
        if (Storage::exists($filePath)) {
            $existing = json_decode(Storage::get($filePath), true) ?? [];
        }

        $data = [
            'company_name'     => $request->company_name,
            'company_address'  => $request->company_address,
            // These three drive the printed header line and the signature /
            // cheque-payee names. Blank falls back to this brand's default so
            // a printout never loses its address because a field was cleared.
            'office_address'   => $request->office_address ?: $defaults['office_address'],
            'footer_name'      => $request->footer_name ?: $request->company_name,
            'cheque_favour_name' => $request->cheque_favour_name ?: $request->company_name,
            'mobile'           => $request->mobile,
            'email'            => $request->email,
            'opening_balance'  => $request->opening_balance ?? '0.00',
            'company_web'      => $request->company_web,
            'company_facebook' => $request->company_facebook,
            'vat_reg_no'       => $request->vat_reg_no,
            'terms_conditions' => $request->terms_conditions,
            'receipt_qr_template' => $request->receipt_qr_template,
            'browser_title'    => $request->browser_title ?: $defaults['browser_title'],
            'company_logo'     => $existing['company_logo'] ?? null,
            'invoice_logo'     => $existing['invoice_logo'] ?? null,
            'receipt_logo'     => $existing['receipt_logo'] ?? null,
            'favicon'          => $existing['favicon'] ?? null,
            'app_icon'         => $existing['app_icon'] ?? null,
        ];

        // Ensure public/uploads/logos directory exists
        $uploadDir = public_path('uploads/logos');
        if (!file_exists($uploadDir)) {
            @mkdir($uploadDir, 0777, true);
        }

        // Handle company_logo upload
        if ($request->hasFile('company_logo')) {
            $file = $request->file('company_logo');
            $filename = 'company_logo_b' . $brandId . '_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            // Also keep storage copy for backup
            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            $this->mirrorToPublicHtml($uploadDir . '/' . $filename, 'uploads/logos/' . $filename);

            $data['company_logo'] = 'logos/' . $filename;
        }

        // Handle invoice_logo upload
        if ($request->hasFile('invoice_logo')) {
            $file = $request->file('invoice_logo');
            $filename = 'invoice_logo_b' . $brandId . '_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            $this->mirrorToPublicHtml($uploadDir . '/' . $filename, 'uploads/logos/' . $filename);

            $data['invoice_logo'] = 'logos/' . $filename;
        }

        // Handle receipt_logo upload
        if ($request->hasFile('receipt_logo')) {
            $file = $request->file('receipt_logo');
            $filename = 'receipt_logo_b' . $brandId . '_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            $this->mirrorToPublicHtml($uploadDir . '/' . $filename, 'uploads/logos/' . $filename);

            $data['receipt_logo'] = 'logos/' . $filename;
        }

        // Handle favicon upload
        if ($request->hasFile('favicon')) {
            $file = $request->file('favicon');
            $filename = 'favicon_b' . $brandId . '_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            $this->mirrorToPublicHtml($uploadDir . '/' . $filename, 'uploads/logos/' . $filename);

            $data['favicon'] = 'logos/' . $filename;
        }

        // Handle app_icon upload (PWA / APK home-screen icon)
        if ($request->hasFile('app_icon')) {
            $file = $request->file('app_icon');
            $filename = 'app_icon_b' . $brandId . '_' . time() . '_' . uniqid() . '.' . $file->getClientOriginalExtension();
            $file->move($uploadDir, $filename);

            @copy($uploadDir . '/' . $filename, storage_path('app/public/logos/' . $filename));
            $this->mirrorToPublicHtml($uploadDir . '/' . $filename, 'uploads/logos/' . $filename);

            $data['app_icon'] = 'logos/' . $filename;
        }

        Storage::put($filePath, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        $data['brand_id']   = $brandId;
        $data['brand_name'] = Brand::find($brandId)?->name ?? $data['company_name'];

        // Attach public URLs
        $data['company_logo_url'] = $this->getLogoUrl($data['company_logo'] ?? null);
        $data['invoice_logo_url'] = $this->getLogoUrl($data['invoice_logo'] ?? null);
        $data['receipt_logo_url'] = $this->getLogoUrl($data['receipt_logo'] ?? null);
        $data['favicon_url']      = $this->getLogoUrl($data['favicon'] ?? null);
        $data['app_icon_url']     = $this->getLogoUrl($data['app_icon'] ?? null);

        // Only the default brand owns the installed app's home-screen icons —
        // see the matching guard in show().
        if ($brandId === Brand::DEFAULT_ID) {
            $this->syncAppIcons($data['app_icon'] ?? null, $data['company_logo'] ?? null);
        }

        return $this->successResponse($data, 'Company profile updated successfully.');
    }

}
