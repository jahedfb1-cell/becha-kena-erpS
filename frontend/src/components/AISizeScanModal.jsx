import React, { useEffect, useRef, useState } from 'react';
import { compressImage, formatBytes } from '../utils/compressImage';
import { parseSizes, markDraftApplied } from '../api/aiAssist';

/**
 * AI Size Scan — a second way to fill the Quotation/Order size grid, next to
 * the existing 📋 Excel-paste button. A site technician's handwritten note or
 * a screenshotted table becomes Width/Height/Pcs rows here.
 *
 * Same review-before-apply shape as AIAssistModal: nothing is written to the
 * size grid until the salesman confirms the (editable) table below, because
 * a misread "60" as "80" becomes a wrong purchase order and a wrong invoice.
 */
const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(10,10,30,0.7)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1200, padding: '12px',
  },
  modal: {
    background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '620px',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
  },
  header: {
    background: 'linear-gradient(135deg,#0891b2,#0e7490)', padding: '18px 22px',
    color: '#fff', position: 'relative', flexShrink: 0,
  },
  close: {
    position: 'absolute', top: '14px', right: '14px', width: '32px', height: '32px',
    borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: '17px',
    cursor: 'pointer', lineHeight: 1,
  },
  body: { padding: '20px', overflowY: 'auto', flex: 1, background: '#f8fafc' },
  primary: (disabled) => ({
    width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
    background: disabled ? '#a5f3fc' : 'linear-gradient(135deg,#0891b2,#0e7490)',
    color: '#fff', fontWeight: 800, fontSize: '14px',
    cursor: disabled ? 'not-allowed' : 'pointer', marginTop: '14px',
  }),
  ghost: {
    padding: '10px 18px', borderRadius: '10px', border: '1.5px solid #e2e8f0',
    background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: '13px',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    borderRadius: '10px', padding: '11px 14px', fontSize: '13px', marginBottom: '14px',
  },
  dropZone: (active) => ({
    border: `2px dashed ${active ? '#0891b2' : '#a5f3fc'}`, borderRadius: '12px',
    padding: '32px 16px', textAlign: 'center',
    background: active ? '#ecfeff' : '#fff', cursor: 'pointer', transition: 'all 0.15s',
  }),
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '8px 6px', color: '#64748b', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #e2e8f0' },
  td: { padding: '6px', borderBottom: '1px solid #f1f5f9' },
  cellInput: {
    width: '100%', padding: '7px 8px', fontSize: '13px', border: '1.5px solid #e2e8f0',
    borderRadius: '6px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
    boxSizing: 'border-box',
  },
};

const emptyRow = () => ({ id: Date.now() + Math.random(), width: '', height: '', pcs: 1 });

