<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductCategory;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Http\Requests\StoreProductCategoryRequest;
use App\Http\Requests\UpdateProductCategoryRequest;

class ProductCategoryController extends Controller
{
    use ApiResponse;

    public function index(Request $request): JsonResponse
    {
        $categories = ProductCategory::when(!$request->boolean('include_archived'), function ($q) {
            $q->active();
        })
        ->latest()
        ->get();

        return $this->successResponse($categories, 'Product categories retrieved successfully.');
    }

    public function store(StoreProductCategoryRequest $request): JsonResponse
    {

        $category = ProductCategory::create([
            'name'        => $request->name,
            'description' => $request->description,
            'created_by'  => $request->user()->id,
        ]);

        return $this->successResponse($category, 'Product category created successfully.', 201);
    }

    public function update(UpdateProductCategoryRequest $request, int $id): JsonResponse
    {

        $category = ProductCategory::findOrFail($id);
        $category->update([
            'name'        => $request->name,
            'description' => $request->description,
        ]);

        return $this->successResponse($category, 'Product category updated successfully.');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $category = ProductCategory::findOrFail($id);
        $category->archive($request->user()->id, $request->input('archive_reason', 'Archived via API'));

        return $this->successResponse($category->fresh(), 'Product category archived successfully.');
    }
}
