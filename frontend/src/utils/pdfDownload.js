// Client-side "Download PDF" for the print pages, as a robust alternative to
// the browser's own "Print > Save as PDF" flow. That flow takes its
// suggested filename from document.title at the moment the OS print/save
// dialog opens — which depends on browser/OS timing and quirks (Chrome
// version, extensions, how the print was triggered) that we cannot fully
// control from the page. This instead renders the .printable-area DOM node
// straight to a PDF Blob with html2pdf.js and triggers a real download via
// the <a download> attribute, whose filename every browser honors
// unconditionally — no print dialog, no document.title dependency.
let html2pdfPromise = null;

const loadHtml2Pdf = () => {
  if (window.html2pdf) return Promise.resolve(window.html2pdf);
  if (html2pdfPromise) return html2pdfPromise;
  html2pdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => resolve(window.html2pdf);
    script.onerror = (err) => { html2pdfPromise = null; reject(err); };
    document.head.appendChild(script);
  });
  return html2pdfPromise;
};

/**
 * Renders `selector` (default: the print pages' shared `.printable-area`
 * content wrapper) to a PDF and downloads it as `filename`. Uses the same
 * A4 portrait page and 8mm/10mm margins as the print stylesheet's @page
 * rule (see index.css), so the PDF matches what the browser's own Print
 * button produces.
 */
export const downloadPrintPdf = async (filename, { selector = '.printable-area' } = {}) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error('Printable content not found on this page.');

  const html2pdf = await loadHtml2Pdf();
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;

  const opt = {
    margin: [8, 10, 8, 10],
    filename: safeName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  };

  const pdfBlob = await html2pdf().from(element).set(opt).output('blob');
  const url = URL.createObjectURL(pdfBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
