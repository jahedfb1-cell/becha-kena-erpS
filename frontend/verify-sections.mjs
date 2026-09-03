/**
 * Throwaway check that the extracted section transforms behave the way the
 * inlined code in Quotations.jsx / Orders.jsx used to. Run with:
 *   node verify-sections.mjs
 */
import {
  createSection,
  removeSection,
  renameSection,
  removeBlock,
  selectOptionVariant,
  toggleBlockPrint,
  addSizeRow,
  removeSizeRow,
  appendMeasuredRows,
  isPvcBlock,
  createProductBlock,
  appendBlock,
} from './src/utils/quotationSections.js';

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FAIL ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
};

const block = (over = {}) => ({
  id: 'b1', unit: 'sqft', unit_price: 100, min_billing_sqft: 0,
  product_size: 8, category_name: '', product_name: 'Roller',
  is_enabled_for_print: true, sizes: [], ...over,
});
const sections = (blocks) => [{ id: 's1', name: 'A', blocks }];

// --- section naming ---------------------------------------------------
check('first section is A', createSection(0).name, 'Section A: New Category');
check('third section is C', createSection(2).name, 'Section C: New Category');

// --- basic tree edits -------------------------------------------------
check('rename', renameSection(sections([]), 's1', 'X')[0].name, 'X');
check('remove section', removeSection(sections([]), 's1').length, 0);
check('remove other section is a no-op', removeSection(sections([]), 'nope').length, 1);
check('remove block', removeBlock(sections([block()]), 's1', 'b1')[0].blocks.length, 0);

// --- option groups ----------------------------------------------------
const opts = sections([
  block({ id: 'b1', option_group_id: 'g1', is_selected: true }),
  block({ id: 'b2', option_group_id: 'g1', is_selected: false }),
  block({ id: 'b3', option_group_id: 'g2', is_selected: true }),
]);
const picked = selectOptionVariant(opts, 's1', 'g1', 'b2');
check('picking a variant selects it', picked[0].blocks[1].is_selected, true);
check('picking a variant deselects its sibling', picked[0].blocks[0].is_selected, false);
check('other groups untouched', picked[0].blocks[2].is_selected, true);

// --- print toggle -----------------------------------------------------
check('print toggles off', toggleBlockPrint(sections([block()]), 's1', 'b1')[0].blocks[0].is_enabled_for_print, false);

// --- size rows --------------------------------------------------------
const added = addSizeRow(sections([block()]), 's1', 'b1')[0].blocks[0].sizes[0];
check('sqft row starts blank', [added.width, added.height, added.pcs], ['', '', 1]);

const pcsAdded = addSizeRow(sections([block({ unit: 'pcs', unit_price: 250 })]), 's1', 'b1')[0].blocks[0].sizes[0];
check('per-piece row starts usable', [pcsAdded.width, pcsAdded.height, pcsAdded.billed_sqft, pcsAdded.line_total], [1, 1, 1, 250]);

const two = block({ sizes: [{ id: 1, width: 10, height: 10 }, { id: 2, width: 20, height: 20 }] });
check('removing one keeps the other', removeSizeRow(sections([two]), 's1', 'b1', 1)[0].blocks[0].sizes.map(s => s.id), [2]);

const one = block({ sizes: [{ id: 1, width: 10, height: 10 }] });
const emptied = removeSizeRow(sections([one]), 's1', 'b1', 1)[0].blocks[0].sizes;
check('removing the last refills a blank', [emptied.length, emptied[0].width, emptied[0].billed_sqft], [1, '', 0]);

// --- PVC detection ------------------------------------------------------
// Only the unit field decides. Category and product name are never
// consulted, even when they contain "PVC" or "Clear Water" in the text.
check('pvc by unit', isPvcBlock(block({ unit: 'PVC' })), true);
check('category text alone is not pvc', isPvcBlock(block({ category_name: 'PVC Strip Curtain' })), false);
check('product name text alone is not pvc', isPvcBlock(block({ product_name: 'Clear Water Strip' })), false);
check('plain blind is not pvc', isPvcBlock(block()), false);

// --- imported measurements -------------------------------------------
// 36 x 48 = 12 sq.ft, billed up to the quarter foot, at 100/sqft
const imported = appendMeasuredRows(sections([block()]), 's1', 'b1', [{ width: 36, height: 48, pcs: 1 }]);
check('imported area', imported[0].blocks[0].sizes[0].actual_sqft, 12);
check('imported billed', imported[0].blocks[0].sizes[0].billed_sqft, 12);
check('imported total', imported[0].blocks[0].sizes[0].line_total, 1200);

