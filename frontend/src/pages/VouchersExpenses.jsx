import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';

const VouchersExpenses = () => {
  const { user } = useAuth();
  const { can } = usePermission();

  const [activeTab, setActiveTab] = useState('expenses'); // 'expenses', 'vouchers', 'categories'

  // Expenses State
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalExpenseAmount, setTotalExpenseAmount] = useState(0);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseError, setExpenseError] = useState('');

  // Expenses Filters
  const [filterExpCategory, setFilterExpCategory] = useState('');
  const [filterExpMethod, setFilterExpMethod] = useState('');
  const [filterExpSearch, setFilterExpSearch] = useState('');

  // Vouchers State
  const [vouchers, setVouchers] = useState([]);
  const [totalVoucherAmount, setTotalVoucherAmount] = useState(0);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  const [voucherError, setVoucherError] = useState('');

  // Vouchers Filters
  const [filterVoucherType, setFilterVoucherType] = useState('');
  const [filterVoucherMethod, setFilterVoucherMethod] = useState('');

  // Modals
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // Expense Form State
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState('cash');
  const [expDate, setExpDate] = useState(new Date().toISOString().substring(0, 10));
  const [expBankName, setExpBankName] = useState('');
  const [expMobileProvider, setExpMobileProvider] = useState('bKash');
  const [expRefNo, setExpRefNo] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Voucher Form State
  const [vType, setVType] = useState('debit');
  const [vAmount, setVAmount] = useState('');
  const [vMethod, setVMethod] = useState('cash');
  const [vDate, setVDate] = useState(new Date().toISOString().substring(0, 10));
  const [vBankName, setVBankName] = useState('');
  const [vMobileProvider, setVMobileProvider] = useState('bKash');
  const [vRefNo, setVRefNo] = useState('');
  const [vDescription, setVDescription] = useState('');
  const [vNote, setVNote] = useState('');
  const [submittingVoucher, setSubmittingVoucher] = useState(false);

  // Category Master Form State
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [submittingCategory, setSubmittingCategory] = useState(false);

  // Load Expenses Data
  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    setExpenseError('');
    try {
      const params = new URLSearchParams();
      if (filterExpCategory) params.append('expense_category_id', filterExpCategory);
      if (filterExpMethod) params.append('payment_method', filterExpMethod);
      if (filterExpSearch) params.append('search', filterExpSearch);

      const res = await api.get(`/expenses?all=1&${params.toString()}`);
      const data = res.data?.data || {};

      setExpenses(data.expenses || []);
      setTotalExpenseAmount(data.total_amount || 0);
      setCategories(data.categories || []);
      if (data.categories?.length > 0 && !expCategoryId) {
        setExpCategoryId(data.categories[0].id);
      }
    } catch (err) {
      setExpenseError('Failed to load expenses list.');
    } finally {
      setLoadingExpenses(false);
    }
  }, [filterExpCategory, filterExpMethod, filterExpSearch, expCategoryId]);

  // Load Vouchers Data
  const fetchVouchers = useCallback(async () => {
    setLoadingVouchers(true);
    setVoucherError('');
    try {
      const params = new URLSearchParams();
      if (filterVoucherType) params.append('voucher_type', filterVoucherType);
      if (filterVoucherMethod) params.append('payment_method', filterVoucherMethod);

      const res = await api.get(`/vouchers?all=1&${params.toString()}`);
      const data = res.data?.data || {};

      setVouchers(data.vouchers || []);
      setTotalVoucherAmount(data.total_amount || 0);
    } catch (err) {
      setVoucherError('Failed to load vouchers list.');
    } finally {
      setLoadingVouchers(false);
    }
  }, [filterVoucherType, filterVoucherMethod]);

  useEffect(() => {
    if (activeTab === 'expenses' || activeTab === 'categories') {
      fetchExpenses();
    }
    if (activeTab === 'vouchers') {
      fetchVouchers();
    }
  }, [activeTab, fetchExpenses, fetchVouchers]);

  // Submit New Expense
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expAmount) || 0;
    if (amt <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }

    setSubmittingExpense(true);
    try {
      await api.post('/expenses', {
        expense_category_id: expCategoryId,
        amount: amt,
        payment_method: expMethod,
        expense_date: expDate,
        bank_name: expBankName,
        mobile_provider: expMobileProvider,
        reference_number: expRefNo,
        description: expDescription,
      });

      alert('Expense recorded and posted to cash/bank book successfully!');
      setIsExpenseModalOpen(false);
      setExpAmount('');
      setExpDescription('');
      setExpRefNo('');
      fetchExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record expense.');
    } finally {
      setSubmittingExpense(false);
    }
  };

  // Submit New Voucher (Admin Only)
  const handleVoucherSubmit = async (e) => {
    e.preventDefault();
    const amt = parseFloat(vAmount) || 0;
    if (amt <= 0) {
      alert('Please enter a valid voucher amount.');
      return;
    }

    setSubmittingVoucher(true);
    try {
      await api.post('/vouchers', {
        voucher_type: vType,
        total_amount: amt,
        payment_method: vMethod,
        date: vDate,
        bank_name: vBankName,
        mobile_provider: vMobileProvider,
        reference_number: vRefNo,
        description: vDescription,
        note: vNote,
      });

      alert(`Accounting voucher (${vType.toUpperCase()}) created successfully!`);
      setIsVoucherModalOpen(false);
      setVAmount('');
      setVDescription('');
      setVNote('');
      setVRefNo('');
      fetchVouchers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create voucher.');
    } finally {
      setSubmittingVoucher(false);
    }
  };

  // Submit New Expense Category Master
  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return;

    setSubmittingCategory(true);
    try {
      await api.post('/master/expense-categories', {
        name: catName,
        description: catDescription,
      });

      alert('Expense category added successfully!');
      setIsCategoryModalOpen(false);
      setCatName('');
      setCatDescription('');
      fetchExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create expense category.');
    } finally {
      setSubmittingCategory(false);
    }
  };

  // Archive Expense
  const handleArchiveExpense = async (id, expNo) => {
    if (!confirm(`Are you sure you want to archive expense ${expNo}?`)) return;
    try {
      await api.delete(`/expenses/${id}`);
      alert(`Expense ${expNo} archived successfully.`);
      fetchExpenses();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive expense.');
    }
  };

  // Archive Voucher
  const handleArchiveVoucher = async (id, vNo) => {
    if (!confirm(`Are you sure you want to archive voucher ${vNo}?`)) return;
    try {
      await api.delete(`/vouchers/${id}`);
      alert(`Voucher ${vNo} archived successfully.`);
      fetchVouchers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive voucher.');
    }
  };

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>Vouchers & Expense Management</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
            Track business operating expenses, category master, and manual accounting vouchers (Debit/Credit/Journal)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {activeTab === 'expenses' && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setIsExpenseModalOpen(true)}
              style={{ backgroundColor: '#2563eb', padding: '10px 18px', fontWeight: 'bold' }}
            >
              ➕ Record Expense
            </button>
          )}
          {activeTab === 'vouchers' && (user?.role === 'admin' || can('vouchers:create')) && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setIsVoucherModalOpen(true)}
              style={{ backgroundColor: '#0284c7', padding: '10px 18px', fontWeight: 'bold' }}
            >
              📜 New Voucher
            </button>
          )}
          {activeTab === 'categories' && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setIsCategoryModalOpen(true)}
              style={{ backgroundColor: '#059669', padding: '10px 18px', fontWeight: 'bold' }}
            >
              📂 Add Expense Category
            </button>
          )}
        </div>
      </div>

      {/* Tabs Header */}
      <div className="welcome-banner" style={{ padding: '8px 12px', marginBottom: '20px', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'expenses' ? '#2563eb' : 'transparent',
            color: activeTab === 'expenses' ? '#fff' : '#475569',
          }}
        >
          💸 Expense Tracker ({expenses.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('vouchers')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'vouchers' ? '#2563eb' : 'transparent',
            color: activeTab === 'vouchers' ? '#fff' : '#475569',
          }}
        >
          📜 Vouchers & Journal Adjustments ({vouchers.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            fontSize: '13px',
            fontWeight: '700',
            cursor: 'pointer',
            backgroundColor: activeTab === 'categories' ? '#2563eb' : 'transparent',
            color: activeTab === 'categories' ? '#fff' : '#475569',
          }}
        >
          📂 Expense Category Master ({categories.length})
        </button>
      </div>

      {/* TAB 1: EXPENSES TRACKER */}
      {activeTab === 'expenses' && (
        <>
          {/* KPI Summary Banner */}
          <div className="welcome-banner" style={{ padding: '16px 20px', marginBottom: '20px', borderLeft: '4px solid #2563eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Total Business Expenses</span>
              <h2 style={{ margin: '4px 0 0', color: '#2563eb', fontSize: '26px', fontWeight: '800' }}>
                {formatCurrency(totalExpenseAmount)}
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>
                Auto-reflected in <strong>Cash / Bank / Mobile Books</strong>
              </span>
            </div>
          </div>

          {/* Expenses Filter Row */}
          <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>Category</label>
              <select
                className="modern-form-control"
                value={filterExpCategory}
                onChange={(e) => setFilterExpCategory(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>Payment Method</label>
              <select
                className="modern-form-control"
                value={filterExpMethod}
                onChange={(e) => setFilterExpMethod(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank Cheque</option>
                <option value="mobile">Mobile Banking</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0, flex: 2, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>Search Description / Ref</label>
              <input
                type="text"
                className="modern-form-control"
                placeholder="Search expense no, ref, description..."
                value={filterExpSearch}
                onChange={(e) => setFilterExpSearch(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Expenses Data Table */}
          {loadingExpenses ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Expense No.</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Ref / Payee Details</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                        No expense records found.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td><strong style={{ color: '#2563eb' }}>{exp.expense_number}</strong></td>
                        <td><span className="badge badge-info">{exp.category?.name || 'General'}</span></td>
                        <td>{formatDate(exp.expense_date)}</td>
                        <td>
                          <span className={`badge ${
                            exp.payment_method === 'cash' ? 'badge-success' :
                            exp.payment_method === 'bank' ? 'badge-info' : 'badge-warning'
                          }`}>
                            {exp.payment_method}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          {exp.bank_name && <div>Bank: <strong>{exp.bank_name}</strong></div>}
                          {exp.mobile_provider && <div>Mobile: <strong>{exp.mobile_provider}</strong></div>}
                          {exp.reference_number && <div style={{ color: '#64748b' }}>Ref: {exp.reference_number}</div>}
                          {!exp.bank_name && !exp.mobile_provider && !exp.reference_number && <span style={{ color: '#94a3b8' }}>Cash Payout</span>}
                        </td>
                        <td style={{ fontSize: '13px', color: '#334155' }}>{exp.description || 'N/A'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: '15px' }}>
                          {formatCurrency(exp.amount)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => handleArchiveExpense(exp.id, exp.expense_number)}
                            style={{ color: '#dc2626', fontSize: '12px' }}
                          >
                            Archive
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

      {/* TAB 2: VOUCHERS (ADMIN ONLY) */}
      {activeTab === 'vouchers' && (
        <>
          {/* Admin Banner */}
          <div className="welcome-banner" style={{ padding: '16px 20px', marginBottom: '20px', borderLeft: '4px solid #0284c7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700' }}>Admin Accounting Vouchers</span>
              <h2 style={{ margin: '4px 0 0', color: '#0284c7', fontSize: '24px', fontWeight: '800' }}>
                Debit / Credit / Journal Vouchers
              </h2>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>
                Total Vouchers Value: <strong style={{ color: '#0284c7' }}>{formatCurrency(totalVoucherAmount)}</strong>
              </span>
            </div>
          </div>

          {/* Vouchers Filter Row */}
          <div className="welcome-banner" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>Voucher Type</label>
              <select
                className="modern-form-control"
                value={filterVoucherType}
                onChange={(e) => setFilterVoucherType(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              >
                <option value="">All Types</option>
                <option value="debit">Debit Voucher</option>
                <option value="credit">Credit Voucher</option>
                <option value="journal">Journal Adjustment</option>
              </select>
            </div>

            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600' }}>Payment Method</label>
              <select
                className="modern-form-control"
                value={filterVoucherMethod}
                onChange={(e) => setFilterVoucherMethod(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '13px' }}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
          </div>

          {/* Vouchers Data Table */}
          {loadingVouchers ? (
            <div className="flex-center" style={{ padding: '40px' }}><div className="spinner"></div></div>
          ) : (
            <div className="card-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Voucher No.</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Description / Particulars</th>
                    <th>Note / Ref</th>
                    <th style={{ textAlign: 'right' }}>Total Amount</th>
                    <th style={{ textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                        No voucher records found.
                      </td>
                    </tr>
                  ) : (
                    vouchers.map((v) => (
                      <tr key={v.id}>
                        <td><strong style={{ color: '#0284c7' }}>{v.voucher_number}</strong></td>
                        <td>
                          <span className={`badge ${
                            v.voucher_type === 'credit' ? 'badge-success' :
                            v.voucher_type === 'debit' ? 'badge-danger' : 'badge-info'
                          }`} style={{ textTransform: 'uppercase' }}>
                            {v.voucher_type}
                          </span>
                        </td>
                        <td>{formatDate(v.date)}</td>
                        <td><span className="badge badge-warning" style={{ textTransform: 'uppercase' }}>{v.payment_method}</span></td>
                        <td style={{ fontSize: '13px', color: '#334155' }}>{v.description || 'Adjustment Entry'}</td>
                        <td style={{ fontSize: '12px', color: '#64748b' }}>{v.note || v.reference_number || 'N/A'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a', fontSize: '15px' }}>
                          {formatCurrency(v.total_amount)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {(user?.role === 'admin' || can('vouchers:archive')) && (
                            <button
                              type="button"
                              className="text-btn"
                              onClick={() => handleArchiveVoucher(v.id, v.voucher_number)}
                              style={{ color: '#dc2626', fontSize: '12px' }}
                            >
                              Archive
                            </button>
                          )}
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

      {/* TAB 3: EXPENSE CATEGORIES MASTER */}
      {activeTab === 'categories' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          {categories.map((cat) => (
            <div key={cat.id} className="welcome-banner" style={{ padding: '20px', borderLeft: '4px solid #059669' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '16px' }}>{cat.name}</h3>
                <span className="badge badge-success" style={{ fontSize: '11px' }}>Active</span>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748b' }}>
                {cat.description || 'Standard expense category.'}
              </p>
              <div style={{ fontSize: '12px', color: '#475569', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
                Expenses logged: <strong>{expenses.filter(e => e.expense_category_id === cat.id).length} items</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Record New Expense */}
      {isExpenseModalOpen && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsExpenseModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">💸 Record New Business Expense</h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsExpenseModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleExpenseSubmit} style={{ padding: '20px' }}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700' }}>Expense Category *</label>
                <select
                  className="modern-form-control"
                  required
                  value={expCategoryId}
                  onChange={(e) => setExpCategoryId(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Amount (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Enter amount"
                    className="modern-form-control"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Expense Date *</label>
                  <input
                    type="date"
                    required
                    className="modern-form-control"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700' }}>Payment Method (Book Reflection) *</label>
                <select
                  className="modern-form-control"
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value)}
                >
                  <option value="cash">💵 Cash (Reflects in Cash Book)</option>
                  <option value="bank">🏦 Bank Cheque (Reflects in Bank Book)</option>
                  <option value="mobile">📱 Mobile Banking (Reflects in Mobile Book)</option>
                </select>
              </div>

              {expMethod === 'bank' && (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px' }}>Bank Name & Cheque No.</label>
                  <input
                    type="text"
                    placeholder="e.g. City Bank - Cheque: 104885"
                    className="modern-form-control"
                    value={expBankName}
                    onChange={(e) => setExpBankName(e.target.value)}
                  />
                </div>
              )}

              {expMethod === 'mobile' && (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px' }}>Mobile Provider & Txn ID</label>
                  <input
                    type="text"
                    placeholder="e.g. bKash Txn: TRX-8845"
                    className="modern-form-control"
                    value={expRefNo}
                    onChange={(e) => setExpRefNo(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px' }}>Description / Payee Details</label>
                <textarea
                  className="modern-form-control"
                  rows="2"
                  placeholder="e.g. Monthly showroom rent payment"
                  value={expDescription}
                  onChange={(e) => setExpDescription(e.target.value)}
                ></textarea>
              </div>

              <div className="custom-modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn-modal-cancel" onClick={() => setIsExpenseModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingExpense}>
                  {submittingExpense ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Create Voucher (Admin Only) */}
      {isVoucherModalOpen && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsVoucherModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">📜 New Accounting Voucher (Admin)</h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsVoucherModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleVoucherSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Voucher Type *</label>
                  <select
                    className="modern-form-control"
                    value={vType}
                    onChange={(e) => setVType(e.target.value)}
                  >
                    <option value="debit">Debit Voucher (Payout)</option>
                    <option value="credit">Credit Voucher (Receipt)</option>
                    <option value="journal">Journal Adjustment</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Voucher Amount (৳) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Enter total amount"
                    className="modern-form-control"
                    value={vAmount}
                    onChange={(e) => setVAmount(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Payment Method *</label>
                  <select
                    className="modern-form-control"
                    value={vMethod}
                    onChange={(e) => setVMethod(e.target.value)}
                  >
                    <option value="cash">Cash Book</option>
                    <option value="bank">Bank Book</option>
                    <option value="mobile">Mobile Book</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Voucher Date *</label>
                  <input
                    type="date"
                    required
                    className="modern-form-control"
                    value={vDate}
                    onChange={(e) => setVDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px' }}>Description / Particulars</label>
                <input
                  type="text"
                  placeholder="e.g. End of month ledger adjustment"
                  className="modern-form-control"
                  value={vDescription}
                  onChange={(e) => setVDescription(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px' }}>Voucher Note / Remarks</label>
                <textarea
                  className="modern-form-control"
                  rows="2"
                  placeholder="Auditor remarks or justification"
                  value={vNote}
                  onChange={(e) => setVNote(e.target.value)}
                ></textarea>
              </div>

              <div className="custom-modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn-modal-cancel" onClick={() => setIsVoucherModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingVoucher}>
                  {submittingVoucher ? 'Creating...' : 'Create Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Add Expense Category */}
      {isCategoryModalOpen && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsCategoryModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '480px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">📂 Add Expense Category</h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsCategoryModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleCategorySubmit} style={{ padding: '20px' }}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700' }}>Category Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Utility, Transport, Salary, Rent..."
                  className="modern-form-control"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px' }}>Category Description</label>
                <textarea
                  className="modern-form-control"
                  rows="2"
                  placeholder="Brief description of this expense type"
                  value={catDescription}
                  onChange={(e) => setCatDescription(e.target.value)}
                ></textarea>
              </div>

              <div className="custom-modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn-modal-cancel" onClick={() => setIsCategoryModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingCategory}>
                  {submittingCategory ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default VouchersExpenses;
