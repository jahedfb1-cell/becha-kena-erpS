/**
 * Copies a product block's Width / Height / Pcs rows to the clipboard as
 * tab-separated text with a header line, e.g.
 *
 *   Width	Height	Pcs
 *   48	60	2
 *   36	72	1
 *
 * Tabs make it paste into Excel / Google Sheets as three real columns, and
 * it pastes straight back into the quotation builder's own "Excel" paste box
 * too (that importer skips the non-numeric header line).
 *
 * Rows with nothing in them are left out. Resolves true on success.
 */
export function sizesToText(sizes = []) {
  const lines = ['Width\tHeight\tPcs'];
  sizes.forEach((s) => {
    const w = s.width ?? '';
    const h = s.height ?? '';
    const pcs = s.pcs ?? '';
    if (`${w}${h}`.trim() === '' && (pcs === '' || pcs === null)) return;
    lines.push(`${w}\t${h}\t${pcs}`);
  });
  return lines.join('\n');
}

export async function copySizesToClipboard(sizes) {
  const text = sizesToText(sizes);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to the textarea fallback (older WebViews, http origins)
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}
