import { buildPrintGroups } from './printGroups';
import { lineSpecification, hasSpecification, specificationKey } from './lineSpecification';
import { brandFields } from './brandProfile';
import { formatDate } from './format';
import { numberToWords, getDisplayWidth, groupTotals, quotationNetTotal } from './quotationPrintMath';

/**
 * Excel copy of the quotation "Pad Print" (type=pad) page.
 *
 * It is built from the same record and the same helpers as the printed page
 * (printGroups.js for the line grouping and room/option headings,
 * quotationPrintMath.js for quantities, amounts, Sub Total and the amount in
 * words), so the figures in the sheet can never differ from the printout.
 * Layout, headings, fills and borders follow QuotationPrintPage.jsx top to
 * bottom; the blank rows at the top stand in for the pre-printed pad header.
 *
 * ExcelJS is loaded only when the button is pressed - it is large.
 */

const COLUMN_WIDTHS = [7, 52, 13, 15, 12, 15]; // Sl, Description, Colors, Quantity/Sq.ft, Rate, Amount
const LAST_COL = COLUMN_WIDTHS.length;
const FONT = 'Arial';

const GREY_HEAD = 'FFD1D5DB';
const GREY_LIGHT = 'FFFAFAFA';
const GREY_LABEL = 'FFF3F4F6';
const LINE = 'FFCBD5E1';
const LINE_DARK = 'FF9CA3AF';

const thin = (argb = LINE) => ({ style: 'thin', color: { argb } });
const medium = { style: 'medium', color: { argb: 'FF000000' } };

