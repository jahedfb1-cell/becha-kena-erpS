<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerCategory;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A line's specification text belongs to the line, not to the product.
 *
 * The quotation form pre-fills the box from the product's own details, but
 * the moment a salesman edits it for this order — a different fabric, a
 * different minimum, an agreed extra — that edited text is what the
 * customer must see on the printed quotation. The product master is only
 * the starting point.
 */
class QuotationItemNotesTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Customer $customer;
    protected Product $product;

    private const MASTER  = 'MASTER DETAILS: Per Blinds Minimum Quantity 20 Sft';
    private const EDITED  = 'EDITED FOR THIS ORDER: Per Blinds Minimum Quantity 18 Sft';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->admin->assignRole('admin');

        $category = CustomerCategory::create([
            'name'       => 'Retail',
            'created_by' => $this->admin->id,
        ]);

        $this->customer = Customer::create([
            'customer_category_id' => $category->id,
            'customer_code'        => 'CUS-0001',
            'name'                 => 'Test Customer',
            'phone'                => '01700000000',
            'created_by'           => $this->admin->id,
        ]);

        $this->product = Product::create([
            'product_code'       => 'BL-001',
            'name'               => 'Roller Blind',
            'unit'               => 'sqft',
            'default_unit_price' => 100,
            'details'            => self::MASTER,
            'created_by'         => $this->admin->id,
        ]);
    }

    private function payload(?string $notes, float $height = 48): array
    {
        $item = [
            'product_id' => $this->product->id,
            'width'      => 36,
            'height'     => $height,
            'pcs'        => 1,
            'unit_price' => 100,
        ];

        if ($notes !== null) {
            $item['notes'] = $notes;
        }

        return [
            'customer_id' => $this->customer->id,
            'items'       => [$item],
        ];
    }

    public function test_edited_notes_are_stored_against_the_line(): void
    {
        $response = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->payload(self::EDITED));

        $response->assertStatus(201);

        $this->assertDatabaseHas('quotation_items', [
            'quotation_id' => $response->json('data.id'),
            'notes'        => self::EDITED,
        ]);
    }

    /** What the print page reads back must be the edited text. */
    public function test_the_show_endpoint_returns_the_edited_notes(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->payload(self::EDITED));

        $show = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/quotations/{$created->json('data.id')}");

        $show->assertStatus(200);
        $this->assertSame(self::EDITED, $show->json('data.items.0.notes'));
        // The master text still travels alongside, as the fallback for lines
        // that never had notes of their own.
        $this->assertSame(self::MASTER, $show->json('data.items.0.product.details'));
    }

    /** Editing an existing quotation's specification must stick. */
    public function test_editing_a_quotations_notes_replaces_the_previous_text(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->payload(self::MASTER));
        $id = $created->json('data.id');

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$id}", $this->payload(self::EDITED))
            ->assertStatus(200);

        $show = $this->actingAs($this->admin, 'sanctum')->getJson("/api/quotations/{$id}");

        $this->assertSame(self::EDITED, $show->json('data.items.0.notes'));
        $this->assertDatabaseMissing('quotation_items', [
            'quotation_id' => $id,
            'notes'        => self::MASTER,
        ]);
    }

    /**
     * Emptying the box is an instruction, and has to survive as one.
     *
     * The print pages fall back to the product's master details when a line
     * has no specification of its own. That fallback is right for a line
     * that never had one, and wrong for a line whose text was deliberately
     * cleared — there it puts back the very words the salesman just removed.
     * The two cases are told apart by empty string versus null, so the empty
     * string has to reach the database intact.
     */
    public function test_clearing_the_notes_is_stored_as_empty_not_as_never_set(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->payload(self::EDITED));
        $id = $created->json('data.id');

        $this->actingAs($this->admin, 'sanctum')
            ->putJson("/api/quotations/{$id}", $this->payload(''))
            ->assertStatus(200);

        $show = $this->actingAs($this->admin, 'sanctum')->getJson("/api/quotations/{$id}");

        $this->assertNotSame(self::EDITED, $show->json('data.items.0.notes'));
        $this->assertSame('', $show->json('data.items.0.notes'), 'A cleared specification must stay cleared.');
    }

    /** A line that never carried notes stays null, so the fallback still applies. */
    public function test_a_line_that_never_had_notes_stays_null(): void
    {
        $created = $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/quotations', $this->payload(null));

        $show = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/quotations/{$created->json('data.id')}");

        $this->assertNull($show->json('data.items.0.notes'));
        $this->assertSame(self::MASTER, $show->json('data.items.0.product.details'));
    }

    /**
     * Two lines of the same product at the same price but with different
     * specifications must keep their own text — the print page groups rows,
     * and a group that ignores notes would print one line's spec against
     * both.
     */
    public function test_two_lines_of_one_product_keep_their_own_notes(): void
    {
        $payload = [
            'customer_id' => $this->customer->id,
            'items'       => [
                ['product_id' => $this->product->id, 'width' => 36, 'height' => 48, 'pcs' => 1, 'unit_price' => 100, 'notes' => 'FIRST SPEC'],
                ['product_id' => $this->product->id, 'width' => 36, 'height' => 60, 'pcs' => 1, 'unit_price' => 100, 'notes' => 'SECOND SPEC'],
            ],
        ];

        $created = $this->actingAs($this->admin, 'sanctum')->postJson('/api/quotations', $payload);
        $created->assertStatus(201);

        $show = $this->actingAs($this->admin, 'sanctum')
            ->getJson("/api/quotations/{$created->json('data.id')}");

        $notes = collect($show->json('data.items'))->pluck('notes')->all();
        $this->assertContains('FIRST SPEC', $notes);
        $this->assertContains('SECOND SPEC', $notes);
    }
}
