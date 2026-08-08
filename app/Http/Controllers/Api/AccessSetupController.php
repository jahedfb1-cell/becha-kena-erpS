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
                'id'          => 'sales',
                'name'        => 'Sales & Quotations',
                'icon'        => '📜',
                'page'        => 'Quotations & Orders',
                'page_permission' => 'quotations:create',
                'functions'   => [
                    ['key' => 'quotations:create', 'label' => 'New Quotation'],
                    ['key' => 'quotations:edit-own', 'label' => 'Edit Own Quotation'],
                    ['key' => 'quotations:edit-team', 'label' => 'Edit Team Quotation'],
                    ['key' => 'quotations:convert', 'label' => 'Convert to Order'],
                    ['key' => 'quotations:approve', 'label' => 'Approve Order'],
                    ['key' => 'quotations:reject', 'label' => 'Reject Order'],
                    ['key' => 'quotations:reassign', 'label' => 'Reassign Order'],
                    ['key' => 'orders:view-own', 'label' => 'View Own Orders'],
                    ['key' => 'orders:view-team', 'label' => 'View Team Orders'],
                    ['key' => 'orders:view-all', 'label' => 'View All Orders'],
                ],
            ],
            [
                'id'          => 'products',
                'name'        => 'Products & Stock',
                'icon'        => '📦',
                'page'        => 'Products Page',
                'page_permission' => 'products:view',
                'functions'   => [
                    ['key' => 'products:view', 'label' => 'View Products'],
                    ['key' => 'products:create', 'label' => 'New Product'],
                    ['key' => 'products:edit', 'label' => 'Edit Product'],
                    ['key' => 'products:archive', 'label' => 'Delete / Archive Product'],
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
                'name'        => 'Vouchers',
                'icon'        => '📄',
                'page'        => 'Vouchers Page',
                'page_permission' => 'vouchers:view',
                'functions'   => [
                    ['key' => 'vouchers:view', 'label' => 'View Vouchers'],
                    ['key' => 'vouchers:create', 'label' => 'Create New Voucher'],
                    ['key' => 'vouchers:approve', 'label' => 'Approve Voucher'],
                    ['key' => 'expenses:create', 'label' => 'New Expense Entry'],
                    ['key' => 'expenses:view', 'label' => 'View Expenses List'],
                ],
            ],
            [
                'id'          => 'payments',
                'name'        => 'Payments',
                'icon'        => '💵',
                'page'        => 'Payments Page',
                'page_permission' => 'payments:create',
                'functions'   => [
                    ['key' => 'payments:create', 'label' => 'Record Payment / Receive'],
                    ['key' => 'payments:apply-discount', 'label' => 'Apply Discount / Waive-off'],
                    ['key' => 'payments:void', 'label' => 'Void Payment Voucher'],
                ],
            ],
            [
                'id'          => 'salary',
                'name'        => 'Salary',
                'icon'        => '💰',
                'page'        => 'Salary & Payroll Page',
                'page_permission' => 'salary:view',
                'functions'   => [
                    ['key' => 'salary:view', 'label' => 'View Salary / Payroll Sheet'],
                    ['key' => 'salary:process', 'label' => 'Process Staff Salary'],
                    ['key' => 'salary:pay', 'label' => 'Disburse Salary Payment'],
                ],
            ],
            [
                'id'          => 'users',
                'name'        => 'Users',
                'icon'        => '👥',
                'page'        => 'User Accounts Directory',
                'page_permission' => 'users:view',
                'functions'   => [
                    ['key' => 'users:view', 'label' => 'View System Users'],
                    ['key' => 'users:create', 'label' => 'Create User Account'],
                    ['key' => 'users:edit', 'label' => 'Edit User Account'],
                    ['key' => 'users:status-toggle', 'label' => 'Activate / Deactivate User'],
                ],
            ],
            [
                'id'          => 'customers',
                'name'        => 'Customers',
                'icon'        => '🧑‍💼',
                'page'        => 'Customers Directory',
                'page_permission' => 'customers:view-all',
                'functions'   => [
                    ['key' => 'customers:create', 'label' => 'Customer Create'],
                    ['key' => 'customers:edit', 'label' => 'Customer Edit'],
                    ['key' => 'customers:view-own', 'label' => 'View Own Customers'],
                    ['key' => 'customers:view-team', 'label' => 'View Team Customers'],
                    ['key' => 'customers:view-all', 'label' => 'View All Customers'],
                ],
            ],
            [
                'id'          => 'reports',
                'name'        => 'Reports',
                'icon'        => '📊',
                'page'        => 'Reports Page',
                'page_permission' => 'reports:view-sales',
                'functions'   => [
                    ['key' => 'reports:view-sales', 'label' => 'Sales Report'],
                    ['key' => 'reports:view-purchase', 'label' => 'Purchase Report'],
                    ['key' => 'reports:view-profit', 'label' => 'Profit / Loss Report'],
                    ['key' => 'reports:view-ledger', 'label' => 'Customer & Supplier Ledger'],
                ],
            ],
            [
                'id'          => 'audit_logs',
                'name'        => 'Audit Logs',
                'icon'        => '🛡️',
                'page'        => 'Audit Logs Track Page',
                'page_permission' => 'audit_logs:view',
                'functions'   => [
                    ['key' => 'audit_logs:view', 'label' => 'View Audit Logs & System Track'],
                    ['key' => 'audit_logs:export', 'label' => 'Export Audit Logs Data'],
                ],
            ],
            [
                'id'          => 'access_setup',
                'name'        => 'Access Setup',
                'icon'        => '🔐',
                'page'        => 'Access Setup Page',
                'page_permission' => 'access_setup:manage',
                'functions'   => [
                    ['key' => 'access_setup:manage', 'label' => 'Manage Access Setup Matrix'],
                    ['key' => 'access_setup:roles-edit', 'label' => 'Create & Edit Roles'],
                ],
            ],
            [
                'id'          => 'setting',
                'name'        => 'Setting',
                'icon'        => '⚙️',
                'page'        => 'Master Settings Page',
                'page_permission' => 'settings:manage',
                'functions'   => [
                    ['key' => 'settings:category', 'label' => 'Category'],
                    ['key' => 'settings:unit', 'label' => 'Unit'],
                    ['key' => 'settings:expense_type', 'label' => 'Expense Type'],
                    ['key' => 'settings:department', 'label' => 'Department'],
                    ['key' => 'settings:bank_account', 'label' => 'Bank Account'],
                    ['key' => 'settings:mobile_account', 'label' => 'Mobile Account'],
                    ['key' => 'settings:notice', 'label' => 'Notice'],
                    ['key' => 'settings:user_type', 'label' => 'User Type'],
                    ['key' => 'settings:balance_transfer', 'label' => 'Balance Transfer'],
                    ['key' => 'settings:company_profile', 'label' => 'Company Profile'],
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
        $defaultRoleNames = ['admin', 'manager', 'salesman', 'staff'];
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
        if (!$request->user()->can('access_setup:manage')) {
            return $this->errorResponse('Unauthorized action.', 403);
        }

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
