<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CustomerCategoryRequest;
use App\Models\AuditLog;
use App\Models\CustomerCategory;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerCategoryController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of customer categories.
     */
    public function index(Request $request): JsonResponse
    {
        $categories = CustomerCategory::with('creator:id,name')
            ->when(!$request->boolean('include_archived'), function ($q) {
                $q->active();
            })
            ->latest()
            ->get();

        return $this->successResponse($categories, 'Customer categories retrieved successfully.');
    }

    /**
     * Store a newly created customer category in storage.
     */
    public function store(CustomerCategoryRequest $request): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = CustomerCategory::create([
            'name'        => $request->name,
            'description' => $request->description,
            'created_by'  => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'CustomerCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'new_value'        => $category->toArray(),
            'description'      => "Created customer category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category, 'Customer category created successfully.', 201);
    }

    /**
     * Update the specified customer category in storage.
     */
    public function update(CustomerCategoryRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = CustomerCategory::findOrFail($id);
        $oldValue = $category->toArray();

        $category->update([
            'name'        => $request->name,
            'description' => $request->description,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'update',
            'module'           => 'CustomerCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'old_value'        => $oldValue,
            'new_value'        => $category->toArray(),
            'description'      => "Updated customer category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category, 'Customer category updated successfully.');
    }

    /**
     * Archive the specified customer category.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = CustomerCategory::findOrFail($id);
        $oldValue = $category->toArray();

        $category->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'CustomerCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'old_value'        => $oldValue,
            'new_value'        => $category->fresh()->toArray(),
            'description'      => "Archived customer category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category->fresh(), 'Customer category archived successfully.');
    }

    /**
     * Restore the specified archived customer category.
     */
    public function restore(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('customers:create')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = CustomerCategory::findOrFail($id);
        $oldValue = $category->toArray();

        $category->restore($request->user()->id);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'restore',
            'module'           => 'CustomerCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'old_value'        => $oldValue,
            'new_value'        => $category->fresh()->toArray(),
            'description'      => "Restored customer category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category->fresh(), 'Customer category restored successfully.');
    }
}
