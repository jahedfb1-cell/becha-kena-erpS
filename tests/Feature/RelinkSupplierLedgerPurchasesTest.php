<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Product;
use App\Models\ProductSupplierLink;
use App\Models\PurchaseEntry;
use App\Models\Quotation;
use App\Models\Supplier;
use App\Models\SupplierLedger;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RelinkSupplierLedgerPurchasesTest extends TestCase
{
    use RefreshDatabase;

    private SupplierLedger $line;
    private int $correctId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $category = CustomerCategory::create(['name' => 'Retail', 'created_by' => $admin->id]);
        $customer = Customer::create(['customer_category_id' => $category->id, 'customer_code' => 'CUS-0001', 'name' => 'C', 'phone' => '01700000000', 'created_by' => $admin->id]);
        $product = Product::create(['product_code' => 'BL-001', 'name' => 'Blind', 'unit' => 'sqft', 'default_unit_price' => 100, 'created_by' => $admin->id]);
        $supplier = Supplier::create(['supplier_code' => 'SUP-0001', 'name' => 'S', 'company_name' => 'S', 'created_by' => $admin->id]);
        ProductSupplierLink::create(['product_id' => $product->id, 'supplier_id' => $supplier->id, 'cost_price' => 50, 'min_billing_sqft' => 0, 'priority_rank' => 1, 'created_by' => $admin->id]);

        // A direct confirmed order writes the PO and its supplier ledger credit.
        $this->actingAs($admin, 'sanctum')->postJson('/api/quotations', [
            'customer_id' => $customer->id,
            'status'      => 'approved',
            'items'       => [
                ['product_id' => $product->id, 'width' => 36, 'height' => 48, 'pcs' => 1, 'unit_price' => 100],
                ['product_id' => $product->id, 'width' => 40, 'height' => 48, 'pcs' => 1, 'unit_price' => 100],
            ],
        ])->assertStatus(201);

        $this->line = SupplierLedger::where('transaction_type', 'purchase')->firstOrFail();
        $this->correctId = (int) $this->line->reference_id;
        $this->assertNotNull(PurchaseEntry::find($this->correctId));

        // What the live data looks like: the entry id it points at is gone.
        $this->line->forceFill(['reference_id' => 999999])->saveQuietly();
    }

    public function test_dry_run_changes_nothing(): void
    {
        $this->artisan('ledger:relink-supplier-purchases', ['--dry-run' => true])->assertExitCode(0);

        $this->assertSame(999999, (int) $this->line->fresh()->reference_id);
    }

    public function test_relinks_to_the_first_entry_of_the_same_po_and_logs_it(): void
    {
        $before = $this->line->only(['debit', 'credit', 'balance']);

        $this->artisan('ledger:relink-supplier-purchases')->assertExitCode(0);

        $line = $this->line->fresh();
        $this->assertSame($this->correctId, (int) $line->reference_id);
        $this->assertEquals($before, $line->only(['debit', 'credit', 'balance']), 'amounts must not change');
        $this->assertTrue(AuditLog::where('module', SupplierLedger::class)->where('reference_id', $line->id)->exists());

        // Second run finds nothing left to do.
        $this->artisan('ledger:relink-supplier-purchases')->expectsOutputToContain('missing purchase entry: 0')->assertExitCode(0);
    }
}
