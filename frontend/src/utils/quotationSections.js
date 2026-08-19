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
