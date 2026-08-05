<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class AccessSetupController extends Controller
{
    use ApiResponse;

    /**
     * Structure of Modules, Pages, and Functions for Access Setup Matrix
     */
    protected function getMatrixStructure(): array
    {
        return [
            [
                'id'          => 'products',
                'name'        => 'Products',
                'icon'        => '📦',
                'page'        => 'Product Page',
                'page_permission' => 'products:create',
                'functions'   => [
                    ['key' => 'products:create', 'label' => 'New Product'],
                    ['key' => 'products:edit', 'label' => 'Edit Product'],
                    ['key' => 'products:archive', 'label' => 'Delete / Archive Product'],
                ],
            ],
            [
                'id'          => 'quotations',
                'name'        => 'Quotations',
                'icon'        => '📜',
                'page'        => 'Quotations Page',
                'page_permission' => 'quotations:create',
                'functions'   => [
                    ['key' => 'quotations:create', 'label' => 'New Quotation'],
                    ['key' => 'quotations:edit-own', 'label' => 'Edit Own Quotation'],
                    ['key' => 'quotations:edit-team', 'label' => 'Edit Team Quotation'],
                    ['key' => 'quotations:convert', 'label' => 'Order Convert'],
                    ['key' => 'quotations:approve', 'label' => 'Order Approve'],
                    ['key' => 'quotations:reject', 'label' => 'Order Reject'],
                    ['key' => 'quotations:reassign', 'label' => 'Order Reassign'],
                ],
            ],
            [
                'id'          => 'orders',
                'name'        => 'Orders',
                'icon'        => '🛒',
                'page'        => 'Orders Page',
                'page_permission' => 'orders:view-own',
                'functions'   => [
                    ['key' => 'orders:view-own', 'label' => 'View Own Orders'],
                    ['key' => 'orders:view-team', 'label' => 'View Team Orders'],
                    ['key' => 'orders:view-all', 'label' => 'View All Orders'],
                    ['key' => 'orders:edit-approved', 'label' => 'Edit Approved Orders'],
                ],
            ],
            [
                'id'          => 'purchases',
                'name'        => 'Purchases & Suppliers',
                'icon'        => '🏬',
                'page'        => 'Purchases Page',
                'page_permission' => 'purchase_entries:view',
                'functions'   => [
                    ['key' => 'purchase_entries:view', 'label' => 'View Purchase Entries'],
                    ['key' => 'purchase_entries:create', 'label' => 'New Purchase Entry'],
                    ['key' => 'suppliers:create', 'label' => 'New Supplier'],
                    ['key' => 'suppliers:edit', 'label' => 'Edit Supplier'],
                    ['key' => 'suppliers:archive', 'label' => 'Delete Supplier'],
                ],
            ],
            [
                'id'          => 'invoices',
                'name'        => 'Invoices & Deliveries',
                'icon'        => '📑',
                'page'        => 'Invoices & Challans Page',
                'page_permission' => 'invoices:view',
                'functions'   => [
                    ['key' => 'invoices:view', 'label' => 'View Invoices'],
                    ['key' => 'invoices:generate', 'label' => 'Generate Invoice'],
                    ['key' => 'invoices:archive', 'label' => 'Archive Invoice'],
                    ['key' => 'challans:view', 'label' => 'View Delivery Challans'],
                    ['key' => 'challans:generate', 'label' => 'Generate Delivery Challan'],
                ],
            ],
            [
                'id'          => 'vouchers',
                'name'        => 'Vouchers & Payments',
                'icon'        => '💵',
                'page'        => 'Vouchers & Payments Page',
                'page_permission' => 'payments:create',
                'functions'   => [
                    ['key' => 'payments:create', 'label' => 'Record Payment / Voucher'],
                    ['key' => 'payments:apply-discount', 'label' => 'Apply Discount / Waive-off'],
                    ['key' => 'payments:void', 'label' => 'Void Payment Voucher'],
                    ['key' => 'vouchers:create', 'label' => 'New Voucher'],
                    ['key' => 'vouchers:view', 'label' => 'View Vouchers'],
                    ['key' => 'expenses:create', 'label' => 'New Expense'],
                    ['key' => 'expenses:view', 'label' => 'View Expenses'],
                ],
            ],
            [
                'id'          => 'users',
                'name'        => 'Users & Customers',
                'icon'        => '👥',
                'page'        => 'Users & Customers Page',
                'page_permission' => 'customers:create',
                'functions'   => [
                    ['key' => 'customers:create', 'label' => 'Customer Create'],
                    ['key' => 'customers:view-own', 'label' => 'View Own Customers'],
                    ['key' => 'customers:view-team', 'label' => 'View Team Customers'],
                    ['key' => 'customers:view-all', 'label' => 'View All Customers'],
                ],
            ],
            [
                'id'          => 'complaints',
                'name'        => 'Complaints & Support',
                'icon'        => '⚠️',
                'page'        => 'Complaints Page',
                'page_permission' => 'complaints:create',
                'functions'   => [
                    ['key' => 'complaints:create', 'label' => 'Raise Complaint'],
                    ['key' => 'complaints:resolve', 'label' => 'Resolve Complaint'],
                ],
            ],
            [
                'id'          => 'reports',
                'name'        => 'Reports & Audit Logs',
                'icon'        => '📊',
                'page'        => 'Reports Page',
                'page_permission' => 'reports:view-sales',
                'functions'   => [
                    ['key' => 'reports:view-sales', 'label' => 'Sales Report'],
                    ['key' => 'reports:view-purchase', 'label' => 'Purchase Report'],
                    ['key' => 'reports:view-profit', 'label' => 'Profit / Loss Report'],
                    ['key' => 'reports:view-ledger', 'label' => 'Customer & Supplier Ledger'],
                    ['key' => 'audit_logs:view', 'label' => 'Audit Log View'],
                    ['key' => 'settings:manage', 'label' => 'System Access Setup'],
                ],
            ],
        ];
    }

    /**
     * GET /api/access-setup
     * Retrieve roles, module matrix structure, and current permissions per role.
     */
    public function index(): JsonResponse
    {
        $roles = Role::all();
        $rolePermissions = [];

        foreach ($roles as $role) {
            $rolePermissions[$role->name] = $role->permissions->pluck('name')->toArray();
        }

        // Ensure default roles exist if not yet created
        $defaultRoleNames = ['admin', 'manager', 'salesman', 'supplier', 'customer'];
        foreach ($defaultRoleNames as $roleName) {
            if (!isset($rolePermissions[$roleName])) {
                $rolePermissions[$roleName] = [];
            }
        }

        return $this->successResponse([
            'roles'            => array_keys($rolePermissions),
            'matrix_structure' => $this->getMatrixStructure(),
            'role_permissions' => $rolePermissions,
        ], 'Access setup matrix retrieved successfully.');
    }

    /**
     * POST /api/access-setup/update
     * Update permissions assigned to a specific role.
     */
    public function update(Request $request): JsonResponse
    {
        $request->validate([
            'role'          => 'required|string',
            'permissions'   => 'present|array',
            'permissions.*' => 'string',
        ]);

        $roleName = $request->role;
        $permissionNames = $request->permissions;

        $user = $request->user();

        return DB::transaction(function () use ($roleName, $permissionNames, $user) {
            $role = Role::findOrCreate($roleName);

            // Ensure all requested permission names exist in Permission table
            foreach ($permissionNames as $permName) {
                Permission::findOrCreate($permName);
            }

            $oldPermissions = $role->permissions->pluck('name')->toArray();

            // Sync permissions for this role
            $role->syncPermissions($permissionNames);

            AuditLog::record(
                $user->id,
                $user->name,
                'update',
                Role::class,
                $role->id,
                ['permissions' => $oldPermissions],
                ['permissions' => $permissionNames],
                "Updated Access Setup permissions for role '{$roleName}'"
            );

            return $this->successResponse([
                'role'        => $roleName,
                'permissions' => $permissionNames,
            ], "Permissions for role '{$roleName}' updated successfully.");
        });
    }
}
