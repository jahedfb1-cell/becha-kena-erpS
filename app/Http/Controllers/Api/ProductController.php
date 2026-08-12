<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductRequest;
use App\Models\AuditLog;
use App\Models\Product;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of products.
     */
    public function index(Request $request): JsonResponse
    {
        $products = Product::select('id', 'product_code', 'name', 'unit', 'product_category_id', 'default_unit_price', 'product_size', 'details', 'is_archived', 'created_at')
            ->with([
                'category:id,name',
                'variants',
                'supplierLinks' => function ($q) {
                    $q->select('id', 'product_id', 'supplier_id', 'priority_rank', 'cost_price', 'min_billing_sqft');
                },
                'supplierLinks.supplier:id,name,supplier_code'
            ])
            ->when(!$request->boolean('include_archived'), function ($q) {
                $q->active();
            })
            ->latest()
            ->get();

        return $this->successResponse($products, 'Products retrieved successfully.');
    }

    /**
     * Store a newly created product (product_code provided manually by Admin).
     */
    public function store(ProductRequest $request): JsonResponse
    {
        if (!$request->user()->can('products:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        return \Illuminate\Support\Facades\DB::transaction(function () use ($request) {
            $product = Product::create([
                'product_code'        => $request->product_code,
                'name'                => $request->name,
                'unit'                => $request->unit ?? 'sqft',
                'product_category_id' => $request->product_category_id,
                'default_unit_price'  => $request->default_unit_price,
                'product_size'        => $request->product_size,
                'details'             => $request->details,
                'created_by'          => $request->user()->id,
            ]);

            // Save supplier links if provided
            if ($request->has('supplier_links') && is_array($request->supplier_links)) {
                foreach ($request->supplier_links as $idx => $linkData) {
                    if (empty($linkData['supplier_id'])) continue;
                    \App\Models\ProductSupplierLink::create([
                        'product_id'       => $product->id,
                        'supplier_id'      => $linkData['supplier_id'],
                        'priority_rank'    => $linkData['priority_rank'] ?? ($idx + 1),
                        'cost_price'       => $linkData['cost_price'] ?? 0,
                        'min_billing_sqft' => (isset($linkData['min_billing_sqft']) && $linkData['min_billing_sqft'] !== '') ? $linkData['min_billing_sqft'] : 10,
                        'created_by'       => $request->user()->id,
                    ]);
                }
            }

            AuditLog::create([
                'user_id'          => $request->user()->id,
                'user_name'        => $request->user()->name,
                'action_type'      => 'create',
                'module'           => 'Product',
                'reference_id'     => $product->id,
                'reference_number' => $product->product_code,
                'new_value'        => $product->toArray(),
                'description'      => "Created product {$product->name} with code {$product->product_code}",
                'ip_address'       => $request->ip(),
                'user_agent'       => $request->userAgent(),
            ]);

            return $this->successResponse(
                $product->load(['category', 'supplierLinks.supplier']),
                'Product created successfully.',
                201
            );
        });
    }

    /**
     * Display the specified product with variants and supplier links.
     */
    public function show(int $id): JsonResponse
    {
        $product = Product::with(['category', 'variants', 'supplierLinks.supplier', 'creator'])->findOrFail($id);

        return $this->successResponse($product, 'Product details retrieved successfully.');
    }

    /**
     * Update the specified product.
     */
    public function update(ProductRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('products:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $product = Product::findOrFail($id);

        return \Illuminate\Support\Facades\DB::transaction(function () use ($request, $product) {
            $oldValue = $product->toArray();

            $product->update([
                'product_code'        => $request->product_code,
                'name'                => $request->name,
                'unit'                => $request->unit ?? 'sqft',
                'product_category_id' => $request->product_category_id,
                'default_unit_price'  => $request->default_unit_price,
                'product_size'        => $request->product_size,
                'details'             => $request->details,
            ]);

            // Sync supplier links if provided
            if ($request->has('supplier_links') && is_array($request->supplier_links)) {
                // Delete existing links not in payload or refresh
                $product->supplierLinks()->delete();
                foreach ($request->supplier_links as $idx => $linkData) {
                    if (empty($linkData['supplier_id'])) continue;
                    \App\Models\ProductSupplierLink::create([
                        'product_id'       => $product->id,
                        'supplier_id'      => $linkData['supplier_id'],
                        'priority_rank'    => $linkData['priority_rank'] ?? ($idx + 1),
                        'cost_price'       => $linkData['cost_price'] ?? 0,
                        'min_billing_sqft' => (isset($linkData['min_billing_sqft']) && $linkData['min_billing_sqft'] !== '') ? $linkData['min_billing_sqft'] : 10,
                        'created_by'       => $request->user()->id,
                    ]);
                }
            }

            AuditLog::create([
                'user_id'          => $request->user()->id,
                'user_name'        => $request->user()->name,
                'action_type'      => 'update',
                'module'           => 'Product',
                'reference_id'     => $product->id,
                'reference_number' => $product->product_code,
                'old_value'        => $oldValue,
                'new_value'        => $product->fresh()->toArray(),
                'description'      => "Updated product {$product->product_code}",
                'ip_address'       => $request->ip(),
                'user_agent'       => $request->userAgent(),
            ]);

            return $this->successResponse(
                $product->fresh()->load(['category', 'supplierLinks.supplier']),
                'Product updated successfully.'
            );
        });
    }

    /**
     * Archive the specified product.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('products:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $product = Product::findOrFail($id);
        $oldValue = $product->toArray();

        $product->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'Product',
            'reference_id'     => $product->id,
            'reference_number' => $product->product_code,
            'old_value'        => $oldValue,
            'new_value'        => $product->fresh()->toArray(),
            'description'      => "Archived product {$product->product_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($product->fresh(), 'Product archived successfully.');
    }

    /**
     * Restore the specified archived product.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('products:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $product = Product::findOrFail($id);
        $oldValue = $product->toArray();

        $product->restore($request->user()->id);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'restore',
            'module'           => 'Product',
            'reference_id'     => $product->id,
            'reference_number' => $product->product_code,
            'old_value'        => $oldValue,
            'new_value'        => $product->fresh()->toArray(),
            'description'      => "Restored product {$product->product_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($product->fresh(), 'Product restored successfully.');
    }
}
