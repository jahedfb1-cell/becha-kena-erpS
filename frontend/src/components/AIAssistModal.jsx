import React, { useEffect, useRef, useState } from 'react';
import { compressImage, formatBytes } from '../utils/compressImage';
import { parseCustomer, transcribeAudio, markDraftApplied, FIELD_LABELS, AI_WRITABLE_FIELDS } from '../api/aiAssist';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

/**
 * AI Assist — card / text / voice to a reviewed draft (AI_Assist_PRD.md §7).
 *
 * The modal never writes to the form directly. It produces a draft, shows it
 * on a review screen, and only calls onApply() when the user confirms — so a
 * bad extraction costs a correction, never a corrupted record.
 */
const MAX_TEXT = 10000;

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(10,10,30,0.7)',
    backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 1200, padding: '12px',
  },
  modal: {
    background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px',
    maxHeight: '92vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.3)',
  },
  header: {
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '18px 22px',
    color: '#fff', position: 'relative', flexShrink: 0,
  },
  close: {
    position: 'absolute', top: '14px', right: '14px', width: '32px', height: '32px',
    borderRadius: '50%', background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: '17px',
    cursor: 'pointer', lineHeight: 1,
  },
  tabs: { display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 },
  tab: (active) => ({
    flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
    background: active ? '#fff' : 'transparent',
    borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    color: active ? '#6366f1' : '#64748b', fontWeight: active ? 800 : 600,
    fontSize: '13px',
  }),
  body: { padding: '20px', overflowY: 'auto', flex: 1, background: '#f8fafc' },
  textarea: {
    width: '100%', minHeight: '150px', padding: '12px 14px', fontSize: '13.5px',
    border: '1.5px solid #e2e8f0', borderRadius: '10px', resize: 'vertical',
    boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
  },
  primary: (disabled) => ({
    width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
    background: disabled ? '#c7d2fe' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
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
  dropZone: {
    border: '2px dashed #c7d2fe', borderRadius: '12px', padding: '28px 16px',
    textAlign: 'center', background: '#fff', cursor: 'pointer',
  },
  reviewRow: {
    display: 'grid', gridTemplateColumns: '130px 1fr', gap: '10px',
    padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px',
  },
};

const AIAssistModal = ({ isOpen, onClose, onApply }) => {
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const [logId, setLogId] = useState(null);
  const [fromVoice, setFromVoice] = useState(false);

  const fileRef = useRef(null);
  const recorder = useVoiceRecorder();

  // Reset everything when the modal is dismissed so the next open is clean.
  useEffect(() => {
    if (!isOpen) {
      setTab('text'); setText(''); setImageFile(null);
      setImagePreview((p) => { if (p) URL.revokeObjectURL(p); return ''; });
      setBusy(false); setError(''); setDraft(null); setLogId(null); setFromVoice(false);
      recorder.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const pickImage = async (file) => {
    if (!file) return;
    setError('');
    const compressed = await compressImage(file);
    setImageFile(compressed);
    setImagePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(compressed); });
  };

  const runExtract = async () => {
    setError('');
    setBusy(true);
    setBusyLabel(tab === 'screenshot'
      ? 'কার্ড পড়ছে… সাধারণত ১০–৩০ সেকেন্ড লাগে।'
      : 'তথ্য বের করছে…');

    const res = await parseCustomer({
      image: tab === 'screenshot' ? imageFile : null,
      text: tab === 'screenshot' ? '' : text,
      mode: fromVoice ? 'voice' : (tab === 'screenshot' ? 'card' : 'text'),
    });

    setBusy(false);
    if (!res.ok) { setError(res.error); return; }

    const hasAnything = AI_WRITABLE_FIELDS.some((k) => (res.data?.[k] || '').trim() !== '');
    if (!hasAnything) { setError('কোনো তথ্য পাওয়া যায়নি। পরিষ্কার ছবি বা বেশি তথ্য দিন।'); return; }

    setLogId(res.logId);
    setDraft(res.data);
  };

  const applyDraft = () => {
    markDraftApplied(logId); // analytics, deliberately not awaited
    onApply(draft);
  };

  /**
   * PRD §7.5 — the transcript is written into the text tab, never applied to
   * the form directly. A misheard digit reads as perfectly plausible text, so
   * the user gets a cheap chance to catch it before it becomes structured data.
   */
  const runTranscribe = async () => {
    if (!recorder.audioBlob) return;
    setError('');
    setBusy(true);
    setBusyLabel('ভয়েস পড়ছে…');

    const res = await transcribeAudio(recorder.audioBlob);
    setBusy(false);

    if (!res.ok) { setError(res.error); return; }
    if (!res.text.trim()) { setError('কিছু শোনা যায়নি। আবার বলুন।'); return; }

    setText(res.text);
    setFromVoice(true);
    setTab('text');
    recorder.reset();
  };

  const canExtract = tab === 'screenshot' ? !!imageFile : text.trim().length > 0;

  // ---------- Review screen (PRD §7.6) ----------
  if (draft) {
    const rows = AI_WRITABLE_FIELDS
      .map((k) => [k, (draft[k] || '').trim()])
      .filter(([, v]) => v !== '');

    return (
      <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div style={S.modal}>
          <div style={S.header}>
            <div style={{ fontSize: '11px', fontWeight: 800, opacity: 0.85, letterSpacing: '0.5px' }}>REVIEW</div>
            <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800 }}>যা পাওয়া গেছে</h3>
            <button type="button" style={S.close} onClick={onClose}>×</button>
          </div>

          <div style={S.body}>
            <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '12px', padding: '4px 16px' }}>
              {rows.map(([k, v]) => (
                <div key={k} style={S.reviewRow}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>{FIELD_LABELS[k]}</span>
                  <span style={{ color: '#0f172a', fontWeight: 700, whiteSpace: 'pre-line' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '13px' }}>
                নির্ভরযোগ্যতা: {Math.round((draft.confidence || 0) * 100)}%
              </div>
              <div style={{ color: '#92400e', fontSize: '12px', marginTop: '3px' }}>
                AI ভুল করতে পারে — সেভ করার আগে প্রতিটি ফিল্ড মিলিয়ে নিন।
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', padding: '14px 20px', borderTop: '1px solid #e8ecf0', background: '#fff' }}>
            <button type="button" style={{ ...S.primary(false), marginTop: 0, flex: 1 }} onClick={applyDraft}>
              ফর্মে বসান
            </button>
            <button type="button" style={S.ghost} onClick={() => setDraft(null)}>বাতিল</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Input screen ----------
  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={S.header}>
          <div style={{ fontSize: '11px', fontWeight: 800, opacity: 0.85, letterSpacing: '0.5px' }}>✨ AI ASSIST</div>
          <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800 }}>কার্ড, টেক্সট বা ভয়েস থেকে</h3>
          <button type="button" style={S.close} onClick={onClose}>×</button>
        </div>

        <div style={S.tabs}>
          <button type="button" style={S.tab(tab === 'text')} onClick={() => setTab('text')}>Paste text</button>
          <button type="button" style={S.tab(tab === 'screenshot')} onClick={() => setTab('screenshot')}>Screenshot</button>
          <button type="button" style={S.tab(tab === 'voice')} onClick={() => setTab('voice')}>Voice</button>
        </div>

        <div style={S.body}>
          {error && <div style={S.errorBox}>⚠️ {error}</div>}

          {busy && (
            <div style={{ textAlign: 'center', padding: '26px 0' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#475569', fontSize: '13px' }}>{busyLabel}</div>
            </div>
          )}

          {!busy && tab === 'text' && (
            <>
              {fromVoice && (
                <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#4338ca', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, marginBottom: '10px' }}>
                  🎤 ভয়েস থেকে — মিলিয়ে নিন
                </div>
              )}
              <textarea
                style={S.textarea}
                value={text}
                maxLength={MAX_TEXT}
                onChange={(e) => { setText(e.target.value); if (fromVoice) setFromVoice(false); }}
                placeholder="ভিজিটিং কার্ডের লেখা, WhatsApp মেসেজ, ইমেইল সিগনেচার — এখানে পেস্ট করুন"
              />
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                {text.length} / {MAX_TEXT}
              </div>
            </>
          )}

          {!busy && tab === 'screenshot' && (
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
                <div style={S.dropZone} onClick={() => fileRef.current?.click()}>
                  <div style={{ fontSize: '34px' }}>📇</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '6px', fontSize: '14px' }}>ছবি তুলুন বা বাছুন</div>
                  <div style={{ color: '#64748b', fontSize: '12px', marginTop: '3px' }}>JPG, PNG, WEBP</div>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <img src={imagePreview} alt="card preview" style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>{formatBytes(imageFile?.size)}</div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: 700, cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
                    অন্য ছবি বাছুন
                  </button>
                </div>
              )}
            </>
          )}

          {!busy && tab === 'voice' && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              {recorder.error && <div style={S.errorBox}>⚠️ {recorder.error}</div>}

              <button
                type="button"
                onClick={recorder.isRecording ? recorder.stop : recorder.start}
                style={{
                  width: '84px', height: '84px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: recorder.isRecording ? '#dc2626' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                  color: '#fff', fontSize: '30px', boxShadow: '0 8px 22px rgba(99,102,241,0.35)',
                }}
              >
                {recorder.isRecording ? '⏹' : '🎤'}
              </button>

              <div style={{ marginTop: '12px', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {String(Math.floor(recorder.seconds / 60)).padStart(2, '0')}:{String(recorder.seconds % 60).padStart(2, '0')}
                <span style={{ color: '#94a3b8', fontWeight: 600 }}> / {recorder.maxSeconds}s</span>
              </div>
              <div style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>
                {recorder.isRecording ? 'বলুন… থামাতে আবার চাপুন' : 'চাপুন এবং কাস্টমারের তথ্য বলুন'}
              </div>

              {recorder.audioBlob && !recorder.isRecording && (
                <button type="button" style={S.primary(false)} onClick={runTranscribe}>
                  ভয়েস থেকে লেখা বানান
                </button>
              )}
            </div>
          )}

          {!busy && tab !== 'voice' && (
            <button type="button" style={S.primary(!canExtract)} disabled={!canExtract} onClick={runExtract}>
              Extract
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIAssistModal;
