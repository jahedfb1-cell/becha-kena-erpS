import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { formatCurrency, formatDate } from '../utils/format';

const Settings = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    colors_count: 0,
    units_count: 0,
    expense_types_count: 0,
    user_types_count: 0,
    cash_accounts_count: 1,
    bank_accounts_count: 0,
    mobile_accounts_count: 0,
    notification_count: 0,
    balance_transfers_count: 0,
    backups_count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'colors' | 'unit' | 'bank' | 'mobile' | 'transfer' | 'expense'

  // Sub-modal Data States
  const [modalData, setModalData] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');
  const [modalSuccess, setModalSuccess] = useState('');

  // Form Inputs State
  const [formInput, setFormInput] = useState({});

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings/summary');
      if (res.data && res.data.data) {
        setSummary(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to load settings summary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Open Modal and Fetch Sub-data
  const handleOpenModal = async (type) => {
    setActiveModal(type);
    setFormInput({});
    setModalError('');
    setModalSuccess('');
    setModalLoading(true);

    try {
      if (type === 'unit') {
        const res = await api.get('/settings/units');
        setModalData(res.data?.data || []);
      } else if (type === 'bank') {
        const res = await api.get('/settings/bank-accounts');
        setModalData(res.data?.data || []);
      } else if (type === 'mobile') {
        const res = await api.get('/settings/mobile-accounts');
        setModalData(res.data?.data || []);
      } else if (type === 'transfer') {
        const [trfRes, bankRes, mobRes] = await Promise.all([
          api.get('/settings/balance-transfers'),
          api.get('/settings/bank-accounts'),
          api.get('/settings/mobile-accounts'),
        ]);
        setModalData({
          transfers: trfRes.data?.data || [],
          banks: bankRes.data?.data || [],
          mobiles: mobRes.data?.data || [],
        });
      } else if (type === 'colors') {
        const res = await api.get('/product-variants');
        setModalData(res.data?.data?.data || res.data?.data || []);
      } else if (type === 'expense') {
        const res = await api.get('/master/expense-categories');
        setModalData(res.data?.data?.data || res.data?.data || []);
      } else if (type === 'product_category') {
        const res = await api.get('/master/product-categories');
        setModalData(res.data?.data || []);
      }
    } catch (err) {
      setModalError('Failed to retrieve item list.');
    } finally {
      setModalLoading(false);
    }
  };

  // Product Category Form Submit
  const handleAddProductCategory = async (e) => {
    e.preventDefault();
    setModalError('');
    try {
      await api.post('/master/product-categories', formInput);
      setModalSuccess('Product Category added successfully!');
      setFormInput({});
      handleOpenModal('product_category');
      fetchSummary();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to add product category.');
    }
  };

  const handleDeleteProductCategory = async (id) => {
    if (!window.confirm('Delete/Archive this product category?')) return;
    try {
      await api.delete(`/master/product-categories/${id}`);
      handleOpenModal('product_category');
      fetchSummary();
    } catch (err) {
      alert('Failed to delete product category.');
    }
  };

  // Unit Form Submit
  const handleAddUnit = async (e) => {
    e.preventDefault();
    setModalError('');
    try {
      await api.post('/settings/units', formInput);
      setModalSuccess('Unit added successfully!');
      setFormInput({});
      handleOpenModal('unit');
      fetchSummary();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to add unit.');
    }
  };

  const handleDeleteUnit = async (id) => {
    if (!window.confirm('Delete this unit?')) return;
    try {
      await api.delete(`/settings/units/${id}`);
      handleOpenModal('unit');
      fetchSummary();
    } catch (err) {
      alert('Failed to delete unit.');
    }
  };

  // Bank Account Form Submit
  const handleAddBankAccount = async (e) => {
    e.preventDefault();
    setModalError('');
    try {
      await api.post('/settings/bank-accounts', formInput);
      setModalSuccess('Bank account added successfully!');
      setFormInput({});
      handleOpenModal('bank');
      fetchSummary();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to add bank account.');
    }
  };

  const handleDeleteBankAccount = async (id) => {
    if (!window.confirm('Remove this bank account?')) return;
    try {
      await api.delete(`/settings/bank-accounts/${id}`);
      handleOpenModal('bank');
      fetchSummary();
    } catch (err) {
      alert('Failed to remove bank account.');
    }
  };

  // Mobile Account Form Submit
  const handleAddMobileAccount = async (e) => {
    e.preventDefault();
    setModalError('');
    try {
      await api.post('/settings/mobile-accounts', formInput);
      setModalSuccess('Mobile account added successfully!');
      setFormInput({});
      handleOpenModal('mobile');
      fetchSummary();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to add mobile account.');
    }
  };

  const handleDeleteMobileAccount = async (id) => {
    if (!window.confirm('Remove this mobile account?')) return;
    try {
      await api.delete(`/settings/mobile-accounts/${id}`);
      handleOpenModal('mobile');
      fetchSummary();
    } catch (err) {
      alert('Failed to remove mobile account.');
    }
  };

  // Balance Transfer Form Submit
  const handleAddTransfer = async (e) => {
    e.preventDefault();
    setModalError('');
    try {
      await api.post('/settings/balance-transfers', {
        ...formInput,
        transfer_date: formInput.transfer_date || new Date().toISOString().substring(0, 10),
      });
      setModalSuccess('Balance transfer recorded successfully!');
      setFormInput({});
      handleOpenModal('transfer');
      fetchSummary();
    } catch (err) {
      setModalError(err.response?.data?.message || 'Failed to record balance transfer.');
    }
  };

  return (
    <div className="content-container animate-fade-in">
      {/* Top Header & Breadcrumb matching Sample */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: 'var(--text-heading)' }}>Setting</h1>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-main)' }}>
          <span style={{ color: '#0ea5e9', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>Dashboard</span> / Setting
        </div>
      </div>

      {/* Main Setting Dashboard Card Wrapper */}
      <div className="welcome-banner" style={{ padding: '24px', background: '#fff', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 20px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', color: '#1e293b' }}>
          Setting Controls
        </h3>

        {loading ? (
          <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            
            {/* 1. Colors */}
            <div 
              onClick={() => handleOpenModal('colors')}
              style={{
                background: '#00a8cc',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(0, 168, 204, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Colors</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.colors_count}</div>
              </div>
            </div>

            {/* 2. Unit */}
            <div 
              onClick={() => handleOpenModal('unit')}
              style={{
                background: '#28a745',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(40, 167, 69, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Unit</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.units_count}</div>
              </div>
            </div>

            {/* 2.5. Product Category */}
            <div 
              onClick={() => handleOpenModal('product_category')}
              style={{
                background: '#6f42c1',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(111, 66, 193, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>🏷️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Product Category</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.product_categories_count || 0}</div>
              </div>
            </div>

            {/* 3. Expense Type */}
            <div 
              onClick={() => handleOpenModal('expense')}
              style={{
                background: '#ffc107',
                color: '#212529',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(255, 193, 7, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Expense Type</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.expense_types_count}</div>
              </div>
            </div>

            {/* 4. User Type */}
            <div 
              onClick={() => navigate('/access-setup')}
              style={{
                background: '#dc3545',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(220, 53, 69, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>User Type</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.user_types_count}</div>
              </div>
            </div>

            {/* 5. Cash Account */}
            <div 
              onClick={() => alert('Cash Account is initialized & active (Primary Cash Register).')}
              style={{
                background: '#00a8cc',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(0, 168, 204, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Cash Account</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.cash_accounts_count}</div>
              </div>
            </div>

            {/* 6. Bank Account */}
            <div 
              onClick={() => handleOpenModal('bank')}
              style={{
                background: '#28a745',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(40, 167, 69, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Bank Account</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.bank_accounts_count}</div>
              </div>
            </div>

            {/* 7. Mobile Account */}
            <div 
              onClick={() => handleOpenModal('mobile')}
              style={{
                background: '#ffc107',
                color: '#212529',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(255, 193, 7, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Mobile Account</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.mobile_accounts_count}</div>
              </div>
            </div>

            {/* 8. Notification */}
            <div 
              onClick={() => alert(`Unread system notifications: ${summary.notification_count}`)}
              style={{
                background: '#dc3545',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(220, 53, 69, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Notification</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.notification_count}</div>
              </div>
            </div>

            {/* 9. Balance Transfer */}
            <div 
              onClick={() => handleOpenModal('transfer')}
              style={{
                background: '#00a8cc',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(0, 168, 204, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>≡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Balance Transfer</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.balance_transfers_count}</div>
              </div>
            </div>

            {/* 10. Company Profile */}
            <div 
              onClick={() => navigate('/company-profile')}
              style={{
                background: '#8b5cf6',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>🏢</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Company Profile</div>
                <div style={{ fontSize: '14px', marginTop: '2px', fontWeight: 600 }}>Logo &amp; Terms</div>
              </div>
            </div>

            {/* 11. Database Backup */}
            <div 
              onClick={() => navigate('/database-backup')}
              style={{
                background: '#1f2937',
                color: '#fff',
                borderRadius: '8px',
                padding: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 4px 12px rgba(31, 41, 55, 0.25)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease'
              }}
            >
              <div style={{ fontSize: '28px' }}>💾</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>Database Backup</div>
                <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>{summary.backups_count} Files</div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── INTERACTIVE SETTING MODALS ── */}

      {/* UNIT MODAL */}
      {activeModal === 'unit' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '640px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>📏 Manage Units of Measurement</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>

            {modalSuccess && <div style={{ background: '#def7ec', color: '#03543f', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalSuccess}</div>}
            {modalError && <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalError}</div>}

            <form onSubmit={handleAddUnit} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="text" 
                placeholder="Unit Name (e.g. Square Feet)" 
                value={formInput.name || ''} 
                onChange={(e) => setFormInput({ ...formInput, name: e.target.value })} 
                required 
                className="modern-form-control"
              />
              <input 
                type="text" 
                placeholder="Code (e.g. Sq.ft)" 
                value={formInput.code || ''} 
                onChange={(e) => setFormInput({ ...formInput, code: e.target.value })} 
                required 
                className="modern-form-control" 
                style={{ width: '140px' }}
              />
              <button type="submit" className="primary-btn" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>+ Add Unit</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Unit Name</th>
                  <th>Unit Code</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td><span className="badge badge-outline">{u.code}</span></td>
                    <td>
                      <button type="button" className="text-btn" onClick={() => handleDeleteUnit(u.id)} style={{ color: 'var(--danger)' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BANK ACCOUNT MODAL */}
      {activeModal === 'bank' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '720px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>🏦 Manage Bank Accounts</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>

            {modalSuccess && <div style={{ background: '#def7ec', color: '#03543f', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalSuccess}</div>}
            {modalError && <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalError}</div>}

            <form onSubmit={handleAddBankAccount} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', marginBottom: '20px' }}>
              <input type="text" placeholder="Bank Name" value={formInput.bank_name || ''} onChange={(e) => setFormInput({ ...formInput, bank_name: e.target.value })} required className="modern-form-control" />
              <input type="text" placeholder="Account Name" value={formInput.account_name || ''} onChange={(e) => setFormInput({ ...formInput, account_name: e.target.value })} required className="modern-form-control" />
              <input type="text" placeholder="Acc Number" value={formInput.account_number || ''} onChange={(e) => setFormInput({ ...formInput, account_number: e.target.value })} required className="modern-form-control" />
              <input type="number" placeholder="Opening Bal" value={formInput.opening_balance || ''} onChange={(e) => setFormInput({ ...formInput, opening_balance: e.target.value })} className="modern-form-control" />
              <button type="submit" className="primary-btn" style={{ padding: '8px 16px' }}>+ Save</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Bank Name</th>
                  <th>Account Name</th>
                  <th>Acc No</th>
                  <th>Current Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map(b => (
                  <tr key={b.id}>
                    <td><strong>{b.bank_name}</strong></td>
                    <td>{b.account_name}</td>
                    <td>{b.account_number}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(b.current_balance)}</td>
                    <td>
                      <button type="button" className="text-btn" onClick={() => handleDeleteBankAccount(b.id)} style={{ color: 'var(--danger)' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MOBILE ACCOUNT MODAL */}
      {activeModal === 'mobile' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '720px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>📱 Manage Mobile Banking Accounts</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>

            {modalSuccess && <div style={{ background: '#def7ec', color: '#03543f', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalSuccess}</div>}
            {modalError && <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalError}</div>}

            <form onSubmit={handleAddMobileAccount} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', marginBottom: '20px' }}>
              <input type="text" placeholder="Provider (bKash/Nagad)" value={formInput.provider || ''} onChange={(e) => setFormInput({ ...formInput, provider: e.target.value })} required className="modern-form-control" />
              <input type="text" placeholder="Mobile Number" value={formInput.account_number || ''} onChange={(e) => setFormInput({ ...formInput, account_number: e.target.value })} required className="modern-form-control" />
              <select value={formInput.account_type || 'Personal'} onChange={(e) => setFormInput({ ...formInput, account_type: e.target.value })} className="modern-form-control">
                <option value="Personal">Personal</option>
                <option value="Agent">Agent</option>
                <option value="Merchant">Merchant</option>
              </select>
              <input type="number" placeholder="Opening Bal" value={formInput.opening_balance || ''} onChange={(e) => setFormInput({ ...formInput, opening_balance: e.target.value })} className="modern-form-control" />
              <button type="submit" className="primary-btn" style={{ padding: '8px 16px' }}>+ Save</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Mobile Number</th>
                  <th>Type</th>
                  <th>Current Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.provider}</strong></td>
                    <td>{m.account_number}</td>
                    <td><span className="badge badge-outline">{m.account_type}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(m.current_balance)}</td>
                    <td>
                      <button type="button" className="text-btn" onClick={() => handleDeleteMobileAccount(m.id)} style={{ color: 'var(--danger)' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BALANCE TRANSFER MODAL */}
      {activeModal === 'transfer' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '780px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>🔄 Internal Balance Transfer</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>

            {modalSuccess && <div style={{ background: '#def7ec', color: '#03543f', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalSuccess}</div>}
            {modalError && <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalError}</div>}

            <form onSubmit={handleAddTransfer} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', marginBottom: '20px' }}>
              <select value={formInput.from_account_type || 'cash'} onChange={(e) => setFormInput({ ...formInput, from_account_type: e.target.value })} className="modern-form-control">
                <option value="cash">From: Cash Account</option>
                <option value="bank">From: Bank Account</option>
                <option value="mobile">From: Mobile Banking</option>
              </select>

              <select value={formInput.to_account_type || 'bank'} onChange={(e) => setFormInput({ ...formInput, to_account_type: e.target.value })} className="modern-form-control">
                <option value="bank">To: Bank Account</option>
                <option value="mobile">To: Mobile Banking</option>
                <option value="cash">To: Cash Account</option>
              </select>

              <input type="number" placeholder="Transfer Amount (Tk)" value={formInput.amount || ''} onChange={(e) => setFormInput({ ...formInput, amount: e.target.value })} required className="modern-form-control" />
              <input type="date" value={formInput.transfer_date || new Date().toISOString().substring(0, 10)} onChange={(e) => setFormInput({ ...formInput, transfer_date: e.target.value })} className="modern-form-control" />
              <button type="submit" className="primary-btn" style={{ padding: '8px 16px' }}>Transfer</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Transfer No</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(modalData.transfers || []).map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.transfer_number}</strong></td>
                    <td>{formatDate(t.transfer_date)}</td>
                    <td><span className="badge badge-warning" style={{ textTransform: 'uppercase' }}>{t.from_account_type}</span></td>
                    <td><span className="badge badge-success" style={{ textTransform: 'uppercase' }}>{t.to_account_type}</span></td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* COLORS / VARIANTS MODAL */}
      {activeModal === 'colors' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '680px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>🎨 Product Colors &amp; Variants</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '16px' }}>
              Manage product color codes and variants setup in Products page.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="primary-btn" onClick={() => { setActiveModal(null); navigate('/products'); }}>
                Go to Products Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPENSE TYPES MODAL */}
      {activeModal === 'expense' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '680px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>💸 Expense Categories &amp; Types</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '16px' }}>
              Manage expense categories and vouchers setup in Vouchers &amp; Expenses page.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="primary-btn" onClick={() => { setActiveModal(null); navigate('/vouchers-expenses'); }}>
                Go to Vouchers &amp; Expenses Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT CATEGORY MODAL */}
      {activeModal === 'product_category' && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setActiveModal(null)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '680px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>🏷️ Manage Product Categories</h3>
              <button type="button" className="logout-btn" onClick={() => setActiveModal(null)}>&times;</button>
            </div>

            {modalSuccess && <div style={{ background: '#def7ec', color: '#03543f', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalSuccess}</div>}
            {modalError && <div style={{ background: '#fde8e8', color: '#9b1c1c', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px' }}>{modalError}</div>}

            <form onSubmit={handleAddProductCategory} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr auto', gap: '10px', marginBottom: '20px' }}>
              <input 
                type="text" 
                placeholder="Category Name (e.g. Window Blinds)" 
                value={formInput.name || ''} 
                onChange={(e) => setFormInput({ ...formInput, name: e.target.value })} 
                required 
                className="modern-form-control" 
              />
              <input 
                type="text" 
                placeholder="Description (Optional)" 
                value={formInput.description || ''} 
                onChange={(e) => setFormInput({ ...formInput, description: e.target.value })} 
                className="modern-form-control" 
              />
              <button type="submit" className="primary-btn" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>+ Add Category</button>
            </form>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {modalData.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.description || '-'}</td>
                    <td>
                      <button type="button" className="text-btn" onClick={() => handleDeleteProductCategory(c.id)} style={{ color: 'var(--danger)' }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default Settings;
