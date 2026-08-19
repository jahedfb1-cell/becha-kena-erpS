/**
 * Pure transforms over the quotation/order builder's section tree.
 *
 * Both builders hold the same shape: a list of sections, each holding blocks
 * (one product), each holding sizes (one window). Editing any part of it
 * means rebuilding the branch above it, which in the pages themselves came
 * out as the same three-deep `map` with the same two "not this one, hand it
 * back untouched" guards, written out about ten times per page and twice
 * over because the quotation and order builders each had their own copy.
 *
 * Everything here takes the section list and returns a new one, so a caller
 * is always `setSections(prev => something(prev, ...))`. Nothing reads React
 * state or props, which is what makes these safe to share between two pages
 * whose builders have otherwise drifted apart.
 */

// Explicit extension so this module also loads under plain Node, which is
// how the checks in verify-sections.mjs exercise it without a test runner.
import { pvcSlatCount, billableSqft } from './billing.js';

/** Rebuilds one section, leaving the rest of the list untouched. */
const mapSection = (sections, sectionId, fn) =>
  sections.map(sec => (sec.id === sectionId ? fn(sec) : sec));

/** Rebuilds one block inside one section, leaving its siblings untouched. */
const mapBlock = (sections, sectionId, blockId, fn) =>
  mapSection(sections, sectionId, sec => ({
    ...sec,
    blocks: sec.blocks.map(block => (block.id === blockId ? fn(block) : block)),
  }));

/** Ids only have to be unique within the page's own lifetime. */
const newId = () => Date.now() + Math.random();

/**
 * A fresh, empty section named for its position: the first is "Section A",
 * the second "Section B", and so on.
 */
export const createSection = (existingCount) => ({
  id: 'sec_' + newId(),
  name: `Section ${String.fromCharCode(65 + existingCount)}: New Category`,
  blocks: [],
});

export const removeSection = (sections, sectionId) =>
  sections.filter(sec => sec.id !== sectionId);

export const renameSection = (sections, sectionId, name) =>
  mapSection(sections, sectionId, sec => ({ ...sec, name }));

export const removeBlock = (sections, sectionId, blockId) =>
  mapSection(sections, sectionId, sec => ({
    ...sec,
    blocks: sec.blocks.filter(block => block.id !== blockId),
  }));

/**
 * Picks one variant within an option group.
 *
 * The group is a set of alternatives the customer chooses between, so
 * selecting one deselects its siblings rather than simply toggling.
 */
export const selectOptionVariant = (sections, sectionId, optionGroupId, blockId) =>
  mapSection(sections, sectionId, sec => ({
    ...sec,
    blocks: sec.blocks.map(block =>
      block.option_group_id === optionGroupId
        ? { ...block, is_selected: block.id === blockId }
        : block
    ),
  }));

export const toggleBlockPrint = (sections, sectionId, blockId) =>
  mapBlock(sections, sectionId, blockId, block => ({
    ...block,
    is_enabled_for_print: !block.is_enabled_for_print,
  }));

/**
 * A blank size row.
 *
 * Per-piece goods have no width or height to fill in, so their row starts
 * ready to use at one piece rather than waiting for measurements that will
 * never come.
 */
const createSizeRow = (block) => {
  const isPcsBlock = (block.unit || '').trim().toLowerCase() === 'pcs';

  return {
    id: newId(),
    width: isPcsBlock ? 1 : '',
    height: isPcsBlock ? 1 : '',
    pcs: 1,
    actual_sqft: isPcsBlock ? 1 : 0,
    billed_sqft: isPcsBlock ? 1 : 0,
    line_total: isPcsBlock ? (parseFloat(block.unit_price) || 0) : 0,
  };
};

export const addSizeRow = (sections, sectionId, blockId) =>
  mapBlock(sections, sectionId, blockId, block => ({
    ...block,
    sizes: [...block.sizes, createSizeRow(block)],
  }));

/**
 * Removes one size row, refilling the block with a blank one if that was the
 * last: a product with no rows at all cannot be measured or priced, and
 * leaves nothing on screen to type into.
 *
 * The replacement is deliberately a plain empty row rather than the per-piece
 * shaped one, matching what the builders have always done here.
 */
export const removeSizeRow = (sections, sectionId, blockId, sizeId) =>
  mapBlock(sections, sectionId, blockId, block => {
    const sizes = block.sizes.filter(size => size.id !== sizeId);

    if (sizes.length === 0) {
      sizes.push({
        id: newId(),
        width: '',
        height: '',
        pcs: 1,
        actual_sqft: 0,
        billed_sqft: 0,
        line_total: 0,
      });
    }

    return { ...block, sizes };
  });

/**
 * Whether a block is PVC strip curtain, which is billed across whole slats
 * rather than the measured opening.
 *
 * Nothing on the product marks this, so it is read out of whatever text is
 * to hand — unit, category or name. "Clear water" is in the list because
 * that range is PVC without saying so anywhere.
 */
export const isPvcBlock = (block) => {
  const haystack = [
    block.unit,
    block.category_name,
    block.product_name,
  ].map(value => (value || '').toLowerCase());

  return haystack.some(text => text.includes('pvc'))
    || haystack[2].includes('clear water');
};

/**
 * Prices measured rows and appends them to a block, keeping whichever of the
 * block's own rows already carry measurements.
 *
 * Used for both spreadsheet pastes and AI photo scans: it is the same size
 * grid either way, only the source of the numbers differs, and the two had
 * been carrying identical copies of this arithmetic in both builders.
 *
 * Note this prices strictly by area, with no per-piece branch — matching
 * what both import paths have always done. `handleSizeChange` in the pages
 * does have that branch, so the two are deliberately not merged.
 */
export const appendMeasuredRows = (sections, sectionId, blockId, rows) =>
  mapBlock(sections, sectionId, blockId, block => {
    const unitPrice = parseFloat(block.unit_price) || 0;
    const minSqft = parseFloat(block.min_billing_sqft) || 0;

    const priced = rows.map(row => {
      const width = parseFloat(row.width) || 0;
      const height = parseFloat(row.height) || 0;
      const pcs = parseInt(row.pcs) || 1;

      const perPieceSqft = Math.round(((width * height) / 144) * 100) / 100;

      let billedSqft;
      if (isPvcBlock(block)) {
        const slatSize = parseFloat(block.product_size) || 8;
        const slatWidth = pvcSlatCount(width) * slatSize;
        billedSqft = Math.round(((slatWidth * height) / 144 * pcs) * 100) / 100;
      } else {
        billedSqft = billableSqft(Math.max(perPieceSqft, minSqft), pcs);
      }

      return {
        id: newId(),
        width,
        height,
        pcs,
        actual_sqft: perPieceSqft,
        billed_sqft: billedSqft,
        line_total: Math.round((billedSqft * unitPrice) * 100) / 100,
      };
    });

    // A row with no measurements is a blank waiting to be filled in, so the
    // imported rows take its place rather than stacking up underneath it.
    const measured = block.sizes.filter(
      size => parseFloat(size.width) > 0 && parseFloat(size.height) > 0
    );

    return { ...block, sizes: [...measured, ...priced] };
  });
