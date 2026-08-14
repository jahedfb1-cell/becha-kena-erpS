<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\ExpenseCategory;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MasterDataApiTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $salesman;
    protected string $adminToken;
    protected string $salesmanToken;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        // Create Admin User
        $this->admin = User::create([
            'name'      => 'Admin User',
            'email'     => 'admin@test.com',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
            'is_active' => true,
            'phone'     => '01712345678',
        ]);
        $this->admin->assignRole('admin');
        $this->adminToken = $this->admin->createToken('admin_token')->plainTextToken;

        // Create Salesman User
        $this->salesman = User::create([
            'name'      => 'Salesman User',
            'email'     => 'salesman@test.com',
            'password'  => Hash::make('password'),
            'role'      => 'salesman',
            'is_active' => true,
            'phone'     => '01712345679',
        ]);
        $this->salesman->assignRole('salesman');
        $this->salesmanToken = $this->salesman->createToken('salesman_token')->plainTextToken;
    }

    public function test_customer_category_crud_and_archiving()
    {
        // 1. Create Category
        $response = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson('/api/master/customer-categories', [
                'name'        => 'VIP Client',
                'description' => 'High value buyers',
            ]);

        $response->assertStatus(201)
            ->assertJson(['success' => true, 'data' => ['name' => 'VIP Client']]);

        $categoryId = $response->json('data.id');

        // 2. Archive Category
        $archiveResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->deleteJson("/api/master/customer-categories/{$categoryId}");

        $archiveResponse->assertStatus(200);
        $this->assertTrue(CustomerCategory::find($categoryId)->is_archived);

        // 3. Restore Category
        $restoreResponse = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson("/api/master/customer-categories/{$categoryId}/restore");

        $restoreResponse->assertStatus(200);
        $this->assertFalse(CustomerCategory::find($categoryId)->is_archived);
    }

    public function test_customer_creation_and_auto_code_generation()
    {
        $category = CustomerCategory::create([
            'name'       => 'Default Category',
            'created_by' => $this->admin->id,
        ]);

        // Create First Customer (Expect CUS-0001)
        $res1 = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson('/api/customers', [
                'name'                 => 'Customer One',
                'phone'                => '01711111111',
                'customer_category_id' => $category->id,
            ]);

        $res1->assertStatus(201)->assertJson(['data' => ['customer_code' => 'CUS-0001']]);

        // Create Second Customer (Expect CUS-0002)
        $res2 = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson('/api/customers', [
                'name'                 => 'Customer Two',
                'customer_category_id' => $category->id,
            ]);

        $res2->assertStatus(201)->assertJson(['data' => ['customer_code' => 'CUS-0002']]);
    }

    public function test_role_based_customer_visibility()
    {
        $category = CustomerCategory::create([
            'name'       => 'General',
            'created_by' => $this->admin->id,
        ]);

        // Customer created by Admin
        $c1 = Customer::create([
            'customer_code'        => 'CUS-9001',
            'name'                 => 'Admin Customer',
            'customer_category_id' => $category->id,
            'created_by'           => $this->admin->id,
        ]);

        // Customer created by Salesman
        $c2 = Customer::create([
            'customer_code'        => 'CUS-9002',
            'name'                 => 'Salesman Customer',
            'customer_category_id' => $category->id,
            'created_by'           => $this->salesman->id,
        ]);

        // Salesman views list -> should see only 1 (their own)
        $salesmanRes = $this->withHeaders(['Authorization' => 'Bearer ' . $this->salesmanToken])
            ->getJson('/api/customers');

        $salesmanRes->assertStatus(200)->assertJsonCount(1, 'data');

        // Admin views list -> should see 2
        $this->app['auth']->forgetGuards();
        $adminRes = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->getJson('/api/customers');

        $adminRes->assertStatus(200)->assertJsonCount(2, 'data');
    }

    public function test_supplier_auto_code_generation()
    {
        $res = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson('/api/suppliers', [
                'name'  => 'Dhaka Blind Fabrics Ltd',
                'phone' => '01800000000',
            ]);

        $res->assertStatus(201)->assertJson(['data' => ['supplier_code' => 'S-DHA00001']]);
    }

    public function test_product_supplier_link_validations()
    {
        $product = Product::create([
            'product_code'       => 'BL-100',
            'name'               => 'Roller Blind 100',
            'default_unit_price' => 250,
            'created_by'         => $this->admin->id,
        ]);

        $supplier1 = Supplier::create([
            'supplier_code' => 'SUP-0001',
            'name'          => 'Supplier A',
            'created_by'    => $this->admin->id,
        ]);

        $supplier2 = Supplier::create([
            'supplier_code' => 'SUP-0002',
            'name'          => 'Supplier B',
            'created_by'    => $this->admin->id,
        ]);

        // Link Supplier 1 with Priority 1 -> Success
        $link1 = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson("/api/products/{$product->id}/suppliers", [
                'supplier_id'      => $supplier1->id,
                'priority_rank'    => 1,
                'cost_price'       => 180,
                'min_billing_sqft' => 15,
            ]);
        $link1->assertStatus(201);

        // Attempt to link Supplier 1 again -> Fail (unique product-supplier)
        $dupSupplier = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson("/api/products/{$product->id}/suppliers", [
                'supplier_id'      => $supplier1->id,
                'priority_rank'    => 2,
                'cost_price'       => 180,
                'min_billing_sqft' => 15,
            ]);
        $dupSupplier->assertStatus(422);

        // Attempt to link Supplier 2 with Priority 1 -> Fail (duplicate priority_rank)
        $dupPriority = $this->withHeaders(['Authorization' => 'Bearer ' . $this->adminToken])
            ->postJson("/api/products/{$product->id}/suppliers", [
                'supplier_id'      => $supplier2->id,
                'priority_rank'    => 1,
                'cost_price'       => 190,
                'min_billing_sqft' => 15,
            ]);
        $dupPriority->assertStatus(422);
    }
}
