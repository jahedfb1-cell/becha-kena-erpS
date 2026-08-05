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
            'customers:view-own',
            'customers:view-team',
            'customers:view-all',

            // Quotations
            'quotations:create',
            'quotations:edit-own',
            'quotations:edit-team',
            'quotations:convert',
            'quotations:approve',
            'quotations:reject',
            'quotations:reassign',

            // Orders
            'orders:view-own',
            'orders:view-team',
            'orders:view-all',
            'orders:edit-approved',

            // Purchase Entries
            'purchase_entries:view',
            'purchase_entries:create',

            // Invoices
            'invoices:generate',
            'invoices:view',
            'invoices:archive',

            // Challans
            'challans:generate',
            'challans:view',

            // Payments
            'payments:create',
            'payments:apply-discount',
            'payments:void',

            // Suppliers
            'suppliers:create',
            'suppliers:edit',
            'suppliers:archive',

            // Products
            'products:create',
            'products:edit',
            'products:archive',

            // Complaints
            'complaints:create',
            'complaints:resolve',

            // Vouchers
            'vouchers:create',
            'vouchers:view',

            // Expenses
            'expenses:create',
            'expenses:view',

            // Reports
            'reports:view-sales',
            'reports:view-purchase',
            'reports:view-profit',
            'reports:view-ledger',

            // Audit Logs & Settings
            'audit_logs:view',
            'settings:manage',
        ];

        // Create permissions
        foreach ($permissions as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        // 2. Create Roles
        $adminRole    = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $managerRole  = Role::firstOrCreate(['name' => 'manager', 'guard_name' => 'web']);
        $salesmanRole = Role::firstOrCreate(['name' => 'salesman', 'guard_name' => 'web']);

        // 3. Assign Permissions to Admin (All)
        $adminRole->syncPermissions(Permission::all());

        // 4. Assign Permissions to Manager
        $managerPermissions = [
            'customers:create',
            'customers:view-team',
            'quotations:create',
            'quotations:edit-team',
            'quotations:convert',
            'orders:view-team',
            'payments:create',
            'complaints:create',
            'reports:view-sales',
            'reports:view-purchase',
            'reports:view-ledger',
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
    }
}
