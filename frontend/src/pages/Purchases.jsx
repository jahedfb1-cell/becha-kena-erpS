import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';

const Purchases = () => {
  const { user } = useAuth();
  const { can } = usePermission();

  const [purchases, setPurchases] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [supplierLedgers, setSupplierLedgers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [colorCodeSearch, setColorCodeSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const [paymentSupplier, setPaymentSupplier] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().substring(0, 10));
  const [payMethod, setPayMethod] = useState('cash');
  const [bankName, setBankName] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [txnId, setTxnId] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Fetch purchase list & supplier ledgers from API
  const fetchPurchases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedSupplierId) params.append('supplier_id', selectedSupplierId);
      if (colorCodeSearch) params.append('color_code', colorCodeSearch);

      const response = await api.get(`/purchases?all=1&${params.toString()}`);
      const data = response.data?.data || {};

      setPurchases(data.purchases || []);
      setSuppliersList(data.suppliers_list || []);
      setSupplierLedgers(data.supplier_ledgers || {});
    } catch (err) {
      console.error('Error fetching purchases:', err);
      setError('Failed to retrieve purchase list & supplier ledger data.');
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId, colorCodeSearch]);

  useEffect(() => {
    fetchPurchases();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPurchases();
  };

  const handleResetFilters = () => {
    setSelectedSupplierId('');
    setColorCodeSearch('');
    setTableSearch('');
    fetchPurchases();
  };

  // Local table search filtering
  const filteredPurchases = useMemo(() => {
    return purchases.filter((item) => {
      if (!tableSearch) return true;
      const q = tableSearch.toLowerCase().trim();
      const pNo = item.purchase_number ? item.purchase_number.toLowerCase() : '';
      const oNo = item.quotation?.quotation_number ? item.quotation.quotation_number.toLowerCase() : '';
      const supName = item.supplier?.name ? item.supplier.name.toLowerCase() : '';
      const custName = item.quotation?.customer?.name ? item.quotation.customer.name.toLowerCase() : '';
      const prodName = item.product?.name ? item.product.name.toLowerCase() : '';
      const prodCode = item.product?.product_code ? item.product.product_code.toLowerCase() : '';
      const varName = item.variant?.variant_name ? item.variant.variant_name.toLowerCase() : '';

      return (
        pNo.includes(q) ||
        oNo.includes(q) ||
        supName.includes(q) ||
        custName.includes(q) ||
        prodName.includes(q) ||
        prodCode.includes(q) ||
        varName.includes(q)
      );
    });
  }, [purchases, tableSearch]);

  // Pagination slice
  const paginatedPurchases = useMemo(() => {
    const start = (currentPage - 1) * entriesPerPage;
    return filteredPurchases.slice(start, start + entriesPerPage);
  }, [filteredPurchases, currentPage, entriesPerPage]);

  const totalPages = Math.ceil(filteredPurchases.length / entriesPerPage) || 1;

  // Open Payment Modal for Supplier
  const handleOpenPaymentModal = (supplier) => {
    if (!supplier) return;
    const ledger = supplierLedgers[supplier.id] || {};
    setPaymentSupplier({
      ...supplier,
      due_balance: ledger.due_balance || 0,
    });
    setPayAmount(ledger.due_balance > 0 ? ledger.due_balance : '');
    setIsPaymentModalOpen(true);
  };

  // Submit Supplier Payment
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!paymentSupplier) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) {
      alert('Please enter a valid payment amount greater than 0.');
      return;
    }

    setSubmittingPayment(true);
    try {
      await api.post('/purchases/supplier-payment', {
        supplier_id: paymentSupplier.id,
        amount: amt,
        payment_date: payDate,
        payment_method: payMethod,
        bank_name: bankName,
        cheque_number: chequeNo,
        transaction_id: txnId,
        notes: payNotes,
      });

      alert(`Supplier payment of ${formatCurrency(amt)} recorded successfully.`);
      setIsPaymentModalOpen(false);
      fetchPurchases();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to record supplier payment.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row" style={{ marginBottom: '16px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0f172a' }}>Purchase List & Supplier Ledger</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>
            Manage product purchase entries, supplier priority routing, and payment ledgers
          </p>
        </div>
      </div>

      {/* Top Filter Form matching User Reference Screenshot */}
      <form onSubmit={handleSearchSubmit} className="welcome-banner" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
          
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
              Select Supplier *
            </label>
            <select
              className="modern-form-control"
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              style={{ padding: '9px 12px', fontSize: '13px' }}
            >
              <option value="">All Suppliers</option>
              {suppliersList.map((sup) => {
                const ledger = supplierLedgers[sup.id];
                const dueText = ledger ? ` (Due: ৳${ledger.due_balance})` : '';
                return (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.supplier_code}){dueText}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
              Color code / Product search *
            </label>
            <input
              type="text"
              className="modern-form-control"
              placeholder="e.g. BL-001, Silver Grey, QT-2026-0004..."
              value={colorCodeSearch}
              onChange={(e) => setColorCodeSearch(e.target.value)}
              style={{ padding: '9px 12px', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="submit"
              className="primary-btn"
              style={{ padding: '9px 20px', backgroundColor: '#0284c7', borderColor: '#0284c7', fontWeight: 'bold' }}
            >
              🔍 Search
            </button>
            <button
              type="button"
              className="logout-btn"
              onClick={handleResetFilters}
              style={{ padding: '9px 16px' }}
            >
              Reset
            </button>
          </div>

        </div>
      </form>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Controls Bar: Entries Per Page & Table Keyword Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569' }}>
          <span>Show</span>
          <select
            value={entriesPerPage}
            onChange={(e) => { setEntriesPerPage(Number(e.target.value)); setCurrentPage(1); }}
            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>entries</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span style={{ fontWeight: '600' }}>Search:</span>
          <input
            type="text"
            placeholder="Type keyword..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', width: '220px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Main Data Table matching Reference Screenshot */}
      {loading ? (
        <div className="flex-center" style={{ padding: '50px' }}><div className="spinner"></div></div>
      ) : (
        <div className="card-table-wrapper" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ width: '40px', textAlign: 'center' }}>SN</th>
                <th>SUPPLIER</th>
                <th>Customer</th>
                <th>Address</th>
                <th>PRODUCTS</th>
                <th style={{ textAlign: 'center' }}>QTY</th>
                <th style={{ textAlign: 'center' }}>O-NO</th>
                <th>DATE</th>
                <th style={{ textAlign: 'right' }}>TOTAL</th>
                <th style={{ textAlign: 'right' }}>PAID</th>
                <th style={{ textAlign: 'right' }}>DUE</th>
                <th style={{ textAlign: 'center', width: '100px' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPurchases.length === 0 ? (
                <tr>
                  <td colSpan="12" style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                    No purchase entry records found matching selected criteria.
                  </td>
                </tr>
              ) : (
                paginatedPurchases.map((item, index) => {
                  const sn = (currentPage - 1) * entriesPerPage + index + 1;
                  const supplier = item.supplier || {};
                  const ledger = supplierLedgers[supplier.id] || {};
                  const customer = item.quotation?.customer || {};
                  const orderNo = item.quotation?.quotation_number || item.purchase_number;

                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{sn}</td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{supplier.name || 'N/A'}</strong>
                        {supplier.supplier_code && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{supplier.supplier_code}</div>
                        )}
                      </td>
                      <td>
                        <strong>{customer.company_name || customer.name || 'N/A'}</strong>
                        {customer.phone && <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {customer.phone}</div>}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '160px', color: '#475569' }}>
                        {customer.address || 'Dhaka, Bangladesh'}
                      </td>
                      <td>
                        <strong style={{ color: '#2563eb' }}>{item.product?.name || item.product?.product_code}</strong>
                        {item.variant?.variant_name && (
                          <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>
                            Color/Variant: <strong>{item.variant.variant_name}</strong>
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: '600' }}>
                        {item.billed_sqft} sqft
                        <div style={{ fontSize: '11px', color: '#64748b' }}>({item.pcs} pcs)</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: '#2563eb', fontSize: '12px' }}>
                          {orderNo}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#334155' }}>
                        {formatDate(item.purchase_date || item.created_at)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                        {formatCurrency(item.total_cost)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: '600' }}>
                        {formatCurrency(ledger.total_paid || 0)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 'bold' }}>
                        {formatCurrency(ledger.due_balance || item.total_cost)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedPurchase(item); setIsDetailModalOpen(true); }}
                            style={{
                              backgroundColor: '#0ea5e9',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                            title="View Details"
                          >
                            👁️
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenPaymentModal(supplier)}
                            style={{
                              backgroundColor: '#eab308',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                            title="Record Supplier Payment"
                          >
                            ➕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', fontSize: '13px', color: '#64748b' }}>
        <div>
          Showing {paginatedPurchases.length > 0 ? (currentPage - 1) * entriesPerPage + 1 : 0} to {Math.min(currentPage * entriesPerPage, filteredPurchases.length)} of {filteredPurchases.length} entries
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className="logout-btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            Previous
          </button>
          <span style={{ padding: '4px 8px', fontWeight: 'bold' }}>{currentPage} / {totalPages}</span>
          <button
            className="logout-btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            style={{ padding: '4px 10px', fontSize: '12px' }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Detail Modal */}
      {isDetailModalOpen && selectedPurchase && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsDetailModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '580px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">
                📦 Purchase Entry #{selectedPurchase.purchase_number}
              </h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsDetailModalOpen(false)}>&times;</button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Supplier</span>
                    <h4 style={{ margin: '2px 0 0', color: '#0f172a' }}>{selectedPurchase.supplier?.name}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>Code: {selectedPurchase.supplier?.supplier_code}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Order Ref</span>
                    <h4 style={{ margin: '2px 0 0', color: '#2563eb' }}>{selectedPurchase.quotation?.quotation_number}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>Customer: {selectedPurchase.quotation?.customer?.name}</p>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Product Specifications</span>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#0f172a', fontWeight: '600' }}>
                    {selectedPurchase.product?.product_code} - {selectedPurchase.product?.name}
                    {selectedPurchase.variant?.variant_name && <span> ({selectedPurchase.variant.variant_name})</span>}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#334155' }}>
                    Dimensions: <strong>{selectedPurchase.width} &times; {selectedPurchase.height} in</strong> ({selectedPurchase.pcs} Pcs)<br />
                    Billed Quantity: <strong>{selectedPurchase.billed_sqft} sqft</strong>
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', backgroundColor: 'rgba(37,99,235,0.06)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.2)' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#475569' }}>Cost Price (per sqft):</span>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                    {formatCurrency(selectedPurchase.cost_price)}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#475569' }}>Total Purchase Cost:</span>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#2563eb' }}>
                    {formatCurrency(selectedPurchase.total_cost)}
                  </div>
                </div>
              </div>
            </div>

            <div className="custom-modal-footer">
              <button type="button" className="btn-modal-cancel" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Payment Modal */}
      {isPaymentModalOpen && paymentSupplier && (
        <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsPaymentModalOpen(false)}>
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '520px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">
                💳 Record Supplier Payment ({paymentSupplier.name})
              </h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsPaymentModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handlePaymentSubmit} style={{ padding: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#475569' }}>Supplier Current Balance Due:</span>
                <strong style={{ fontSize: '18px', color: '#dc2626' }}>
                  {formatCurrency(paymentSupplier.due_balance)}
                </strong>
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '13px', fontWeight: '700' }}>Payment Amount (৳) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="Enter amount to pay"
                  className="modern-form-control"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Payment Method *</label>
                  <select
                    className="modern-form-control"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Cheque</option>
                    <option value="mobile">Mobile Banking</option>
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '13px', fontWeight: '700' }}>Payment Date *</label>
                  <input
                    type="date"
                    required
                    className="modern-form-control"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
              </div>

              {payMethod === 'bank' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Bank Name</label>
                    <input
                      type="text"
                      placeholder="e.g. City Bank"
                      className="modern-form-control"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '12px' }}>Cheque Number</label>
                    <input
                      type="text"
                      placeholder="Cheque No."
                      className="modern-form-control"
                      value={chequeNo}
                      onChange={(e) => setChequeNo(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {payMethod === 'mobile' && (
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px' }}>Transaction ID (bKash / Nagad)</label>
                  <input
                    type="text"
                    placeholder="Txn ID"
                    className="modern-form-control"
                    value={txnId}
                    onChange={(e) => setTxnId(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px' }}>Notes / Remarks</label>
                <textarea
                  className="modern-form-control"
                  rows="2"
                  placeholder="Payment notes"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                ></textarea>
              </div>

              <div className="custom-modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn-modal-cancel" onClick={() => setIsPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingPayment}>
                  {submittingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Purchases;
