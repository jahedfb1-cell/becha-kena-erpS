<?php

namespace Database\Seeders;

use App\Models\CustomerCategory;
use App\Models\User;
use Illuminate\Database\Seeder;

class CustomerCategorySeeder extends Seeder
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
                'name'        => 'Interior Firm',
                'description' => 'Architectural & Interior Design firms purchasing bulk blinds',
            ],
            [
                'name'        => 'Government Office',
                'description' => 'Government organizations and public institutions',
            ],
            [
                'name'        => 'Corporate Office',
                'description' => 'Private corporate offices and commercial workspaces',
            ],
            [
                'name'        => 'Direct / Individual Customer',
                'description' => 'Retail and residential individual buyers',
            ],
            [
                'name'        => 'PVC Strip Curtain Customer',
                'description' => 'Industrial & cold storage customers for PVC curtains',
            ],
        ];

        foreach ($categories as $category) {
            CustomerCategory::firstOrCreate(
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
