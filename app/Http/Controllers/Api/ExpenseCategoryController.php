<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseCategoryRequest;
use App\Models\AuditLog;
use App\Models\ExpenseCategory;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpenseCategoryController extends Controller
{
    use ApiResponse;

    /**
     * Display a listing of expense categories.
     */
    public function index(Request $request): JsonResponse
    {
        $categories = ExpenseCategory::with('creator:id,name')
            ->when(!$request->boolean('include_archived'), function ($q) {
                $q->active();
            })
            ->latest()
            ->get();

        return $this->successResponse($categories, 'Expense categories retrieved successfully.');
    }

    /**
     * Store a newly created expense category.
     */
    public function store(ExpenseCategoryRequest $request): JsonResponse
    {
        if (!$request->user()->can('expenses:create') && !$request->user()->can('settings:manage')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = ExpenseCategory::create([
            'name'        => $request->name,
            'description' => $request->description,
            'created_by'  => $request->user()->id,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'create',
            'module'           => 'ExpenseCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'new_value'        => $category->toArray(),
            'description'      => "Created expense category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category, 'Expense category created successfully.', 201);
    }

    /**
     * Update the specified expense category.
     */
    public function update(ExpenseCategoryRequest $request, int $id): JsonResponse
    {
        if (!$request->user()->can('expenses:create') && !$request->user()->can('settings:manage')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = ExpenseCategory::findOrFail($id);
        $oldValue = $category->toArray();

        $category->update([
            'name'        => $request->name,
            'description' => $request->description,
        ]);

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'update',
            'module'           => 'ExpenseCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'old_value'        => $oldValue,
            'new_value'        => $category->toArray(),
            'description'      => "Updated expense category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category, 'Expense category updated successfully.');
    }

    /**
     * Archive the specified expense category.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if (!$request->user()->can('settings:manage')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

        $category = ExpenseCategory::findOrFail($id);
        $oldValue = $category->toArray();

        $category->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        AuditLog::create([
            'user_id'          => $request->user()->id,
            'user_name'        => $request->user()->name,
            'action_type'      => 'archive',
            'module'           => 'ExpenseCategory',
            'reference_id'     => $category->id,
            'reference_number' => $category->name,
            'old_value'        => $oldValue,
            'new_value'        => $category->fresh()->toArray(),
            'description'      => "Archived expense category: {$category->name}",
            'ip_address'       => $request->ip(),
            'user_agent'       => $request->userAgent(),
        ]);

        return $this->successResponse($category->fresh(), 'Expense category archived successfully.');
    }
}