const AISizeScanModal = ({ isOpen, onClose, onApply }) => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confidence, setConfidence] = useState(null);
  const [logId, setLogId] = useState(null);
  const [rows, setRows] = useState(null); // null = still on the upload step
  const [dragActive, setDragActive] = useState(false);

  const fileRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setImageFile(null);
      setImagePreview((p) => { if (p) URL.revokeObjectURL(p); return ''; });
      setBusy(false); setError(''); setConfidence(null); setLogId(null);
      setRows(null); setDragActive(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const pickImage = async (file) => {
    if (!file || !file.type?.startsWith('image/')) {
      setError('শুধু ছবি ফাইল দেওয়া যাবে।');
      return;
    }
    setError('');
    const compressed = await compressImage(file);
    setImageFile(compressed);
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(compressed); });
  };

  // Paste anywhere in the modal — the whole point of a screenshot workflow
  // is not having to save the file first. A plain function, not useCallback:
  // it's declared after the `if (!isOpen) return null;` above, so a hook here
  // would run a different number of times between the open and closed render
  // and violate the Rules of Hooks.
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) { pickImage(file); e.preventDefault(); }
        return;
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) pickImage(file);
  };

  const runExtract = async () => {
    if (!imageFile) return;
    setError('');
    setBusy(true);

    const res = await parseSizes(imageFile);
    setBusy(false);

    if (!res.ok) { setError(res.error); return; }
    if (res.sizes.length === 0) {
      setError('কোনো সাইজ পাওয়া যায়নি। পরিষ্কার ছবি দিন বা হাতে লিখুন।');
      return;
    }

    setConfidence(res.confidence);
    setLogId(res.logId);
    setRows(res.sizes.map((s) => ({
      id: Date.now() + Math.random(),
      width: s.width,
      height: s.height,
      pcs: s.pcs,
    })));
  };

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    setRows((prev) => [...(prev || []), emptyRow()]);
  };

  const validRows = (rows || []).filter((r) => parseFloat(r.width) > 0 && parseFloat(r.height) > 0);

  const apply = () => {
    markDraftApplied(logId); // analytics, deliberately not awaited
    onApply(validRows.map((r) => ({
      width: parseFloat(r.width) || 0,
      height: parseFloat(r.height) || 0,
      pcs: parseInt(r.pcs, 10) || 1,
    })));
  };

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()} onPaste={handlePaste}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ fontSize: '11px', fontWeight: 800, opacity: 0.85, letterSpacing: '0.5px' }}>🪄 AI SIZE SCAN</div>
          <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800 }}>
            {rows ? 'সাইজ যাচাই করুন' : 'হাতে লেখা মাপ থেকে অটো-ফিল'}
          </h3>
          <button type="button" style={S.close} onClick={onClose}>×</button>
        </div>

        <div style={S.body}>
          {error && <div style={S.errorBox}>⚠️ {error}</div>}

          {busy && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#475569', fontSize: '13px' }}>মাপ পড়ছে… ১০–২০ সেকেন্ড লাগতে পারে।</div>
            </div>
          )}

          {/* ---- Step 1: image ---- */}
          {!busy && !rows && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                style={{ display: 'none' }}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />

              {!imagePreview ? (
                <div
                  style={S.dropZone(dragActive)}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <div style={{ fontSize: '34px' }}>📐</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '6px', fontSize: '14px' }}>
                    ছবি টেনে আনুন, বাছুন, বা পেস্ট করুন (Ctrl+V)
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>
                    হাতে লেখা মাপ, স্কেচ, বা টেবিলের স্ক্রিনশট
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <img src={imagePreview} alt="size sheet preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>{formatBytes(imageFile?.size)}</div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ background: 'none', border: 'none', color: '#0891b2', fontWeight: 700, cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                    অন্য ছবি বাছুন
                  </button>
                </div>
              )}

              <button type="button" style={S.primary(!imageFile)} disabled={!imageFile} onClick={runExtract}>
                Extract Sizes
              </button>
            </>
          )}

          {/* ---- Step 2: review table ---- */}
          {!busy && rows && (
            <>
              {confidence !== null && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px' }}>
                  <div style={{ fontWeight: 800, color: '#92400e', fontSize: '13px' }}>
                    নির্ভরযোগ্যতা: {Math.round(confidence * 100)}%
                  </div>
                  <div style={{ color: '#92400e', fontSize: '12px', marginTop: '2px' }}>
                    প্রতিটা সাইজ মিলিয়ে নিন — ভুল সাইজ মানে ভুল অর্ডার।
                  </div>
                </div>
              )}

              <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '12px', padding: '4px 12px', overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Width</th>
                      <th style={S.th}>Height</th>
                      <th style={S.th}>Pcs</th>
                      <th style={S.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td style={S.td}>
                          <input type="number" inputMode="decimal" style={S.cellInput}
                            value={r.width} onChange={(e) => updateRow(r.id, 'width', e.target.value)} />
                        </td>
                        <td style={S.td}>
                          <input type="number" inputMode="decimal" style={S.cellInput}
                            value={r.height} onChange={(e) => updateRow(r.id, 'height', e.target.value)} />
                        </td>
                        <td style={S.td}>
                          <input type="number" inputMode="numeric" style={S.cellInput}
                            value={r.pcs} onChange={(e) => updateRow(r.id, 'pcs', e.target.value)} />
                        </td>
                        <td style={{ ...S.td, textAlign: 'center' }}>
                          <button type="button" onClick={() => removeRow(r.id)}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '15px' }}
                            title="Remove this row">
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" onClick={addRow}
                style={{ marginTop: '10px', background: 'none', border: '1.5px dashed #cbd5e1', borderRadius: '8px', padding: '7px 14px', color: '#475569', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                ➕ Add row
              </button>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button type="button" style={{ ...S.primary(validRows.length === 0), marginTop: 0, flex: 1 }}
                  disabled={validRows.length === 0} onClick={apply}>
                  {validRows.length} সাইজ যোগ করুন
                </button>
                <button type="button" style={S.ghost} onClick={() => { setRows(null); setConfidence(null); }}>
                  ↩ আবার
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AISizeScanModal;
