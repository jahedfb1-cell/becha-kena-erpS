<?php

namespace Database\Seeders;

use App\Models\ExpenseCategory;
use App\Models\User;
use Illuminate\Database\Seeder;

class ExpenseCategorySeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $admin = User::where('email', 'admin@bechakenarp.com')->first();
        $adminId = $admin ? $admin->id : 1;

        $categories = [
            [
                'name'        => 'Office Rent',
                'description' => 'Monthly showroom & office space rent',
            ],
            [
                'name'        => 'Utility Bill',
                'description' => 'Electricity, Internet, Water & Gas bills',
            ],
            [
                'name'        => 'Transport',
                'description' => 'Goods delivery & staff conveyance expenses',
            ],
            [
                'name'        => 'Salary',
                'description' => 'Employee monthly salary & allowances',
            ],
            [
                'name'        => 'Miscellaneous',
                'description' => 'Other operational and petty cash expenses',
            ],
        ];

        foreach ($categories as $category) {
            ExpenseCategory::firstOrCreate(
                ['name' => $category['name']],
                [
                    'description' => $category['description'],
                    'created_by'  => $adminId,
                    'is_archived' => false,
                ]
            );
        }
    }
}
