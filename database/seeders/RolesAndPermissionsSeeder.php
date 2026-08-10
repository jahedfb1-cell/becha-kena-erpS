<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Reset cached roles and permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // 1. All permissions list
        $permissions = [
            // Customers
            'customers:create',
            'customers:edit',
            'customers:view-own',
            'customers:view-team',
            'customers:view-all',

            // Users
            'users:view',
            'users:create',
            'users:edit',
            'users:status-toggle',

            // Quotations & Orders
            'quotations:create',
            'quotations:edit-own',
            'quotations:edit-team',
            'quotations:convert',
            'quotations:approve',
            'quotations:reject',
            'quotations:reassign',
            'orders:view-own',
            'orders:view-team',
            'orders:view-all',
            'orders:edit-approved',

            // Purchase Entries
            'purchase_entries:view',
            'purchase_entries:create',

            // Invoices & Challans
            'invoices:generate',
            'invoices:view',
            'invoices:archive',
            'challans:generate',
            'challans:view',

            // Payments
            'payments:create',
            'payments:apply-discount',
            'payments:void',

            // Vouchers & Expenses
            'vouchers:create',
            'vouchers:view',
            'vouchers:approve',
            'expenses:create',
            'expenses:view',

            // Salary
            'salary:view',
            'salary:process',
            'salary:pay',

            // Suppliers
            'suppliers:create',
            'suppliers:edit',
            'suppliers:archive',

            // Products
            'products:view',
            'products:create',
            'products:edit',
            'products:archive',

            // Complaints
            'complaints:create',
            'complaints:resolve',

            // Reports
            'reports:view-sales',
            'reports:view-purchase',
            'reports:view-profit',
            'reports:view-ledger',

            // Audit Logs
            'audit_logs:view',
            'audit_logs:export',

            // Access Setup
            'access_setup:manage',
            'access_setup:roles-edit',

            // Setting Items
            'settings:manage',
            'settings:category',
            'settings:unit',
            'settings:expense_type',
            'settings:department',
            'settings:bank_account',
            'settings:mobile_account',
            'settings:notice',
            'settings:user_type',
            'settings:balance_transfer',
            'settings:company_profile',
        ];

        // Create permissions
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // 2. Create Roles
        $adminRole    = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $managerRole  = Role::firstOrCreate(['name' => 'manager', 'guard_name' => 'web']);
        $salesmanRole = Role::firstOrCreate(['name' => 'salesman', 'guard_name' => 'web']);
        $staffRole    = Role::firstOrCreate(['name' => 'staff', 'guard_name' => 'web']);

        // 3. Assign Permissions to Admin (All)
        $adminRole->syncPermissions(Permission::all());

        // 4. Assign Permissions to Manager
        $managerPermissions = [
            'customers:create',
            'customers:view-team',
            'quotations:create',
            'quotations:edit-team',
            'quotations:convert',
            'quotations:approve',
            'quotations:reject',
            'orders:view-team',
            'payments:create',
            'complaints:create',
            'reports:view-sales',
            'reports:view-purchase',
            'reports:view-ledger',
            'challans:view',
            'challans:generate',
            'vouchers:view',
            'vouchers:create',
            'expenses:view',
            'expenses:create',
        ];
        $managerRole->syncPermissions($managerPermissions);

        // 5. Assign Permissions to Salesman
        $salesmanPermissions = [
            'customers:create',
            'customers:view-own',
            'quotations:create',
            'quotations:edit-own',
            'quotations:convert',
            'orders:view-own',
            'complaints:create',
            'payments:create',
        ];
        $salesmanRole->syncPermissions($salesmanPermissions);

        // 6. Assign Permissions to Staff
        $staffPermissions = [
            'products:create',
            'products:edit',
            'challans:view',
            'challans:generate',
            'vouchers:view',
            'vouchers:create',
            'expenses:view',
            'expenses:create',
            'complaints:create',
        ];
        $staffRole->syncPermissions($staffPermissions);
    }
}
