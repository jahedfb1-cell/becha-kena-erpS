import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import { formatCurrency } from '../utils/format';

/**
 * Creates and edits a courier booking slip for a confirmed order.
 *
 * Everything on the slip is editable on purpose. The backend seeds a first
 * draft from the order (one line per category, Vertical and PVC split into
 * fabric + channels, COD = order total less advances already taken), but the
 * real parcel count and the real person collecting the goods are only known
 * at packing time — so the rules save typing and never decide anything.
 *
 * One order can carry several slips: part shipments, or a reshipment after a
 * courier return. The chips along the top switch between them.
 *
 * See CourierBookingController / CourierBookingService. The printed sheet is
 * a standalone route (/courier-bookings/print/:id), never this modal.
 */
const EMPTY_LINE = { description: '', colour: '', bundles: '1' };

const CourierBookingModal = ({ isOpen, onClose, order, onSaved }) => {
  const [bookings, setBookings] = useState([]);
  const [activeId, setActiveId] = useState(null); // null = composing a new slip
  const [phoneOptions, setPhoneOptions] = useState([]);
  const [suggestedCod, setSuggestedCod] = useState(0);

  const [form, setForm] = useState(null);
  const [lines, setLines] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedBanner, setSavedBanner] = useState('');

  const applyRecord = (record) => {
    setForm({
      booking_number: record.booking_number || '',
      booking_date: (record.booking_date || '').substring(0, 10) || new Date().toISOString().substring(0, 10),
      receiver_name: record.receiver_name || '',
      receiver_phone: record.receiver_phone || '',
      receiver_address: record.receiver_address || '',
      receiver_is_company: record.receiver_is_company !== false,
      courier_name: record.courier_name || '',
      cod_enabled: record.cod_enabled !== false,
      cod_amount: record.cod_amount != null ? String(record.cod_amount) : '0',
      cod_label: record.cod_label || "COD 'Condition Tk",
      status: record.status || 'pending',
      notes: record.notes || '',
    });
    setLines(
      (record.lines || []).length > 0
        ? record.lines.map((l) => ({
            description: l.description || '',
            colour: l.colour || '',
            bundles: l.bundles != null ? String(parseFloat(l.bundles)) : '1',
          }))
        : [{ ...EMPTY_LINE }]
    );
  };

  // Load a fresh draft from the order. Used both when the order has no slip
  // yet and when the user asks for an additional one.
  const loadDraft = useCallback(async () => {
    if (!order?.id) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.get(`/courier-bookings/draft/${order.id}`);
      const draft = res.data?.data || {};
      setPhoneOptions(draft.phone_options || []);
      setSuggestedCod(parseFloat(draft.cod_amount) || 0);
      setActiveId(null);
      applyRecord(draft);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to prepare a booking slip for this order.');
    } finally {
      setLoading(false);
    }
  }, [order?.id]);

  useEffect(() => {
    if (!isOpen || !order?.id) return;
    setSavedBanner('');
    setError('');
    (async () => {
      setLoading(true);
      try {
        const [listRes, draftRes] = await Promise.all([
          api.get('/courier-bookings', { params: { quotation_id: order.id, all: 1 } }),
          api.get(`/courier-bookings/draft/${order.id}`),
        ]);
        const existing = listRes.data?.data || [];
        const draft = draftRes.data?.data || {};

        setBookings(existing);
        setPhoneOptions(draft.phone_options || []);
        setSuggestedCod(parseFloat(draft.cod_amount) || 0);

        // Open straight onto the newest existing slip if there is one, so
        // reopening the modal shows what was last printed rather than
        // silently starting a second slip.
        if (existing.length > 0) {
          setActiveId(existing[0].id);
          applyRecord(existing[0]);
        } else {
          setActiveId(null);
          applyRecord(draft);
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load courier bookings for this order.');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order?.id]);

  // The form itself renders only once the draft/record has arrived (see the
  // loading branch below), so this guard only has to cover "no order at all".
  if (!isOpen || !order) return null;

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectExisting = (booking) => {
    setSavedBanner('');
    setError('');
    setActiveId(booking.id);
    applyRecord(booking);
  };

  // Switching the receiver back to the company restores what we hold on the
  // customer record; switching to a staff member clears the fields rather
  // than leaving the company's details to be edited over, which is how a
  // half-corrected company name used to end up on a slip.
  const toggleReceiverKind = (isCompany) => {
    const customer = order.customer || {};
    setForm((prev) => ({
      ...prev,
      receiver_is_company: isCompany,
      receiver_name: isCompany ? (customer.company_name || customer.name || '') : '',
      receiver_phone: isCompany ? (customer.phone || '') : '',
      receiver_address: isCompany ? (order.delivery_address || customer.address || '') : '',
    }));
  };

  const updateLine = (index, key, value) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  };

  const addLine = () => setLines((prev) => [...prev, { ...EMPTY_LINE }]);

  const removeLine = (index) => {
    setLines((prev) => (prev.length === 1 ? [{ ...EMPTY_LINE }] : prev.filter((_, i) => i !== index)));
  };

  const moveLine = (index, delta) => {
    setLines((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const totalBundles = lines.reduce((sum, l) => sum + (parseFloat(l.bundles) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = {
      ...form,
      cod_amount: parseFloat(form.cod_amount) || 0,
      lines: lines
        .filter((l) => String(l.description).trim() !== '')
        .map((l, index) => ({
          description: l.description.trim(),
          colour: String(l.colour || '').trim() || null,
          bundles: parseFloat(l.bundles) || 0,
          sort_order: index,
        })),
    };

    if (payload.lines.length === 0) {
      setError('Add at least one bundle line before saving the slip.');
      return;
    }

    setSaving(true);
    try {
      let saved;
      if (activeId) {
        const res = await api.put(`/courier-bookings/${activeId}`, payload);
        saved = res.data?.data;
      } else {
        const res = await api.post('/courier-bookings', { ...payload, quotation_id: order.id });
        saved = res.data?.data;
      }

      // Refresh the chip list so a newly created slip is selectable and an
      // edited one shows its current number.
      const listRes = await api.get('/courier-bookings', { params: { quotation_id: order.id, all: 1 } });
      setBookings(listRes.data?.data || []);

      if (saved?.id) {
        setActiveId(saved.id);
        applyRecord(saved);
        setSavedBanner(`Booking slip ${saved.booking_number} saved.`);
      }

      if (onSaved) onSaved(saved);
    } catch (err) {
      const resp = err.response?.data;
      const details = resp?.errors ? Object.values(resp.errors).flat().join('\n') : '';
      setError([resp?.message || 'Failed to save the booking slip.', details].filter(Boolean).join('\n'));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!activeId) return;
    if (!window.confirm(`Archive booking slip ${form.booking_number}? It will no longer appear against this order.`)) return;
    setSaving(true);
    try {
      await api.delete(`/courier-bookings/${activeId}`);
      const listRes = await api.get('/courier-bookings', { params: { quotation_id: order.id, all: 1 } });
      const remaining = listRes.data?.data || [];
      setBookings(remaining);
      if (remaining.length > 0) {
        selectExisting(remaining[0]);
      } else {
        await loadDraft();
      }
      if (onSaved) onSaved(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to archive the booking slip.');
    } finally {
      setSaving(false);
    }
  };

  const orderTotal = parseFloat(order.net_amount) || 0;
  const advanced = Math.max(0, orderTotal - suggestedCod);

  return (
    <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '860px' }}>
        <div className="custom-modal-header" style={{ background: 'linear-gradient(135deg, rgba(13, 148, 136, 0.22) 0%, rgba(45, 212, 191, 0.22) 100%)', borderBottom: '1px solid rgba(45, 212, 191, 0.3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#5eead4', fontWeight: 800 }}>
              📦 Courier Booking Slip
            </div>
            <h2 className="custom-modal-title" style={{ marginTop: '4px' }}>Order #{order.quotation_number}</h2>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
              Customer: <strong>{order.customer?.company_name || order.customer?.name || '—'}</strong>
            </div>
          </div>
          <button type="button" className="custom-modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Money context. The slip itself prints no prices — these figures are
            here only so the COD amount can be sanity-checked before printing. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', padding: '12px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Order Total</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>{formatCurrency(orderTotal)}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Already Advanced</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#60a5fa' }}>{formatCurrency(advanced)}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Suggested COD</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>{formatCurrency(suggestedCod)}</div>
          </div>
        </div>

        {/* Slip switcher — an order can have more than one. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {bookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => selectExisting(b)}
              style={{
                padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                border: activeId === b.id ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.15)',
                background: activeId === b.id ? 'rgba(13,148,136,0.3)' : 'rgba(255,255,255,0.05)',
                color: activeId === b.id ? '#5eead4' : '#cbd5e1',
              }}
            >
              No {b.booking_number}
            </button>
          ))}
          <button
            type="button"
            onClick={loadDraft}
            style={{
              padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              border: activeId === null ? '1px solid rgba(45,212,191,0.6)' : '1px dashed rgba(255,255,255,0.25)',
              background: activeId === null ? 'rgba(13,148,136,0.3)' : 'transparent',
              color: activeId === null ? '#5eead4' : '#94a3b8',
            }}
          >
            + New Slip
          </button>
          {activeId && (
            <a
              href={`/courier-bookings/print/${activeId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 'auto', padding: '4px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: 'rgba(37,99,235,0.25)', border: '1px solid rgba(96,165,250,0.45)', color: '#bfdbfe', textDecoration: 'none' }}
            >
              🖨️ Print Slip
            </a>
          )}
        </div>

        {loading || !form ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Loading booking slip...</div>
        ) : (
          <form onSubmit={handleSubmit} className="custom-modal-form">
            {savedBanner && (
              <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(52,211,153,0.4)', color: '#6ee7b7', padding: '10px 16px', borderRadius: '10px', fontSize: '12.5px' }}>
                ✅ {savedBanner}
              </div>
            )}
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.5)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', whiteSpace: 'pre-line' }}>
                ⚠️ {error}
              </div>
            )}

            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">Slip No.</label>
                <input type="text" value={form.booking_number} onChange={set('booking_number')} disabled={saving} className="custom-form-input" placeholder="e.g. 26-02" />
              </div>
              <div className="custom-form-group">
                <label className="custom-form-label">Date *</label>
                <input type="date" value={form.booking_date} onChange={set('booking_date')} disabled={saving} required className="custom-form-input" />
              </div>
            </div>

            {/* ── RECEIVER ──
                Parcels are regularly booked in the name of a staff member of
                the customer company, at a different address and on a different
                phone. That person is recorded here, on the slip, and never
                written back to the customer record — so each slip keeps its
                own truthful history and the customer master stays clean. */}
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Who is receiving the parcel?</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => toggleReceiverKind(true)}
                    disabled={saving}
                    style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      border: form.receiver_is_company ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.15)',
                      background: form.receiver_is_company ? 'rgba(13,148,136,0.3)' : 'rgba(255,255,255,0.05)',
                      color: form.receiver_is_company ? '#5eead4' : '#cbd5e1',
                    }}
                  >
                    🏢 Company
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleReceiverKind(false)}
                    disabled={saving}
                    style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                      border: !form.receiver_is_company ? '1px solid rgba(45,212,191,0.6)' : '1px solid rgba(255,255,255,0.15)',
                      background: !form.receiver_is_company ? 'rgba(13,148,136,0.3)' : 'rgba(255,255,255,0.05)',
                      color: !form.receiver_is_company ? '#5eead4' : '#cbd5e1',
                    }}
                  >
                    👤 Staff / Other Person
                  </button>
                </div>
              </div>

              <div className="custom-form-grid">
                <div className="custom-form-group">
                  <label className="custom-form-label">Receiver Name *</label>
                  <input type="text" value={form.receiver_name} onChange={set('receiver_name')} disabled={saving} required className="custom-form-input" placeholder="e.g. Anwar Hossain Anik" />
                </div>
                <div className="custom-form-group">
                  <label className="custom-form-label">Phone No.</label>
                  <input type="text" value={form.receiver_phone} onChange={set('receiver_phone')} disabled={saving} className="custom-form-input" placeholder="e.g. 01843151791" list="courier-phone-options" />
                  <datalist id="courier-phone-options">
                    {phoneOptions.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">Address</label>
                <input type="text" value={form.receiver_address} onChange={set('receiver_address')} disabled={saving} className="custom-form-input" placeholder="e.g. Rangamati" />
              </div>
            </div>

            {/* ── BUNDLE LINES ──
                Seeded from the order's categories (Roller/Zebra pack as one
                line; Vertical and PVC split into fabric + channels) and then
                edited freely — the counter staff decide the final line-up. */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Bundles ({totalBundles.toFixed(2)} total)</span>
                <button
                  type="button"
                  onClick={addLine}
                  disabled={saving}
                  style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(45,212,191,0.4)', background: 'rgba(13,148,136,0.2)', fontSize: '12px', fontWeight: 700, color: '#5eead4', cursor: 'pointer' }}
                >
                  ➕ Add Line
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lines.map((line, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 130px 90px auto', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', fontWeight: 700 }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(index, 'description', e.target.value)}
                      disabled={saving}
                      className="custom-form-input"
                      placeholder="Description of goods"
                    />
                    <input
                      type="text"
                      value={line.colour}
                      onChange={(e) => updateLine(index, 'colour', e.target.value)}
                      disabled={saving}
                      className="custom-form-input"
                      placeholder="Colour"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.bundles}
                      onChange={(e) => updateLine(index, 'bundles', e.target.value)}
                      disabled={saving}
                      className="custom-form-input"
                      placeholder="Bundles"
                    />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button type="button" onClick={() => moveLine(index, -1)} disabled={saving || index === 0} title="Move up" style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer' }}>↑</button>
                      <button type="button" onClick={() => moveLine(index, 1)} disabled={saving || index === lines.length - 1} title="Move down" style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer' }}>↓</button>
                      <button type="button" onClick={() => removeLine(index)} disabled={saving} title="Remove line" style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── COD ──
                The only money figure that gets printed. Switched off for a
                consignment that is courier-charge-only, so a fully prepaid
                parcel never goes out with a collectable amount on it. */}
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '14px 16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: '#f8fafc', cursor: 'pointer', marginBottom: form.cod_enabled ? '10px' : 0 }}>
                <input type="checkbox" checked={form.cod_enabled} onChange={set('cod_enabled')} disabled={saving} />
                Print a COD amount on this slip
              </label>
              {!form.cod_enabled && (
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                  Off — nothing to collect. Use this when the customer has paid in full, or when only the courier's own charge applies.
                </div>
              )}
              {form.cod_enabled && (
                <div className="custom-form-grid">
                  <div className="custom-form-group">
                    <label className="custom-form-label">COD Amount (৳) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.cod_amount}
                      onChange={set('cod_amount')}
                      disabled={saving}
                      className="custom-form-input"
                      style={{ fontSize: '15px', fontWeight: 'bold', color: '#fbbf24' }}
                    />
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, cod_amount: suggestedCod.toFixed(2) }))}
                      disabled={saving}
                      style={{ marginTop: '6px', padding: '3px 10px', borderRadius: '6px', border: '1px solid rgba(52,211,153,0.4)', background: 'rgba(16,185,129,0.15)', fontSize: '11.5px', fontWeight: 700, color: '#34d399', cursor: 'pointer' }}
                    >
                      ⚡ Use suggested ({formatCurrency(suggestedCod)})
                    </button>
                  </div>
                  <div className="custom-form-group">
                    <label className="custom-form-label">Printed Label</label>
                    <input type="text" value={form.cod_label} onChange={set('cod_label')} disabled={saving} className="custom-form-input" placeholder="COD 'Condition Tk" />
                  </div>
                </div>
              )}
            </div>

            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">Courier Name</label>
                <input type="text" value={form.courier_name} onChange={set('courier_name')} disabled={saving} className="custom-form-input" placeholder="e.g. Sundarban, SA Paribahan" />
              </div>
              <div className="custom-form-group">
                <label className="custom-form-label">Status</label>
                <select value={form.status} onChange={set('status')} disabled={saving} className="custom-form-input">
                  <option value="pending">Pending</option>
                  <option value="booked">Booked</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">Notes (printed in the NOTES box)</label>
              <textarea value={form.notes} onChange={set('notes')} disabled={saving} className="custom-form-input" rows={2} placeholder="Optional note for the courier or the receiver" />
            </div>

            <div className="custom-modal-footer">
              {activeId && (
                <button type="button" onClick={handleArchive} disabled={saving} style={{ marginRight: 'auto', padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  🗑 Archive Slip
                </button>
              )}
              <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={saving}>Close</button>
              <button
                type="submit"
                className="btn-modal-submit"
                disabled={saving}
                style={{ background: 'linear-gradient(135deg, #0d9488 0%, #2dd4bf 100%)', color: '#042f2e' }}
              >
                {saving ? 'Saving...' : activeId ? '💾 Save Changes' : '📦 Create Booking Slip'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default CourierBookingModal;