// 25 x 37 = 6.4236 -> 6.42 actual, billed up to 6.50
const rounded = appendMeasuredRows(sections([block()]), 's1', 'b1', [{ width: 25, height: 37, pcs: 1 }]);
check('quarter-foot rounding up', [rounded[0].blocks[0].sizes[0].actual_sqft, rounded[0].blocks[0].sizes[0].billed_sqft], [6.42, 6.5]);

// minimum billing area wins over a small window
const minimal = appendMeasuredRows(sections([block({ min_billing_sqft: 10 })]), 's1', 'b1', [{ width: 12, height: 24, pcs: 1 }]);
check('minimum billing applies', minimal[0].blocks[0].sizes[0].billed_sqft, 10);

// PVC: 60in -> 10 whole slats x 8in = 80in billed width, x 84in / 144
// (unit must say PVC - category/name text alone no longer triggers it)
const pvc = appendMeasuredRows(sections([block({ unit: 'PVC sq.ft' })]), 's1', 'b1', [{ width: 60, height: 84, pcs: 1 }]);
check('pvc bills whole slats', pvc[0].blocks[0].sizes[0].billed_sqft, 46.67);
check('pvc keeps the real area', pvc[0].blocks[0].sizes[0].actual_sqft, 35);

// blanks are replaced, measured rows are kept
const mixed = block({ sizes: [{ id: 9, width: 10, height: 10 }, { id: 10, width: '', height: '' }] });
const appended = appendMeasuredRows(sections([mixed]), 's1', 'b1', [{ width: 36, height: 48, pcs: 1 }]);
check('blank row dropped, measured kept, new appended', appended[0].blocks[0].sizes.map(s => s.width), [10, 36]);

// --- new product lines ------------------------------------------------
const product = {
  id: 7, name: 'Roller Blind', product_code: 'BL-001', unit: 'sqft',
  default_unit_price: 120, product_size: 8, category: { name: 'Roller Blinds' },
  details: 'MASTER SPEC',
  supplier_links: [
    { supplier_id: 3, priority_rank: 2, cost_price: 90, min_billing_sqft: 20 },
    { supplier_id: 5, priority_rank: 1, cost_price: 70, min_billing_sqft: 15 },
  ],
};

const line = createProductBlock(product, { sectionId: 's1' });
check('routes to the preferred supplier', line.supplier_id, 5);
check('takes that supplier cost and minimum', [line.cost_price, line.min_billing_sqft], [70, 15]);
check('takes the product list price', line.unit_price, 120);
check('takes the product specification', line.notes, 'MASTER SPEC');
check('a blind starts with four blank rows', line.sizes.length, 4);
check('those rows are blank', [line.sizes[0].width, line.sizes[0].billed_sqft], ['', 0]);

const noSpec = createProductBlock({ ...product, details: null }, { sectionId: 's1' });
check('falls back to the default specification', noSpec.notes.includes('Per Blinds Minimum Quantity 15 Sft'), true);

const noSupplier = createProductBlock({ ...product, details: null, supplier_links: [] }, { sectionId: 's1' });
check('default specification says 20 when there is no minimum', noSupplier.notes.includes('Per Blinds Minimum Quantity 20 Sft'), true);
check('no supplier means no routing', [noSupplier.supplier_id, noSupplier.cost_price], ['', 0]);

const motor = createProductBlock({ ...product, unit: 'pcs', default_unit_price: 5000 }, { sectionId: 's1' });
check('per-piece line starts with one usable row', motor.sizes.length, 1);
check('per-piece row is ready to price', [motor.sizes[0].width, motor.sizes[0].billed_sqft, motor.sizes[0].line_total], [1, 1, 5000]);

const variant = createProductBlock(product, { sectionId: 's1', optionGroupId: 'g1', isOptional: true, isSelected: false });
check('option variant carries its group', [variant.option_group_id, variant.is_optional, variant.is_selected], ['g1', true, false]);

check('appended to its section', appendBlock(sections([]), 's1', line)[0].blocks.length, 1);

// --- immutability -----------------------------------------------------
const original = sections([block()]);
const snapshot = JSON.stringify(original);
renameSection(original, 's1', 'changed');
addSizeRow(original, 's1', 'b1');
removeBlock(original, 's1', 'b1');
check('input is never mutated', JSON.stringify(original), snapshot);

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
