<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductSupplierLinkRequest;
use App\Models\AuditLog;
use App\Models\Product;
use App\Models\ProductSupplierLink;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductSupplierLinkController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of linked suppliers for a product.
     */
    public function index(int $id): JsonResponse
    {
        $product = Product::findOrFail($id);

        $links = $product->supplierLinks()
            ->with('supplier:id,supplier_code,name,phone')
            ->orderBy('priority_rank', 'asc')
            ->get();

        return $this->successResponse($links, "Supplier links for product {$product->name} retrieved successfully.");
    }

    /**
     * Store a newly created product-supplier link.
     */
    public function store(ProductSupplierLinkRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('products:edit') && !$request->user()->can('products:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $product = Product::findOrFail($id);

        $link = ProductSupplierLink::create([
            'product_id'       => $product->id,
            'supplier_id'      => $request->supplier_id,
            'priority_rank'    => $request->priority_rank,
            'cost_price'       => $request->cost_price,
            'min_billing_sqft' => $request->min_billing_sqft,
            'created_by'       => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'ProductSupplierLink',
            'reference_id'     => $link->id,
            'reference_number' => "Product:{$product->id}-Supplier:{$request->supplier_id}",
            'new_value'        => $link->toArray(),
            'description'      => "Linked supplier ID {$request->supplier_id} to product {$product->product_code} with priority {$request->priority_rank}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($link->load('supplier'), 'Supplier linked to product successfully.', 201);
    }

    /**
     * Update the specified product-supplier link.
     */
    public function update(ProductSupplierLinkRequest $request, int $productId, int $id): JsonResponse
    {
        if (!$request->user()->can('products:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $link = ProductSupplierLink::where('product_id', $productId)->findOrFail($id);
        $oldValue = $link->toArray();

        $link->update([
            'supplier_id'      => $request->supplier_id,
            'priority_rank'    => $request->priority_rank,
            'cost_price'       => $request->cost_price,
            'min_billing_sqft' => $request->min_billing_sqft,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'update',
            'module'           => 'ProductSupplierLink',
            'reference_id'     => $link->id,
            'reference_number' => "Product:{$productId}-Supplier:{$request->supplier_id}",
            'old_value'        => $oldValue,
            'new_value'        => $link->toArray(),
            'description'      => "Updated product-supplier link ID {$link->id}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($link->load('supplier'), 'Product-supplier link updated successfully.');
    }

    /**
     * Remove the specified product-supplier link.
     */
    public function destroy(Request $request, int $productId, int $id): JsonResponse
    {
        if (!$request->user()->can('products:edit')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $link = ProductSupplierLink::where('product_id', $productId)->findOrFail($id);
        $oldValue = $link->toArray();

        $link->delete();

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'delete',
            'module'           => 'ProductSupplierLink',
            'reference_id'     => $id,
            'reference_number' => "Product:{$productId}-Supplier:{$link->supplier_id}",
            'old_value'        => $oldValue,
            'new_value'        => null,
            'description'      => "Removed supplier link ID {$id} from product ID {$productId}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse(null, 'Product-supplier link removed successfully.');
    }
}
