import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import PhoneContactField from './PhoneContactField';
import AIAssistModal from './AIAssistModal';
import { toFormPatch, findCustomerByPhone } from '../api/aiAssist';
import { useAuth } from '../store/AuthContext';


/**
 * Marks a field the AI filled but the user has not yet confirmed
 * (AI_Assist_PRD.md §10 criterion 9). It disappears the moment the user types
 * in that field, so a badge left standing means "nobody has looked at this".
 */
const AiBadge = () => (
  <span
    title="AI দিয়ে পূরণ — মিলিয়ে নিন"
    style={{
      marginLeft: '6px', fontSize: '9px', fontWeight: 800, letterSpacing: '0.4px',
      background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.45)',
      color: '#c4b5fd', borderRadius: '4px', padding: '1px 5px', verticalAlign: 'middle',
    }}
  >
    ✨ AI
  </span>
);

const CustomerModal = ({ isOpen, onClose, onCustomerCreated, isAdmin = true, initialData = null }) => {
  const { user } = useAuth();
  const showOpeningBalance = isAdmin && user?.role === 'admin';
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondContactNumber, setSecondContactNumber] = useState('');
  const [thirdContactNumber, setThirdContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [address2, setAddress2] = useState('');
  const [notes, setNotes] = useState('');
  const [contactShowStatus, setContactShowStatus] = useState('show_contact_number');
  const [openingBalance, setOpeningBalance] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdditional, setShowAdditional] = useState(false);

  // --- AI Assist (AI_Assist_PRD.md) ---
  const [showAI, setShowAI] = useState(false);
  const [aiFields, setAiFields] = useState({});      // form key -> true while unconfirmed
  const [aiSnapshot, setAiSnapshot] = useState(null); // exact pre-apply state, for undo
  const [duplicate, setDuplicate] = useState(null);   // existing customer with the same number

  /** Setter for each AI-writable form key, so applyDraft can write generically. */
  const FORM_SETTERS = {
    companyName: setCompanyName,
    name: setName,
    phone: setPhone,
    secondContactNumber: setSecondContactNumber,
    thirdContactNumber: setThirdContactNumber,
    email: setEmail,
    address: setAddress,
    address2: setAddress2,
  };

  /** Clears a field's AI badge as soon as the user types in it (criterion 9). */
  const touch = (formKey) => setAiFields((prev) => {
    if (!prev[formKey]) return prev;
    const next = { ...prev };
    delete next[formKey];
    return next;
  });

  const handleAiApply = async (draft) => {
    const patch = toFormPatch(draft);

    // Snapshot before writing anything — undo must restore the exact prior
    // state, including fields the user had already typed (criterion 10).
    setAiSnapshot({
      companyName, name, phone, secondContactNumber, thirdContactNumber,
      email, address, address2,
    });

    Object.entries(patch).forEach(([key, value]) => FORM_SETTERS[key]?.(value));
    setAiFields(Object.fromEntries(Object.keys(patch).map((k) => [k, true])));

    // Reveal the collapsed section if AI filled anything inside it, otherwise
    // those values would be applied but invisible.
    if (patch.secondContactNumber || patch.thirdContactNumber || patch.email) {
      setShowAdditional(true);
    }

    setShowAI(false);
    setError('');
    setDuplicate(null);

    if (patch.phone) {
      const existing = await findCustomerByPhone(patch.phone);
      if (existing) setDuplicate(existing);
    }
  };

  const handleAiUndo = () => {
    if (!aiSnapshot) return;
    Object.entries(aiSnapshot).forEach(([key, value]) => FORM_SETTERS[key]?.(value));
    setAiSnapshot(null);
    setAiFields({});
    setDuplicate(null);
  };

  /**
   * Pulled out of the effect (rather than an inline closure inside it) so
   * the "Retry" button below can call the exact same fetch — a transient
   * network hiccup shouldn't force the user to close and reopen the whole
   * form just to get the category list back.
   */
  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError('');
    try {
      const response = await api.get('/master/customer-categories');
      const cats = response.data.data || [];
      setCategories(cats);
      setCategoryId((prev) => prev || (cats.length > 0 ? cats[0].id : ''));
    } catch (err) {
      console.error('Failed to load customer categories', err);
      setCategoriesError('Could not load customer categories. Check your connection and retry.');
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  // Fetch categories when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchCategories();

      if (initialData) {
        setCompanyName(initialData.company_name || '');
        setName(initialData.name || '');
        setPhone(initialData.phone || '');
        setSecondContactNumber(initialData.second_contact_number || '');
        setThirdContactNumber(initialData.third_contact_number || '');
        setEmail(initialData.email || '');
        setAddress(initialData.address || '');
        setAddress2(initialData.address_2 || '');
        setNotes(initialData.notes || '');
        setContactShowStatus(initialData.contact_show_status || 'show_contact_number');
        setOpeningBalance(initialData.opening_balance || '');
        if (initialData.customer_category_id) {
          setCategoryId(initialData.customer_category_id);
        }
        if (initialData.second_contact_number || initialData.third_contact_number || initialData.email || initialData.opening_balance) {
          setShowAdditional(true);
        } else {
          setShowAdditional(false);
        }
      } else {
        setShowAdditional(false);
      }
    }
  }, [isOpen, initialData, fetchCategories]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Ensure company_name or name is provided
    const finalName = name.trim() || companyName.trim();
    if (!companyName.trim() && !name.trim()) {
      setError('Company Name or Customer Name is required.');
      return;
    }

    if (!phone.trim()) {
      setError('1st Contact Number is required.');
      return;
    }

    if (!address.trim()) {
      setError('Address Line 1 is required.');
      return;
    }

    // A real, currently-loaded category is required — this used to fall
    // back to a hardcoded `|| 1` when nothing was selected, which silently
    // sent a category the user never chose (and would throw a confusing
    // "Selected category does not exist" from the backend if id 1 happened
    // not to exist). Block submission here instead, with a message that
    // actually says what to do about it.
    if (!categoryId || !categories.some((cat) => String(cat.id) === String(categoryId))) {
      setError(
        categoriesError
          ? 'Customer category failed to load — click Retry above, then try saving again.'
          : 'Please select a Customer Category.'
      );
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name:                   finalName,
        company_name:           companyName,
        phone:                  phone,
        second_contact_number:  secondContactNumber,
        third_contact_number:   thirdContactNumber,
        email:                  email,
        address:                address,
        address_2:              address2,
        notes:                  notes,
        contact_show_status:    contactShowStatus,
        customer_category_id:   categoryId,
      };

      if (showOpeningBalance && openingBalance !== '') {
        payload.opening_balance = parseFloat(openingBalance) || 0;
      }

      let response;
      if (initialData && initialData.id) {
        response = await api.put(`/customers/${initialData.id}`, payload);
      } else {
        response = await api.post('/customers', payload);
      }

      const savedCustomer = response.data.data;
      if (onCustomerCreated) {
        onCustomerCreated(savedCustomer);
      }
      handleClose();
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors) {
        setError(Object.values(errors).flat().join('\n'));
      } else {
        setError(err.response?.data?.message || 'Failed to save customer.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCompanyName('');
    setName('');
    setPhone('');
    setSecondContactNumber('');
    setThirdContactNumber('');
    setEmail('');
    setAddress('');
    setAddress2('');
    setNotes('');
    setContactShowStatus('show_contact_number');
    setOpeningBalance('');
    setError('');
    setShowAdditional(false);
    setShowAI(false);
    setAiFields({});
    setAiSnapshot(null);
    setDuplicate(null);
    onClose();
  };

  return (
    <div className="custom-modal-overlay">
      <div className="custom-modal-container large-modal animate-fade-in" style={{ maxWidth: '820px', width: '100%' }}>
        
        {/* Header */}
        <div className="custom-modal-header">
          <h2 className="custom-modal-title">
            <span>👤</span> {initialData ? 'Edit Customer Information' : 'New Customer Account'}
          </h2>
          <button type="button" className="custom-modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="custom-modal-form">
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', whiteSpace: 'pre-line' }}>
              ⚠️ {error}
            </div>
          )}

          {/* AI Assist entry point — new customers only. Editing an existing
              record is a correction task; re-extracting into it would fight
              the values already verified by a human. */}
          {!initialData && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '10px', flexWrap: 'wrap', marginBottom: '14px', padding: '10px 14px',
              borderRadius: '10px', border: '1px solid rgba(139,92,246,0.35)',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.16), rgba(139,92,246,0.16))',
            }}>
              <div style={{ fontSize: '12.5px', color: '#ddd6fe', fontWeight: 600 }}>
                ✨ ভিজিটিং কার্ড, টেক্সট বা ভয়েস থেকে অটো-ফিল করুন
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {aiSnapshot && (
                  <button
                    type="button"
                    onClick={handleAiUndo}
                    disabled={loading}
                    style={{
                      padding: '7px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                      border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                      color: '#e2e8f0', cursor: 'pointer',
                    }}
                  >
                    ↩ Undo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAI(true)}
                  disabled={loading}
                  style={{
                    padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
                    border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    color: '#fff', cursor: 'pointer',
                  }}
                >
                  AI Assist
                </button>
              </div>
            </div>
          )}

          {duplicate && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#fcd34d', padding: '10px 14px', borderRadius: '10px',
              fontSize: '12.5px', marginBottom: '14px',
            }}>
              ⚠️ এই নম্বরটি আগে থেকেই আছে — <strong>{duplicate.company_name || duplicate.name}</strong>
              {duplicate.customer_code ? ` (${duplicate.customer_code})` : ''}। ডুপ্লিকেট না হলে সেভ করতে পারেন।
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏢 Primary Information
            </div>
            
            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">
                  Company Name <span style={{ color: '#ef4444' }}>*</span>
                  {aiFields.companyName && <AiBadge />}
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="e.g. Dhaka Blinds Ltd"
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); touch('companyName'); }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">
                  Contact Person Name
                  {aiFields.name && <AiBadge />}
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="e.g. Mr. Rafiq Islam"
                  value={name}
                  onChange={(e) => { setName(e.target.value); touch('name'); }}
                  disabled={loading}
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">
                  1st Contact Number <span style={{ color: '#ef4444' }}>*</span>
                  {aiFields.phone && <AiBadge />}
                </label>
                <PhoneContactField
                  placeholder="e.g. 01700000000"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); touch('phone'); }}
                  onPick={(contact) => {
                    setPhone(contact.phone);
                    touch('phone');
                    if (contact.name && !name) setName(contact.name);
                  }}
                  disabled={loading}
                  required
                />
              </div>

              {/* Always rendered now, never gated behind `categories.length > 0`.
                  Hiding the whole field while the fetch was in flight (or had
                  failed) used to make a *required* field silently vanish with
                  no indication why — the user would only find out something
                  was wrong when submit failed with a validation error about a
                  field they could no longer see. The white-on-white inline
                  style below it was also fighting this modal's dark design
                  system (select.custom-form-input is styled dark in
                  index.css), which is why the dropdown looked visually broken
                  against every other field around it. */}
              <div className="custom-form-group">
                <label className="custom-form-label">
                  Customer Category <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {categoriesError ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
                    borderRadius: '10px', border: '1px solid rgba(239,68,68,0.4)',
                    background: 'rgba(239,68,68,0.1)', fontSize: '13px', color: '#fca5a5',
                  }}>
                    <span style={{ flex: 1 }}>⚠️ {categoriesError}</span>
                    <button
                      type="button"
                      onClick={fetchCategories}
                      style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.25)',
                        color: '#e2e8f0', borderRadius: '8px', padding: '5px 12px',
                        fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      ↻ Retry
                    </button>
                  </div>
                ) : (
                  <select
                    className="custom-form-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    disabled={loading || categoriesLoading}
                    required
                  >
                    {categoriesLoading ? (
                      <option value="">Loading categories…</option>
                    ) : categories.length === 0 ? (
                      <option value="">No categories available</option>
                    ) : (
                      <>
                        {!categoryId && <option value="">-- Select Category --</option>}
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Secondary Contacts & Details
              flexShrink: 0 is required here - .custom-modal-form is a flex
              column container (see index.css), and a flex item with
              overflow:hidden (needed below only to keep this box's rounded
              corners clipping its content) otherwise gets an automatic
              min-height of 0 per the flexbox spec. Without flexShrink:0,
              this was the one item allowed to shrink past its own content,
              so the flex-shrink algorithm crushed it to 0px height whenever
              the form's total content exceeded the modal's visible area -
              hiding this whole section, not just clipping it. */}
          <div style={{
            marginBottom: '16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '8px',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            <div
              onClick={() => setShowAdditional(!showAdditional)}
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#38bdf8',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
                background: showAdditional ? 'rgba(56, 189, 248, 0.08)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📞</span> Additional Contacts &amp; Details:
              </div>
              <span style={{ fontSize: '12px', color: '#38bdf8' }}>
                {showAdditional ? '▲' : '▼'}
              </span>
            </div>

            {showAdditional && (
              <div className="custom-form-grid animate-fade-in" style={{ padding: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="custom-form-group">
                  <label className="custom-form-label">
                    2nd Contact Number
                    {aiFields.secondContactNumber && <AiBadge />}
                  </label>
                  <PhoneContactField
                    placeholder="Optional Mobile"
                    value={secondContactNumber}
                    onChange={(e) => { setSecondContactNumber(e.target.value); touch('secondContactNumber'); }}
                    onPick={(contact) => { setSecondContactNumber(contact.phone); touch('secondContactNumber'); }}
                    disabled={loading}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">
                    3rd Contact Number
                    {aiFields.thirdContactNumber && <AiBadge />}
                  </label>
                  <PhoneContactField
                    placeholder="Optional Mobile"
                    value={thirdContactNumber}
                    onChange={(e) => { setThirdContactNumber(e.target.value); touch('thirdContactNumber'); }}
                    onPick={(contact) => { setThirdContactNumber(contact.phone); touch('thirdContactNumber'); }}
                    disabled={loading}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">
                    Email ID (Optional)
                    {aiFields.email && <AiBadge />}
                  </label>
                  <input
                    type="email"
                    className="custom-form-input"
                    placeholder="client@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); touch('email'); }}
                    disabled={loading}
                  />
                </div>

                {showOpeningBalance && (
                  <div className="custom-form-group">
                    <label className="custom-form-label">Opening Balance (Tk)</label>
                    <input
                      type="number"
                      step="0.01"
                      className="custom-form-input"
                      placeholder="0.00"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Address */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📍 Address
            </div>

            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">
                  Address Line 1 <span style={{ color: '#ef4444' }}>*</span>
                  {aiFields.address && <AiBadge />}
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="Primary Address"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); touch('address'); }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">
                  Address Line 2
                  {aiFields.address2 && <AiBadge />}
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="Secondary Address / Site Area"
                  value={address2}
                  onChange={(e) => { setAddress2(e.target.value); touch('address2'); }}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Notes & Remarks — Edit only.
              This is a note about the customer's account, not something to
              collect while opening it, and it's the one field AI Assist can
              never fill (AI Assist only runs on the New Customer form). It
              only appears once the customer has an ID, on the Edit form. */}
          {initialData?.id && (
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '6px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📝 Notes &amp; Remarks
              </div>
              <div className="custom-form-grid">
                <div className="custom-form-group" style={{ gridColumn: '1 / -1' }}>
                  <textarea
                    rows={3}
                    className="custom-form-input"
                    style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    placeholder="Internal notes about this customer"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="custom-modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={loading}
            >
              {loading ? 'Saving...' : (initialData ? '💾 Update Customer' : '💾 Save Customer')}
            </button>
          </div>

        </form>
      </div>

      <AIAssistModal
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        onApply={handleAiApply}
      />
    </div>
  );
};

export default CustomerModal;
