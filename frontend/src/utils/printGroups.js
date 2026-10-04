/**
 * Groups a quotation's lines for printing.
 *
 * Lines of the same product / section / price / specification print as one
 * entry (several sizes of one item), in the order the lines were entered -
 * the order the salesman built them in the form.
 *
 * Quotation-level options (option_group_id "pkg:N", see quotationSections.js)
 * print as blocks: an "Option N" heading, then each room (section) heading,
 * then its lines, then that option's own total. A quotation without options
 * but with more than one room gets just the room headings. A plain one-room
 * quotation prints exactly as before - no headings at all.
 *
 * Older quotations may still carry per-product option groups (any other
 * option_group_id); those keep their "Option N: Selected / Alternative"
 * heading, now numbered from 1 within each group.
 *
 * Each returned group carries:
 *   rows            [{ item, idx }]
 *   optionLabel     legacy per-product option heading, or null
 *   optionHeader    { no, selected } before the first entry of option N, or null
 *   sectionHeader   room name to print before this entry, or null
 *   optionFooter    { no, selected, total } after the last entry of option N, or null
 *   isAlternative   true for any line the customer has not chosen
 */
const PKG = 'pkg:';

const lineAmount = (item, displayWidth) => {
  const w = displayWidth ? displayWidth(item) : (parseFloat(item.width) || 0);
  const h = parseFloat(item.height) || 0;
  const fallbackSqft = Math.round(((w * h) / 144) * 100) / 100;
  const billedSqft = parseFloat(item.billed_sqft) || fallbackSqft;
  const unitPrice = parseFloat(item.unit_price) || 0;
  return parseFloat(item.line_total) || Math.round(billedSqft * unitPrice * 100) / 100;
};

export const pkgOptionOf = (item) => {
  const id = item.option_group_id || item.group_id || '';
  if (typeof id !== 'string' || !id.startsWith(PKG)) return null;
  return parseInt(id.slice(PKG.length), 10) || null;
};

export function buildPrintGroups(rawItems, { specificationKey, displayWidth } = {}) {
  const items = [...(rawItems || [])];
  const groups = [];
  const byKey = new Map();
  const legacyCounters = new Map(); // legacy option group id -> next label number

  const usesPkg = items.some((i) => pkgOptionOf(i) !== null);
  const sectionOf = (i) => (i.section_name || i.section_title || '').trim();

  // Options print in number order; inside an option (and in a plain
  // quotation) lines keep their entered order.
  if (usesPkg) {
    items.sort((a, b) => (pkgOptionOf(a) || 0) - (pkgOptionOf(b) || 0));
  }

  items.forEach((item) => {
    const pkg = pkgOptionOf(item);
    const legacyId = pkg === null ? (item.option_group_id || item.group_id || null) : null;
    const isSel = item.is_selected !== false ? 'sel' : 'alt';
    const prodId = item.product_id || item.product?.id || 'noprod';
    const unitPrice = parseFloat(item.unit_price) || 0;
    const notes = specificationKey ? specificationKey(item) : (item.notes || '');
    const section = sectionOf(item);
    const variantName = item.variant?.name || item.product?.product_code || '';

    const key = legacyId
      ? `L|${section}|${legacyId}|${isSel}|${prodId}|${unitPrice}|${notes}`
      : `${pkg ?? ''}|${section}|${prodId}-${variantName}|${unitPrice}|${notes}`;

    if (!byKey.has(key)) {
      let optionLabel = null;
      if (legacyId) {
        const n = legacyCounters.get(legacyId) || 1;
        legacyCounters.set(legacyId, n + 1);
        optionLabel = `Option ${n}`;
      }
      const group = {
        rows: [],
        optionLabel,
        pkg,
        section,
        optionHeader: null,
        sectionHeader: null,
        optionFooter: null,
        isAlternative: item.is_selected === false,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).rows.push({ item, idx: item.id });
  });

  // Headings and option totals.
  // Room headings print when the quotation really is split into rooms: more
  // than one distinct section name, or a section renamed from the builder's
  // default ("Section A: Main Items", "Section B: New Category", ...).
  const isDefaultName = (name) => /^Section [A-Z]: (Main Items|New Category)$/.test(name);
  const names = new Set(groups.map((g) => g.section).filter(Boolean));
  const showRooms = names.size > 1 || [...names].some((n) => !isDefaultName(n));

  groups.forEach((g, i) => {
    const prev = groups[i - 1];
    const next = groups[i + 1];
    if (usesPkg && (!prev || prev.pkg !== g.pkg)) {
      g.optionHeader = { no: g.pkg, selected: !g.isAlternative };
    }
    const newRoom = !prev || prev.pkg !== g.pkg || prev.section !== g.section;
    if (newRoom && g.section && showRooms) {
      g.sectionHeader = g.section;
    }
    if (usesPkg && (!next || next.pkg !== g.pkg)) {
      const total = groups
        .filter((x) => x.pkg === g.pkg)
        .reduce((sum, x) => sum + x.rows.reduce((s, r) => s + lineAmount(r.item, displayWidth), 0), 0);
      g.optionFooter = { no: g.pkg, selected: !g.isAlternative, total };
    }
  });

  return groups;
}
