import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { formatCurrency, formatDate } from '../utils/format';
import CustomerModal from '../components/CustomerModal';
import PhoneContactField from '../components/PhoneContactField';

const Customers = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [view, setView] = useState('list'); // 'list', 'detail', or 'edit'
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Selected customer details
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Search filter
  const [filterSearch, setFilterSearch] = useState('');

  // Customer Modal toggle (quick add)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) {
      setFilterSearch(decodeURIComponent(q));
    }
  }, [searchParams]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/customers');
      setCustomers(response.data.data || []);
    } catch (err) {
      setError('Failed to retrieve customer list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const loadCustomerDetails = async (id) => {
    try {
      const response = await api.get(`/customers/${id}`);
      setSelectedCustomer(response.data.data);
      setView('detail');
    } catch (err) {
      alert('Failed to retrieve customer details.');
    }
  };

  const handleCustomerCreated = (newCustomer) => {
    setCustomers(prev => [newCustomer, ...prev]);
    alert('Customer created successfully.');
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name.toLowerCase().includes(filterSearch.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(filterSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(filterSearch)) ||
      (c.company_name && c.company_name.toLowerCase().includes(filterSearch.toLowerCase()))
    );
  }, [customers, filterSearch]);

  // Get current due from ledger last entry
  const getCustomerDue = (customer) => {
    if (customer.current_due !== undefined) return customer.current_due;
    if (!customer.ledgers || customer.ledgers.length === 0) return 0;
    return parseFloat(customer.ledgers[customer.ledgers.length - 1].balance) || 0;
  };

  return (
    <div className="content-container animate-fade-in">
      {view === 'list' && (
        <>
          <div className="page-header-row">
            <div>
              <h1>Customers & Accounts</h1>
              <p>Manage customer profiles, opening balances, and account ledgers</p>
            </div>
            <button className="primary-btn" onClick={() => setIsModalOpen(true)}>
              + Add Customer
            </button>
          </div>

          {/* Search bar */}
          <div className="welcome-banner" style={{ padding: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0, maxWidth: '400px' }}>
              <input 
                type="text" 
                placeholder="Search by code, name, company, or phone..." 
                value={filterSearch} 
                onChange={(e) => setFilterSearch(e.target.value)} 
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
            </div>
          </div>

          {loading ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Phone</th>
                    <th>Category</th>
                    <th>Opening Balance</th>
                    <th>Current Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', color: 'var(--text-main)' }}>No customers found.</td>
                    </tr>
                  ) : (
                    filteredCustomers.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.customer_code}</strong></td>
                        <td>
                          <button
                            type="button"
                            className="clickable-link"
                            onClick={() => loadCustomerDetails(c.id)}
                          >
                            {c.name}
                          </button>
                        </td>
                        <td>{c.company_name || <span style={{ color: 'var(--text-main)' }}>—</span>}</td>
                        <td>{c.phone || '—'}</td>
                        <td><span className="badge badge-outline">{c.category?.name}</span></td>
                        <td style={{ fontWeight: '500' }}>
                          {c.opening_balance > 0 ? (
                            <span style={{ color: 'var(--warning)' }}>{formatCurrency(c.opening_balance)}</span>
                          ) : '—'}
                        </td>
                        <td style={{ color: getCustomerDue(c) > 0 ? 'var(--danger)' : 'inherit', fontWeight: getCustomerDue(c) > 0 ? '600' : 'normal' }}>
                          {formatCurrency(getCustomerDue(c))}
                        </td>
                        <td>
                          <span className={`badge ${c.is_archived ? 'badge-danger' : 'badge-success'}`}>
                            {c.is_archived ? 'Archived' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <button className="text-btn" onClick={() => loadCustomerDetails(c.id)}>
                            View Ledger
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {view === 'detail' && selectedCustomer && (
        <CustomerDetailView
          customer={selectedCustomer}
          isAdmin={isAdmin}
          onBack={() => { setView('list'); fetchCustomers(); }}
          onEdit={() => setView('edit')}
        />
      )}

      {view === 'edit' && selectedCustomer && (
        <CustomerEditForm
          customer={selectedCustomer}
          isAdmin={isAdmin}
          onBack={() => setView('detail')}
          onSaved={(updatedCustomer) => {
            setSelectedCustomer(updatedCustomer);
            setView('detail');
            fetchCustomers();
          }}
        />
      )}

      {/* Quick Add Customer Modal */}
      <CustomerModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onCustomerCreated={handleCustomerCreated}
        isAdmin={isAdmin}
      />
    </div>
  );
};

/* ─── Customer Detail View ─── */
const CustomerDetailView = ({ customer, isAdmin, onBack, onEdit }) => {
  const ledgers = customer.ledgers || [];
  const lastLedger = ledgers[ledgers.length - 1];
  const currentDue = lastLedger ? parseFloat(lastLedger.balance) : 0;

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Customer: {customer.name}</h1>
          <p>Profile info, opening balances, and chronological account ledger</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="primary-btn" onClick={onEdit}>Edit Customer</button>
          <button className="logout-btn" onClick={onBack}>Back to List</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '20px', alignItems: 'start' }}>
        {/* Left side profile card */}
        <div className="stat-card" style={{ flexDirection: 'column', alignItems: 'stretch', padding: '20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div className="avatar-circle" style={{ width: '64px', height: '64px', fontSize: '24px', margin: '0 auto 12px' }}>
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <h3 style={{ margin: '0', color: 'var(--text-heading)' }}>{customer.name}</h3>
            {customer.company_name && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-main)' }}>{customer.company_name}</p>
            )}
            <span className="badge badge-outline" style={{ marginTop: '6px' }}>{customer.category?.name}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Code:</strong> <span>{customer.customer_code}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Phone:</strong> <span>{customer.phone || 'N/A'}</span>
            </div>
            {customer.second_contact_number && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>2nd Phone:</strong> <span>{customer.second_contact_number}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Email:</strong> <span>{customer.email || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>Show Contact:</strong>
              <span className={`badge ${customer.contact_show_status === 'show_contact_number' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                {customer.contact_show_status === 'show_contact_number' ? 'Yes' : 'No'}
              </span>
            </div>
            {customer.address && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong>Address 1:</strong>
                <span style={{ background: 'var(--bg-base)', padding: '6px', borderRadius: '4px' }}>{customer.address}</span>
              </div>
            )}
            {customer.address_2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong>Address 2:</strong>
                <span style={{ background: 'var(--bg-base)', padding: '6px', borderRadius: '4px' }}>{customer.address_2}</span>
              </div>
            )}
            {customer.notes && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <strong>Notes:</strong>
                <span style={{ background: 'var(--bg-base)', padding: '6px', borderRadius: '4px', fontSize: '12px' }}>{customer.notes}</span>
              </div>
            )}
          </div>

          {/* Opening Balance (Admin only visibility) */}
          {isAdmin && (
            <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '12px', marginTop: '12px' }}>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--warning)' }}>Opening Balance</span>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--warning)' }}>
                {formatCurrency(customer.opening_balance)}
              </div>
            </div>
          )}

          <div style={{ borderTop: '2px solid var(--primary)', paddingTop: '16px', marginTop: '16px', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Outstanding Due</span>
            <div style={{ fontSize: '22px', fontWeight: '800', color: currentDue > 0 ? 'var(--danger)' : 'var(--success)' }}>
              {formatCurrency(currentDue)}
            </div>
          </div>
        </div>

        {/* Right side ledger */}
        <div className="welcome-banner" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', color: 'var(--text-heading)' }}>Chronological Account Statement</h3>
          {ledgers.length === 0 ? (
            <p style={{ margin: 0, fontStyle: 'italic' }}>No ledger transactions found for this customer.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Debit (৳)</th>
                  <th>Credit (৳)</th>
                  <th>Balance (৳)</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map((ledger) => (
                  <tr key={ledger.id} style={ledger.transaction_type === 'opening_balance' ? { backgroundColor: 'var(--bg-base)' } : {}}>
                    <td>{formatDate(ledger.transaction_date)}</td>
                    <td>
                      <span className={`badge ${
                        ledger.transaction_type === 'opening_balance' ? 'badge-warning' :
                        ledger.transaction_type === 'invoice' ? 'badge-outline' :
                        ledger.transaction_type === 'payment' ? 'badge-success' :
                        ledger.transaction_type === 'discount' ? 'badge-info' : 'badge-warning'
                      }`} style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                        {ledger.transaction_type === 'opening_balance' ? '★ Opening Bal.' : ledger.transaction_type}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px' }}>{ledger.description}</td>
                    <td style={{ color: ledger.debit > 0 ? 'var(--danger)' : 'inherit' }}>
                      {ledger.debit > 0 ? formatCurrency(ledger.debit) : '—'}
                    </td>
                    <td style={{ color: ledger.credit > 0 ? 'var(--success)' : 'inherit' }}>
                      {ledger.credit > 0 ? formatCurrency(ledger.credit) : '—'}
                    </td>
                    <td style={{ fontWeight: '600' }}>{formatCurrency(ledger.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

/* ─── Customer Edit Form ─── */
const CustomerEditForm = ({ customer, isAdmin, onBack, onSaved }) => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name:                   customer.name || '',
    company_name:           customer.company_name || '',
    phone:                  customer.phone || '',
    second_contact_number:  customer.second_contact_number || '',
    email:                  customer.email || '',
    address:                customer.address || '',
    address_2:              customer.address_2 || '',
    notes:                  customer.notes || '',
    contact_show_status:    customer.contact_show_status || 'show_contact_number',
    customer_category_id:   customer.customer_category_id || '',
    opening_balance:        customer.opening_balance || 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdditional, setShowAdditional] = useState(Boolean(customer.second_contact_number || customer.email || customer.opening_balance));

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/master/customer-categories');
        setCategories(res.data.data || []);
      } catch (e) {
        console.error('Failed to load categories', e);
      }
    };
    fetchCategories();
  }, []);

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { ...form };
      if (!isAdmin) delete payload.opening_balance;

      const response = await api.put(`/customers/${customer.id}`, payload);
      onSaved(response.data.data);
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors) {
        setError(Object.values(errors).flat().join('\n'));
      } else {
        setError(err.response?.data?.message || 'Failed to update customer.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Edit Customer: {customer.customer_code}</h1>
          <p>Update customer information and account settings</p>
        </div>
        <button className="logout-btn" onClick={onBack}>Cancel</button>
      </div>

      <div className="welcome-banner" style={{ padding: '28px' }}>
        {error && <div className="alert alert-danger" style={{ marginBottom: '20px', whiteSpace: 'pre-line' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            <div className="form-group">
              <label>Customer Name *</label>
              <input type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} required disabled={loading} />
            </div>

            <div className="form-group">
              <label>Company Name</label>
              <input type="text" value={form.company_name} onChange={(e) => handleChange('company_name', e.target.value)} disabled={loading} placeholder="Optional" />
            </div>

            <div className="form-group">
              <label>Primary Phone</label>
              <PhoneContactField
                className=""
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                onPick={(contact) => {
                  handleChange('phone', contact.phone);
                  if (contact.name && !form.name) handleChange('name', contact.name);
                }}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label>Customer Category *</label>
              <select value={form.customer_category_id} onChange={(e) => handleChange('customer_category_id', e.target.value)} required disabled={loading}
                style={{ padding: '8px', fontSize: '13px', width: '100%', border: '1px solid var(--border)', borderRadius: '6px', backgroundColor: '#ffffff', color: '#000000', fontWeight: '500' }}>
                <option value="" style={{ color: '#000000', backgroundColor: '#ffffff' }}>Select Category...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id} style={{ color: '#000000', backgroundColor: '#ffffff' }}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Additional Contacts & Details */}
            <div style={{
              gridColumn: '1 / -1',
              margin: '10px 0',
              background: 'var(--bg-card, rgba(255,255,255,0.02))',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div
                onClick={() => setShowAdditional(!showAdditional)}
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--primary)',
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
                <span style={{ fontSize: '12px', color: 'var(--primary)' }}>
                  {showAdditional ? '▲' : '▼'}
                </span>
              </div>

              {showAdditional && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', padding: '18px', borderTop: '1px solid var(--border)' }}>
                  <div className="form-group">
                    <label>2nd Contact Number</label>
                    <PhoneContactField
                      className=""
                      value={form.second_contact_number}
                      onChange={(e) => handleChange('second_contact_number', e.target.value)}
                      onPick={(contact) => handleChange('second_contact_number', contact.phone)}
                      disabled={loading}
                      placeholder="Alternate phone"
                    />
                  </div>

                  <div className="form-group">
                    <label>Email Address (Optional)</label>
                    <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} disabled={loading} />
                  </div>
                </div>
              )}
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Address 1</label>
              <textarea value={form.address} onChange={(e) => handleChange('address', e.target.value)} disabled={loading} rows="2" />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Address 2</label>
              <textarea value={form.address_2} onChange={(e) => handleChange('address_2', e.target.value)} disabled={loading} rows="2" placeholder="Secondary address / floor / unit" />
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Notes</label>
              <textarea value={form.notes} onChange={(e) => handleChange('notes', e.target.value)} disabled={loading} rows="3" placeholder="Internal notes about this customer" />
            </div>

            <div className="form-group">
              <label>Customer Show Status *</label>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'normal' }}>
                  <input
                    type="radio"
                    name="contact_show_status"
                    value="show_contact_number"
                    checked={form.contact_show_status === 'show_contact_number'}
                    onChange={(e) => handleChange('contact_show_status', e.target.value)}
                    style={{ width: 'auto' }}
                    disabled={loading}
                  />
                  Show Contact Number
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 'normal' }}>
                  <input
                    type="radio"
                    name="contact_show_status"
                    value="cannot_show_contact_number"
                    checked={form.contact_show_status === 'cannot_show_contact_number'}
                    onChange={(e) => handleChange('contact_show_status', e.target.value)}
                    style={{ width: 'auto' }}
                    disabled={loading}
                  />
                  Can't Show Contact Number
                </label>
              </div>
            </div>

            {/* Opening Balance - Admin Only */}
            {isAdmin && (
              <div className="form-group">
                <label style={{ color: 'var(--warning)' }}>Opening Balance (Admin Only)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.opening_balance}
                  onChange={(e) => handleChange('opening_balance', e.target.value)}
                  disabled={loading}
                  style={{ borderColor: 'var(--warning)' }}
                />
                <small style={{ color: 'var(--text-main)', fontSize: '11px' }}>
                  Old receivable before ERP. Updates the first ledger entry automatically.
                </small>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <button type="submit" className="primary-btn" disabled={loading} style={{ padding: '12px 28px' }}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
            <button type="button" className="logout-btn" onClick={onBack} disabled={loading} style={{ padding: '10px 20px' }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Customers;
