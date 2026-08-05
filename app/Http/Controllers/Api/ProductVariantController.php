<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductVariantRequest;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductVariantController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of variants for a product.
     */
    public function index(Request $request, int $id): JsonResponse
    {
        $product = Product::findOrFail($id);

        $variants = $product->variants()
            ->when(!$request->boolean('include_archived'), function ($q) {
                $q->active();
            })
            ->latest()
            ->get();

        return $this->successResponse($variants, "Variants for product {$product->name} retrieved successfully.");
    }

    /**
     * Store a newly created variant for a product.
     */
    public function store(ProductVariantRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('products:create') && !$request->user()->can('products:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $product = Product::findOrFail($id);

        $variant = ProductVariant::create([
            'product_id'   => $product->id,
            'variant_name' => $request->variant_name,
            'created_by'   => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'ProductVariant',
            'reference_id'     => $variant->id,
            'reference_number' => $variant->variant_name,
            'new_value'        => $variant->toArray(),
            'description'      => "Added variant {$variant->variant_name} to product {$product->product_code}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($variant, 'Product variant created successfully.', 201);
    }

    /**
     * Update the specified product variant.
     */
    public function update(ProductVariantRequest $request, int $productId, int $id): JsonResponse
    {
        if (!$request->user()->can('products:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $variant = ProductVariant::where('product_id', $productId)->findOrFail($id);
        $oldValue = $variant->toArray();

        $variant->update([
            'variant_name' => $request->variant_name,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'update',
            'module'           => 'ProductVariant',
            'reference_id'     => $variant->id,
            'reference_number' => $variant->variant_name,
            'old_value'        => $oldValue,
            'new_value'        => $variant->toArray(),
            'description'      => "Updated variant {$variant->variant_name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($variant, 'Product variant updated successfully.');
    }

    /**
     * Archive the specified product variant.
     */
    public function destroy(Request $request, int $productId, int $id): JsonResponse
    {
        if (!$request->user()->can('products:archive')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $variant = ProductVariant::where('product_id', $productId)->findOrFail($id);
        $oldValue = $variant->toArray();

        $variant->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'ProductVariant',
            'reference_id'     => $variant->id,
            'reference_number' => $variant->variant_name,
            'old_value'        => $oldValue,
            'new_value'        => $variant->fresh()->toArray(),
            'description'      => "Archived variant {$variant->variant_name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($variant->fresh(), 'Product variant archived successfully.');
    }
}