/** Rich-text HTML (TipTap output or old plain text) -> plain text with line breaks. */
export const htmlToPlainText = (html) => {
  const text = String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** How many printed lines a text takes in a cell that fits `charsPerLine` characters. */
const lineCount = (text, charsPerLine) =>
  String(text ?? '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);

const money = '#,##0.00';

export function buildQuotationPadWorkbook(ExcelJS, { quotation, companyProfile }) {
  const brand = brandFields(companyProfile);
  const customer = quotation.customer || {};
  const items = quotation.items || [];
  const groups = buildPrintGroups(items, { specificationKey, displayWidth: getDisplayWidth });
  const netTotal = quotationNetTotal(quotation);

  const wb = new ExcelJS.Workbook();
  wb.creator = brand.footerName;
  wb.created = new Date();

  const ws = wb.addWorksheet('Quotation', {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  let r = 1;

  const mergedRow = (row, from, to) => {
    if (to > from) ws.mergeCells(row, from, row, to);
    return ws.getCell(row, from);
  };

  const setFont = (cell, font) => { cell.font = { name: FONT, size: 10, ...font }; };

  /** Outer border around a block of cells. */
  const outline = (r1, c1, r2, c2, border) => {
    for (let row = r1; row <= r2; row++) {
      for (let col = c1; col <= c2; col++) {
        const cell = ws.getCell(row, col);
        cell.border = {
          ...cell.border,
          ...(row === r1 ? { top: border } : {}),
          ...(row === r2 ? { bottom: border } : {}),
          ...(col === c1 ? { left: border } : {}),
          ...(col === c2 ? { right: border } : {}),
        };
      }
    }
  };

  const fillRange = (row, c1, c2, argb) => {
    for (let col = c1; col <= c2; col++) {
      ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
    }
  };

  const allBorders = (row, c1, c2, argb = LINE) => {
    for (let col = c1; col <= c2; col++) {
      ws.getCell(row, col).border = { top: thin(argb), bottom: thin(argb), left: thin(argb), right: thin(argb) };
    }
  };

  // ── pad paper: the pre-printed letterhead area stays blank ──────────────
  for (let i = 0; i < 5; i++) { ws.getRow(r).height = 20; r++; }

  const addressCell = mergedRow(r, 1, LAST_COL);
  addressCell.value = `Office Address : ${brand.officeAddress}`.toUpperCase();
  setFont(addressCell, { bold: true, size: 9, color: { argb: 'FF222222' } });
  addressCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(r).height = Math.max(16, lineCount(addressCell.value, 105) * 13);
  r++;

  const contactCell = mergedRow(r, 1, LAST_COL);
  contactCell.value = `Mobile : ${brand.mobile},  Email : ${brand.email},  Web : ${brand.web}${brand.vatRegNo ? `,  VAT Reg No : ${brand.vatRegNo}` : ''}`;
  setFont(contactCell, { bold: true, size: 9, color: { argb: 'FF222222' } });
  contactCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  for (let col = 1; col <= LAST_COL; col++) ws.getCell(r, col).border = { bottom: thin() };
  ws.getRow(r).height = Math.max(16, lineCount(contactCell.value, 115) * 13);
  r++;

  const titleCell = mergedRow(r, 1, LAST_COL);
  titleCell.value = 'Quotation';
  setFont(titleCell, { name: 'Times New Roman', bold: true, size: 20 });
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(r).height = 32;
  r++;

  ws.getRow(r).height = 8;
  r++;

  // ── Quotation To / Delivery Address / Date & number ─────────────────────
  const hasDelivery = Boolean(quotation.delivery_address);
  const toFrom = 1;
  const toTo = 2;
  const delFrom = 3;
  const delTo = 4;
  const metaFrom = 5;
  const metaTo = 6;

  const underlineLabel = (row, from, to, text) => {
    const cell = mergedRow(row, from, to);
    cell.value = text;
    setFont(cell, { bold: true, size: 10, underline: true });
    cell.alignment = { vertical: 'middle' };
  };

  underlineLabel(r, toFrom, toTo, 'Quotation To:');
  if (hasDelivery) underlineLabel(r, delFrom, delTo, 'Delivery Address:');
  ws.getRow(r).height = 17;

  const metaDate = mergedRow(r, metaFrom, metaTo);
  metaDate.value = { richText: [
    { text: 'Date : ', font: { name: FONT, size: 10 } },
    { text: formatDate(quotation.created_at || quotation.date || new Date()), font: { name: FONT, size: 10, bold: true } },
  ] };
  metaDate.alignment = { horizontal: 'right', vertical: 'middle' };
  r++;

  const customerLines = [
    { text: customer.company_name || customer.name || '', bold: true, size: 11 },
    { text: customer.address || 'Dhaka, Bangladesh' },
    ...(customer.address_2 ? [{ text: customer.address_2 }] : []),
    ...(customer.phone && customer.contact_show_status !== 'cannot_show_contact_number' ? [{ text: customer.phone }] : []),
  ];
  const boxTop = r;
  customerLines.forEach((line, i) => {
    const cell = mergedRow(r, toFrom, toTo);
    cell.value = line.text;
    setFont(cell, { bold: Boolean(line.bold), size: line.size || 10, color: { argb: line.bold ? 'FF000000' : 'FF333333' } });
    cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
    ws.getRow(r).height = Math.max(16, lineCount(line.text, 55) * 14);
    if (i === 0) {
      const metaNo = mergedRow(r, metaFrom, metaTo);
      metaNo.value = { richText: [
        { text: 'Quotation No. : ', font: { name: FONT, size: 10 } },
        { text: quotation.quotation_number || '', font: { name: FONT, size: 10, bold: true } },
      ] };
      metaNo.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    r++;
  });
  const boxBottom = r - 1;
  outline(boxTop, toFrom, boxBottom, toTo, medium);

  if (hasDelivery) {
    ws.mergeCells(boxTop, delFrom, boxBottom, delTo);
    const del = ws.getCell(boxTop, delFrom);
    del.value = quotation.delivery_address;
    setFont(del, { size: 10, color: { argb: 'FF333333' } });
    del.alignment = { vertical: 'top', wrapText: true, indent: 1 };
    outline(boxTop, delFrom, boxBottom, delTo, medium);
    // The merged box must be tall enough for a long address.
    const needed = lineCount(quotation.delivery_address, 26) * 14 + 6;
    const have = customerLines.reduce((sum, _, i) => sum + (ws.getRow(boxTop + i).height || 16), 0);
    if (needed > have) ws.getRow(boxBottom).height = (ws.getRow(boxBottom).height || 16) + (needed - have);
  }

  ws.getRow(r).height = 10;
  r++;

  // ── item table ───────────────────────────────────────────────────────────
  const headers = ['Sl No.', 'Description of Goods', 'Colors', 'Quantity/Sq.ft', 'Rate Tk.', 'Amount Tk.'];
  headers.forEach((text, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = text;
    setFont(cell, { bold: true, size: 10, color: { argb: 'FF000000' } });
    cell.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle', indent: i === 1 ? 1 : 0, wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_HEAD } };
    cell.border = { top: thin(LINE_DARK), bottom: thin(LINE_DARK), left: thin(LINE_DARK), right: thin(LINE_DARK) };
  });
  ws.getRow(r).height = 22;
  const headerRow = r;
  r++;

  const headingRow = (text, { bold = true, size = 10, align = 'left', fill, color = 'FF1F2937', border = LINE, topBorder } = {}) => {
    const cell = mergedRow(r, 1, LAST_COL);
    cell.value = text;
    setFont(cell, { bold, size, color: { argb: color } });
    cell.alignment = { horizontal: align, vertical: 'middle', indent: 1 };
    if (fill) fillRange(r, 1, LAST_COL, fill);
    allBorders(r, 1, LAST_COL, border);
    if (topBorder) for (let col = 1; col <= LAST_COL; col++) ws.getCell(r, col).border = { ...ws.getCell(r, col).border, top: topBorder };
    ws.getRow(r).height = 20;
    r++;
  };

  groups.forEach((group, groupIdx) => {
    const firstItem = group.rows[0]?.item;
    const isSelectedChoice = firstItem && firstItem.is_selected !== false;

    if (group.optionHeader) {
      headingRow(`Option ${group.optionHeader.no}: ${group.optionHeader.selected ? '✔ Selected Choice' : '◯ Alternative Choice'}`, {
        size: 11,
        fill: group.optionHeader.selected ? 'FFEEF2FF' : 'FFF1F5F9',
        color: group.optionHeader.selected ? 'FF111827' : 'FF475569',
        border: 'FF94A3B8',
        topBorder: { style: 'medium', color: { argb: 'FF475569' } },
      });
    }
    if (group.sectionHeader) {
      headingRow(group.sectionHeader, { size: 10, fill: GREY_LIGHT });
    }
    if (group.optionLabel) {
      headingRow(`${group.optionLabel}: ${isSelectedChoice ? '✔ Selected Choice' : '⚪ Alternative Choice'}`, {
        size: 11,
        align: 'center',
        fill: isSelectedChoice ? 'FFFFFFFF' : 'FFF8FAFC',
        color: isSelectedChoice ? 'FF111827' : 'FF475569',
      });
    }

    const { sqft, amount } = groupTotals(group);
    const unitPrice = parseFloat(firstItem?.unit_price) || 0;
    const dim = isSelectedChoice ? 'FF000000' : 'FF64748B';
    const spec = hasSpecification(firstItem) ? htmlToPlainText(lineSpecification(firstItem)) : '';
    const name = firstItem?.product?.name || 'Blind Item';

    const runs = [{ text: name, font: { name: FONT, size: 10, bold: true, color: { argb: 'FF111111' } } }];
    if (spec) runs.push({ text: `\n${spec}`, font: { name: FONT, size: 9, color: { argb: 'FF333333' } } });
    if (!isSelectedChoice) runs.push({ text: '\n(Alternative Choice)', font: { name: FONT, size: 8, italic: true, color: { argb: 'FF64748B' } } });

    const cells = [
      { value: groupIdx + 1, align: 'center', bold: true },
      { value: { richText: runs }, align: 'left', wrap: true },
      { value: firstItem?.product?.product_code || firstItem?.variant?.name || '-', align: 'center', bold: true },
      { value: Number(sqft.toFixed(2)), align: 'center', bold: true, fmt: '0.00' },
      { value: Number(unitPrice.toFixed(2)), align: 'right', bold: true, fmt: '0.00' },
      { value: Number(amount.toFixed(2)), align: 'right', bold: true, fmt: money },
    ];
    cells.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = c.value;
      if (i !== 1) setFont(cell, { bold: Boolean(c.bold), size: 10, color: { argb: dim } });
      cell.alignment = { horizontal: c.align, vertical: 'top', wrapText: Boolean(c.wrap), indent: i === 1 ? 1 : 0 };
      if (c.fmt) cell.numFmt = c.fmt;
    });
    allBorders(r, 1, LAST_COL);
    const textLines = 1 + (spec ? lineCount(spec, 62) : 0) + (isSelectedChoice ? 0 : 1);
    ws.getRow(r).height = Math.max(20, textLines * 13 + 8);
    r++;

    if (group.optionFooter) {
      const { no, selected, total } = group.optionFooter;
      const label = mergedRow(r, 1, LAST_COL - 1);
      label.value = `Option ${no} Total${selected ? '' : ' (Alternative - not included in Sub Total)'}`;
      setFont(label, { bold: true, size: 10, color: { argb: selected ? 'FF111827' : 'FF64748B' } });
      label.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      const val = ws.getCell(r, LAST_COL);
      val.value = Number(Number(total).toFixed(2));
      val.numFmt = money;
      setFont(val, { bold: true, size: 10, color: { argb: selected ? 'FF111827' : 'FF64748B' } });
      val.alignment = { horizontal: 'right', vertical: 'middle' };
      fillRange(r, 1, LAST_COL, 'FFF8FAFC');
      allBorders(r, 1, LAST_COL);
      ws.getRow(r).height = 20;
      r++;
    }
  });

  // ── charge rows, VAT, note, Sub Total ────────────────────────────────────
  let serial = groups.length;
  const chargeRow = (indexValue, label, amountValue) => {
    const idx = ws.getCell(r, 1);
    idx.value = indexValue;
    setFont(idx, { bold: true, size: 10 });
    idx.alignment = { horizontal: 'center', vertical: 'middle' };
    const text = mergedRow(r, 2, LAST_COL - 1);
    text.value = label;
    setFont(text, { bold: true, size: 10 });
    text.alignment = { vertical: 'middle', indent: 1 };
    const val = ws.getCell(r, LAST_COL);
    val.value = Number(Number(amountValue).toFixed(2));
    val.numFmt = money;
    setFont(val, { bold: true, size: 10 });
    val.alignment = { horizontal: 'right', vertical: 'middle' };
    allBorders(r, 1, LAST_COL);
    ws.getRow(r).height = 20;
    r++;
  };

  if (parseFloat(quotation.convenience_charge) > 0) {
    serial += 1;
    chargeRow(serial, 'Transportation / Service Charge', quotation.convenience_charge);
  }
  if (parseFloat(quotation.other_charge) > 0) {
    serial += 1;
    chargeRow(serial, quotation.other_charge_label || 'Other Installation Charges', quotation.other_charge);
  }
  if (parseFloat(quotation.vat_percentage) > 0) {
    chargeRow('-', `VAT % (${quotation.vat_percentage}%)`, parseFloat(quotation.vat_amount) || 0);
  }

  if ((!quotation.vat_percentage || parseFloat(quotation.vat_percentage) <= 0) && quotation.show_tax_exclusion_note !== false) {
    const note = mergedRow(r, 1, LAST_COL);
    note.value = 'All prices quoted above are excluding VAT & TAX';
    setFont(note, { italic: true, size: 9, color: { argb: 'FF333333' } });
    note.alignment = { vertical: 'middle', indent: 1 };
    fillRange(r, 1, LAST_COL, GREY_LIGHT);
    allBorders(r, 1, LAST_COL);
    ws.getRow(r).height = 18;
    r++;
  }

  const subLabel = mergedRow(r, 1, LAST_COL - 1);
  subLabel.value = 'Sub Total';
  setFont(subLabel, { bold: true, size: 11 });
  subLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const subVal = ws.getCell(r, LAST_COL);
  subVal.value = Number(netTotal.toFixed(2));
  subVal.numFmt = money;
  setFont(subVal, { bold: true, size: 11 });
  subVal.alignment = { horizontal: 'right', vertical: 'middle' };
  fillRange(r, 1, LAST_COL, GREY_HEAD);
  allBorders(r, 1, LAST_COL, LINE_DARK);
  ws.getRow(r).height = 22;
  r++;

  // ── amount in words ───────────────────────────────────────────────────────
  ws.getRow(r).height = 8;
  r++;
  const words = numberToWords(netTotal);
  const wordsLabel = ws.getCell(r, 1);
  ws.mergeCells(r, 1, r, 2);
  wordsLabel.value = 'Amount in Words';
  setFont(wordsLabel, { bold: true, size: 10, color: { argb: 'FF111111' } });
  wordsLabel.alignment = { vertical: 'middle', indent: 1 };
  fillRange(r, 1, 2, GREY_LABEL);
  const wordsText = mergedRow(r, 3, LAST_COL);
  wordsText.value = words;
  setFont(wordsText, { size: 10, color: { argb: 'FF111111' } });
  wordsText.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
  allBorders(r, 1, LAST_COL, 'FFD1D5DB');
  ws.getRow(r).height = Math.max(22, lineCount(words, 50) * 14 + 6);
  r++;

  // ── remarks ───────────────────────────────────────────────────────────────
  if (quotation.note) {
    ws.getRow(r).height = 6;
    r++;
    const remarkText = htmlToPlainText(quotation.note);
    const cell = mergedRow(r, 1, LAST_COL);
    cell.value = { richText: [
      { text: 'Remarks: ', font: { name: FONT, size: 9, bold: true, color: { argb: 'FF333333' } } },
      { text: remarkText, font: { name: FONT, size: 9, color: { argb: 'FF333333' } } },
    ] };
    cell.alignment = { vertical: 'top', wrapText: true };
    ws.getRow(r).height = Math.max(16, lineCount(`Remarks: ${remarkText}`, 125) * 12 + 4);
    r++;
  }

  // ── signatures ────────────────────────────────────────────────────────────
  ws.getRow(r).height = 12;
  r++;
  const confirm = mergedRow(r, 1, 3);
  confirm.value = 'Please Confirm Acceptance of this Quote';
  setFont(confirm, { bold: true, size: 10, color: { argb: 'FF111111' } });
  const sign = mergedRow(r, 4, LAST_COL);
  sign.value = 'Authorized Signature';
  setFont(sign, { bold: true, size: 10, color: { argb: 'FF111111' } });
  sign.alignment = { horizontal: 'center' };
  ws.getRow(r).height = 18;
  r++;

  mergedRow(r, 1, 3);
  mergedRow(r, 4, LAST_COL);
  fillRange(r, 1, 3, GREY_LIGHT);
  fillRange(r, 4, LAST_COL, GREY_LIGHT);
  outline(r, 1, r, 3, thin());
  outline(r, 4, r, LAST_COL, thin());
  ws.getRow(r).height = 28;
  r++;

  const footer = mergedRow(r, 4, LAST_COL);
  footer.value = brand.footerName;
  setFont(footer, { bold: true, size: 10, color: { argb: 'FF000000' } });
  footer.alignment = { horizontal: 'center' };
  ws.getRow(r).height = 18;
  r++;

  // ── terms & conditions ────────────────────────────────────────────────────
  ws.getRow(r).height = 8;
  r++;
  const termsHead = mergedRow(r, 1, LAST_COL);
  termsHead.value = 'TERMS & CONDITIONS:';
  setFont(termsHead, { bold: true, size: 9, color: { argb: 'FF000000' } });
  ws.getRow(r).height = 15;
  r++;

  const terms = (brand.termsConditions
    || `You'll have to make 50% of the total payment at the time of placing order with (PO) and the remaining 50% is to be paid after completion of the decoration.\nPlease make your payment by cash or cheque in favour of "${brand.chequeFavourName}" we hope you'll find ours rates reasonable and place an order with us.`
  ).replace(/\s*\n\s*/g, ' ').trim();
  const termsCell = mergedRow(r, 1, LAST_COL);
  termsCell.value = terms;
  setFont(termsCell, { size: 8.5, color: { argb: 'FF333333' } });
  termsCell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
  fillRange(r, 1, LAST_COL, GREY_LIGHT);
  allBorders(r, 1, LAST_COL, 'FFD1D5DB');
  ws.getRow(r).height = Math.max(26, lineCount(terms, 135) * 12 + 10);

  // Repeat the table header on every printed page, and keep the print area to the sheet.
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + LAST_COL)}${r}`;

  return wb;
}

/** Builds the workbook and saves it through the browser. */
export async function downloadQuotationPadExcel({ quotation, companyProfile, fileName }) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = buildQuotationPadWorkbook(ExcelJS, { quotation, companyProfile });
  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const safe = String(fileName || `Quotation-${quotation.quotation_number}`).replace(/[\\/:*?"<>|]/g, '').trim();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = safe.endsWith('.xlsx') ? safe : `${safe}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
