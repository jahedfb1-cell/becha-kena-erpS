import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import PhoneContactField from './PhoneContactField';

const CustomerModal = ({ isOpen, onClose, onCustomerCreated, isAdmin = true, initialData = null }) => {
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdditional, setShowAdditional] = useState(false);

  // Fetch categories when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchCategories = async () => {
        try {
          const response = await api.get('/master/customer-categories');
          const cats = response.data.data || [];
          setCategories(cats);
          if (cats.length > 0 && !categoryId) {
            setCategoryId(cats[0].id);
          }
        } catch (err) {
          console.error('Failed to load customer categories', err);
        }
      };
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
  }, [isOpen, initialData]);

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

    setLoading(true);
    try {
      // Fallback categoryId if not set
      let finalCategoryId = categoryId;
      if (!finalCategoryId && categories.length > 0) {
        finalCategoryId = categories[0].id;
      }

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
        customer_category_id:   finalCategoryId || 1,
      };

      if (isAdmin && openingBalance !== '') {
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

          {/* Section 1: Basic Information */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏢 Primary Information
            </div>
            
            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">
                  Company Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="e.g. Dhaka Blinds Ltd"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">Contact Person Name</label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="e.g. Mr. Rafiq Islam"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">
                  1st Contact Number <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <PhoneContactField
                  placeholder="e.g. 01700000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onPick={(contact) => {
                    setPhone(contact.phone);
                    if (contact.name && !name) setName(contact.name);
                  }}
                  disabled={loading}
                  required
                />
              </div>

              {categories.length > 0 && (
                <div className="custom-form-group">
                  <label className="custom-form-label">Customer Category</label>
                  <select
                    className="custom-form-input"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    disabled={loading}
                    style={{ color: '#000000', backgroundColor: '#ffffff', fontWeight: '500' }}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id} style={{ color: '#000000', backgroundColor: '#ffffff' }}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
            borderRadius: '14px',
            overflow: 'hidden',
            flexShrink: 0
          }}>
            <div
              onClick={() => setShowAdditional(!showAdditional)}
              style={{
                fontSize: '14px',
                fontWeight: 700,
                color: '#38bdf8',
                padding: '14px 18px',
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
              <div className="custom-form-grid animate-fade-in" style={{ padding: '18px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="custom-form-group">
                  <label className="custom-form-label">2nd Contact Number</label>
                  <PhoneContactField
                    placeholder="Optional Mobile"
                    value={secondContactNumber}
                    onChange={(e) => setSecondContactNumber(e.target.value)}
                    onPick={(contact) => setSecondContactNumber(contact.phone)}
                    disabled={loading}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">3rd Contact Number</label>
                  <PhoneContactField
                    placeholder="Optional Mobile"
                    value={thirdContactNumber}
                    onChange={(e) => setThirdContactNumber(e.target.value)}
                    onPick={(contact) => setThirdContactNumber(contact.phone)}
                    disabled={loading}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">Email ID (Optional)</label>
                  <input
                    type="email"
                    className="custom-form-input"
                    placeholder="client@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                {isAdmin && (
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

          {/* Section 3: Address & Notes (Always Visible) */}
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '18px', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📍 Address &amp; Additional Remarks
            </div>

            <div className="custom-form-grid">
              <div className="custom-form-group">
                <label className="custom-form-label">
                  Address Line 1 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="Primary Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="custom-form-group">
                <label className="custom-form-label">Address Line 2</label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="Secondary Address / Site Area"
                  value={address2}
                  onChange={(e) => setAddress2(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="custom-form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="custom-form-label">Notes &amp; Remarks</label>
                <input
                  type="text"
                  className="custom-form-input"
                  placeholder="Special instructions or notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>

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
    </div>
  );
};

export default CustomerModal;
