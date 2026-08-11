import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import PhoneContactField from './PhoneContactField';

const SupplierModal = ({ isOpen, onClose, onSupplierSaved, initialData = null, isViewOnly = false }) => {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        let comp = initialData.company_name || '';
        let human = initialData.name || '';

        // Auto-correct if old database records have company name stored in 'name' and contact name in 'company_name'
        const isCompanyInName = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd/i.test(human);
        const isHumanInComp = /^[a-zA-Z\s]+$/.test(comp) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd/i.test(comp);

        if (isCompanyInName && isHumanInComp) {
          const temp = comp;
          comp = human;
          human = temp;
        }

        setCompanyName(comp);
        setName(human);
        setPhone(initialData.phone || '');
        setEmail(initialData.email || '');
        setAddress(initialData.address || '');
        setOpeningBalance(initialData.opening_balance || '');
      } else {
        setName('');
        setCompanyName('');
        setPhone('');
        setEmail('');
        setAddress('');
        setOpeningBalance('');
      }
      setError('');
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isViewOnly) return;
    setError('');

    if (!name.trim()) {
      setError('Supplier H Name is required.');
      return;
    }

    if (!phone.trim()) {
      setError('Mobile Number is required.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name:            name.trim(),
        company_name:    companyName.trim(),
        phone:           phone.trim(),
        email:           email.trim(),
        address:         address.trim(),
        opening_balance: openingBalance !== '' ? parseFloat(openingBalance) : 0,
      };

      let response;
      if (initialData && initialData.id) {
        response = await api.put(`/suppliers/${initialData.id}`, payload);
      } else {
        response = await api.post('/suppliers', payload);
      }

      const savedSupplier = response.data.data;
      if (onSupplierSaved) {
        onSupplierSaved(savedSupplier);
      }
      handleClose();
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors) {
        setError(Object.values(errors).flat().join('\n'));
      } else {
        setError(err.response?.data?.message || 'Failed to save supplier.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setOpeningBalance('');
    setError('');
    onClose();
  };

  return (
    <div className="custom-modal-overlay">
      <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '480px' }}>
        
        {/* Header */}
        <div className="custom-modal-header">
          <h2 className="custom-modal-title">
            {isViewOnly
              ? `Supplier Details ${initialData?.supplier_code ? `(${initialData.supplier_code})` : ''}`
              : initialData
              ? 'Edit Supplier Information'
              : 'Supplier Information'}
          </h2>
          <button type="button" className="custom-modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="custom-modal-form">
          {error && (
            <div className="alert alert-danger mb-3" style={{ whiteSpace: 'pre-line' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Supplier Company name (1st Line) */}
            <div className="custom-form-group">
              <label className="custom-form-label">Supplier Company name</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Supplier Company name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading || isViewOnly}
              />
            </div>

            {/* Supplier H Name * (2nd Line) */}
            <div className="custom-form-group">
              <label className="custom-form-label">Supplier H Name {isViewOnly ? '' : '*'}</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Supplier H Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || isViewOnly}
                required={!isViewOnly}
              />
            </div>

            {/* Mobile Number * */}
            <div className="custom-form-group">
              <label className="custom-form-label">Mobile Number {isViewOnly ? '' : '*'}</label>
              <PhoneContactField
                placeholder="Mobile Number *"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onPick={(contact) => {
                  setPhone(contact.phone);
                  if (contact.name && !name) setName(contact.name);
                }}
                disabled={loading || isViewOnly}
                required={!isViewOnly}
              />
            </div>

            {/* Email ID */}
            <div className="custom-form-group">
              <label className="custom-form-label">Email ID</label>
              <input
                type="email"
                className="custom-form-input"
                placeholder="example@sunshine.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading || isViewOnly}
              />
            </div>

            {/* Address */}
            <div className="custom-form-group">
              <label className="custom-form-label">Address</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading || isViewOnly}
              />
            </div>

            {/* Opening Balance */}
            <div className="custom-form-group">
              <label className="custom-form-label">Opening Balance</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="custom-form-input"
                placeholder="Opening Balance"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                disabled={loading || isViewOnly}
              />
            </div>

          </div>

          {/* Footer Buttons */}
          <div className="custom-modal-footer">
            {!isViewOnly && (
              <button type="submit" className="btn-modal-submit" disabled={loading}>
                <span className="btn-icon">💾</span> Submit
              </button>
            )}
            <button type="button" className="btn-modal-cancel" onClick={handleClose} disabled={loading}>
              <span className="btn-icon">{isViewOnly ? '✖' : '❎'}</span> {isViewOnly ? 'Close' : 'Cancel'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default SupplierModal;
