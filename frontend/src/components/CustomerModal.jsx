import React, { useState, useEffect } from 'react';
import api from '../api/axios';

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
      setError('Address 1 is required.');
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
    onClose();
  };

  return (
    <div className="custom-modal-overlay">
      <div className="custom-modal-container animate-fade-in">
        
        {/* Header */}
        <div className="custom-modal-header">
          <h2 className="custom-modal-title">Customer Information</h2>
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

          <div className="custom-form-grid">
            
            {/* Row 1: Company Name * | Customer Name */}
            <div className="custom-form-group">
              <label className="custom-form-label">
                Company Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Company Name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">Customer Name</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Customer Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Row 2: 1st Contact Number * | 2nd Contact Number */}
            <div className="custom-form-group">
              <label className="custom-form-label">
                1st Contact Number <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Mobile Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">2nd Contact Number</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Mobile Number"
                value={secondContactNumber}
                onChange={(e) => setSecondContactNumber(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Row 3: 3rd Contact Number | Email ID (Hidden on mobile) */}
            <div className="custom-form-group hide-on-mobile">
              <label className="custom-form-label">3rd Contact Number</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Mobile Number"
                value={thirdContactNumber}
                onChange={(e) => setThirdContactNumber(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="custom-form-group hide-on-mobile">
              <label className="custom-form-label">Email ID</label>
              <input
                type="email"
                className="custom-form-input"
                placeholder="example@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Row 4: Address 1 * | Address 2 */}
            <div className="custom-form-group">
              <label className="custom-form-label">
                Address 1 <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Address 1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">Address 2</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Address 2"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Row 5: Notes | Customer Show Status */}
            <div className="custom-form-group">
              <label className="custom-form-label">Notes</label>
              <input
                type="text"
                className="custom-form-input"
                placeholder="Remarks"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">
                Customer Show Status
              </label>
              <div className="custom-radio-group">
                <label className="custom-radio-label">
                  <input
                    type="radio"
                    name="contact_show_status"
                    value="show_contact_number"
                    checked={contactShowStatus === 'show_contact_number'}
                    onChange={(e) => setContactShowStatus(e.target.value)}
                    disabled={loading}
                  />
                  <span>Show Contact Number</span>
                </label>
                <label className="custom-radio-label">
                  <input
                    type="radio"
                    name="contact_show_status"
                    value="cannot_show_contact_number"
                    checked={contactShowStatus === 'cannot_show_contact_number'}
                    onChange={(e) => setContactShowStatus(e.target.value)}
                    disabled={loading}
                  />
                  <span>Cann't Show Contact Number</span>
                </label>
              </div>
            </div>

            {/* Row 6: Opening Balance */}
            <div className="custom-form-group">
              <label className="custom-form-label">Opening Balance</label>
              <input
                type="number"
                step="0.01"
                className="custom-form-input"
                placeholder="Previous Due"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                disabled={loading}
              />
            </div>

          </div>

          {/* Footer Buttons */}
          <div className="custom-modal-footer">
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={loading}
            >
              <span className="btn-icon">💾</span> Submit
            </button>
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={handleClose}
              disabled={loading}
            >
              <span className="btn-icon">❎</span> Cancel
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};

export default CustomerModal;
