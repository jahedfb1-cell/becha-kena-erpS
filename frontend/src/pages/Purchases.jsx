import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../store/AuthContext';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';

const Purchases = () => {
  const { user } = useAuth();
  const { can } = usePermission();
  const [searchParams] = useSearchParams();

  const [purchases, setPurchases] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);
  const [supplierLedgers, setSupplierLedgers] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [colorCodeSearch, setColorCodeSearch] = useState('');
  const [tableSearch, setTableSearch] = useState(searchParams.get('search') || '');
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

  // Group purchase entries order-wise (1 row per Order / Invoice)
  const groupedPurchases = useMemo(() => {
    const map = new Map();

    purchases.forEach((item) => {
      // Group key: quotation_id if available, otherwise purchase_number or id
      const groupKey = item.quotation_id
        ? `q_${item.quotation_id}`
        : (item.purchase_number ? `p_${item.purchase_number}` : `i_${item.id}`);

      if (!map.has(groupKey)) {
        let comp = item.supplier?.company_name || '';
        let human = item.supplier?.name || '';
        const isHumanComp = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(human);
        const isCompPerson = /^[a-zA-Z\s]+$/.test(comp) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(comp);

        if ((!comp && isHumanComp) || (isHumanComp && isCompPerson)) {
          comp = human;
        }
        const supplierCompName = comp || human || 'N/A';

        const customerCompName = item.quotation?.customer?.company_name || item.quotation?.customer?.name || 'N/A';
        const customerAddress = item.quotation?.customer?.address || item.quotation?.delivery_address || 'Dhaka, Bangladesh';
        const customerPhone = item.quotation?.customer?.phone || '';
        const orderNo = item.quotation?.quotation_number || item.purchase_number || 'N/A';
        const purchaseDate = item.purchase_date || item.created_at;

        map.set(groupKey, {
          groupKey,
          id: item.id,
          quotation_id: item.quotation_id,
          purchase_number: item.purchase_number,
          orderNo,
          supplier: item.supplier,
          supplierCompName,
          customerCompName,
          customerAddress,
          customerPhone,
          purchaseDate,
          totalSqft: 0,
          totalPcs: 0,
          totalCost: 0,
          rawEntries: [],
        });
      }

      const group = map.get(groupKey);
      group.rawEntries.push(item);
      group.totalSqft += parseFloat(item.billed_sqft) || 0;
      group.totalPcs += parseInt(item.pcs) || 0;
      group.totalCost += parseFloat(item.total_cost) || 0;
    });

    return Array.from(map.values());
  }, [purchases]);

  // Local table search filtering on grouped order rows
  const filteredPurchases = useMemo(() => {
    return groupedPurchases.filter((group) => {
      if (!tableSearch) return true;
      const q = tableSearch.toLowerCase().trim();

      const oNo = group.orderNo.toLowerCase();
      const pNo = group.purchase_number ? group.purchase_number.toLowerCase() : '';
      const supName = group.supplierCompName.toLowerCase();
      const custName = group.customerCompName.toLowerCase();
      const addr = group.customerAddress.toLowerCase();
      const prods = group.rawEntries.map(e => `${e.product?.name} ${e.variant?.variant_name}`).join(' ').toLowerCase();

      return (
        oNo.includes(q) ||
        pNo.includes(q) ||
        supName.includes(q) ||
        custName.includes(q) ||
        addr.includes(q) ||
        prods.includes(q)
      );
    });
  }, [groupedPurchases, tableSearch]);

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
    setPayAmount('');
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
          <span style={{ fontSize: '13px', color: '#64748b' }}>Dashboard / Purchases</span>
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
                let comp = sup.company_name || '';
                let human = sup.name || '';
                const isHumanComp = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(human);
                const isCompPerson = /^[a-zA-Z\s]+$/.test(comp) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(comp);

                if ((!comp && isHumanComp) || (isHumanComp && isCompPerson)) {
                  comp = human;
                }
                const compName = comp || human || 'Supplier';

                const ledger = supplierLedgers[sup.id];
                const dueText = ledger ? ` (Due: ৳${ledger.due_balance})` : '';
                return (
                  <option key={sup.id} value={sup.id}>
                    {compName}{dueText}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
              Color Code / Product Search
            </label>
            <input
              type="text"
              className="modern-form-control"
              placeholder="e.g. BL-001 or Variant name"
              value={colorCodeSearch}
              onChange={(e) => setColorCodeSearch(e.target.value)}
              style={{ padding: '9px 12px', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              className="btn-modal-submit"
              style={{ padding: '9px 16px', fontSize: '13px' }}
            >
              Search
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
        <>
        <div className="card-table-wrapper purchases-desktop-table" style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ width: '40px', textAlign: 'center' }}>SN</th>
                <th>SUPPLIER</th>
                <th>Customer</th>
                <th>Address</th>
                <th>PRODUCTS</th>
                <th style={{ textAlign: 'center' }}>total QTY</th>
                <th style={{ textAlign: 'center' }}>Order-NO/ invoice no</th>
                <th>DATE</th>
                <th style={{ textAlign: 'right' }}>TOTAL TK (total invoice value)</th>
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
                paginatedPurchases.map((group, index) => {
                  const sn = (currentPage - 1) * entriesPerPage + index + 1;
                  const supplier = group.supplier || {};
                  const ledger = supplierLedgers[supplier.id] || {};

                  return (
                    <tr key={group.groupKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{sn}</td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{group.supplierCompName}</strong>
                      </td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{group.customerCompName}</strong>
                        {group.customerPhone && <div style={{ fontSize: '11px', color: '#64748b' }}>📞 {group.customerPhone}</div>}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '160px', color: '#475569' }}>
                        {group.customerAddress}
                      </td>
                      <td>
                        {(() => {
                          const uniqueProducts = Array.from(
                            new Map(
                              group.rawEntries.map((item) => {
                                const pCode = item.product?.product_code || item.product?.name || 'Product';
                                const vName = item.variant?.variant_name ? ` (${item.variant.variant_name})` : '';
                                const fullLabel = `${pCode}${vName}`;
                                return [fullLabel, { pCode, vName }];
                              })
                            ).values()
                          );

                          return uniqueProducts.map((obj, i) => (
                            <div key={i} style={{ marginBottom: i < uniqueProducts.length - 1 ? '3px' : 0 }}>
                              <strong style={{ color: '#2563eb' }}>{obj.pCode}</strong>
                              {obj.vName && <span style={{ fontSize: '11px', color: '#64748b' }}>{obj.vName}</span>}
                            </div>
                          ));
                        })()}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: '600' }}>
                        <strong style={{ color: '#0f172a' }}>{group.totalSqft.toFixed(2)} sq.ft</strong>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{group.totalPcs} Pcs/Nos</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {group.quotation_id ? (
                          <a
                            href={`/quotations/print/${group.quotation_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontWeight: 'bold', color: '#2563eb', textDecoration: 'none', fontSize: '13px' }}
                          >
                            {group.orderNo} ↗
                          </a>
                        ) : (
                          <span style={{ fontWeight: 'bold', color: '#2563eb', fontSize: '13px' }}>
                            {group.orderNo}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', color: '#334155' }}>
                        {formatDate(group.purchaseDate)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                        {formatCurrency(group.totalCost)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: '600' }}>
                        {formatCurrency(ledger.total_paid || 0)}
                      </td>
                      <td style={{ textAlign: 'right', color: (ledger.due_balance > 0 || (group.totalCost - (ledger.total_paid || 0)) > 0) ? '#dc2626' : 'inherit', fontWeight: 'bold' }}>
                        {formatCurrency(ledger.due_balance !== undefined ? ledger.due_balance : Math.max(0, group.totalCost - (ledger.total_paid || 0)))}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedPurchase(group); setIsDetailModalOpen(true); }}
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
            {filteredPurchases.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td colSpan="5" style={{ textAlign: 'right', padding: '12px' }}>TOTALS:</td>
                  <td style={{ textAlign: 'center', padding: '12px', color: '#007bff' }}>
                    <div>{filteredPurchases.reduce((sum, p) => sum + p.totalSqft, 0).toFixed(2)} sq.ft</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>({filteredPurchases.reduce((sum, p) => sum + p.totalPcs, 0)} Pcs/Nos)</div>
                  </td>
                  <td colSpan="2"></td>
                  <td style={{ textAlign: 'right', padding: '12px', color: '#0f172a' }}>
                    {formatCurrency(filteredPurchases.reduce((sum, p) => sum + p.totalCost, 0))}
                  </td>
                  <td colSpan="3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile card list — same grouped data as the desktop table */}
        <div className="purchases-mobile-list">
          {paginatedPurchases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
              No purchase entry records found matching selected criteria.
            </div>
          ) : (
            paginatedPurchases.map((group, index) => {
              const sn = (currentPage - 1) * entriesPerPage + index + 1;
              const supplier = group.supplier || {};
              const ledger = supplierLedgers[supplier.id] || {};
              const due = ledger.due_balance !== undefined ? ledger.due_balance : Math.max(0, group.totalCost - (ledger.total_paid || 0));

              const uniqueProducts = Array.from(
                new Map(
                  group.rawEntries.map((item) => {
                    const pCode = item.product?.product_code || item.product?.name || 'Product';
                    const vName = item.variant?.variant_name ? ` (${item.variant.variant_name})` : '';
                    return [`${pCode}${vName}`, `${pCode}${vName}`];
                  })
                ).values()
              );

              return (
                <div className="purchase-mobile-card" key={group.groupKey}>
                  <div className="purchase-mobile-card-header">
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>#{sn}</span>
                      <strong style={{ color: '#0f172a', display: 'block', fontSize: '14px' }}>{group.supplierCompName}</strong>
                      <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 700 }}>{group.orderNo}</span>
                    </div>
                    <div className="purchase-mobile-card-actions">
                      <button
                        type="button"
                        onClick={() => { setSelectedPurchase(group); setIsDetailModalOpen(true); }}
                        style={{ backgroundColor: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}
                        title="View Details"
                      >
                        👁️
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPaymentModal(supplier)}
                        style={{ backgroundColor: '#eab308', color: '#fff', border: 'none', borderRadius: '4px', padding: '6px 9px', cursor: 'pointer', fontSize: '13px' }}
                        title="Record Supplier Payment"
                      >
                        ➕
                      </button>
                    </div>
                  </div>

                  <div className="purchase-mobile-card-row">
                    <span>Customer</span>
                    <span>{group.customerCompName}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Address</span>
                    <span>{group.customerAddress}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Products</span>
                    <span>{uniqueProducts.join(', ')}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Total Qty</span>
                    <span>{group.totalSqft.toFixed(2)} sq.ft ({group.totalPcs} Pcs/Nos)</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Date</span>
                    <span>{formatDate(group.purchaseDate)}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Total</span>
                    <span>{formatCurrency(group.totalCost)}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Paid</span>
                    <span style={{ color: '#16a34a' }}>{formatCurrency(ledger.total_paid || 0)}</span>
                  </div>
                  <div className="purchase-mobile-card-row">
                    <span>Due</span>
                    <span style={{ color: due > 0 ? '#dc2626' : undefined }}>{formatCurrency(due)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        </>
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
          <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '680px' }}>
            <div className="custom-modal-header">
              <h2 className="custom-modal-title">
                📦 Purchase Order #{selectedPurchase.orderNo}
              </h2>
              <button type="button" className="custom-modal-close" onClick={() => setIsDetailModalOpen(false)}>&times;</button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Supplier Company</span>
                    <h4 style={{ margin: '2px 0 0', color: '#0f172a' }}>{selectedPurchase.supplierCompName}</h4>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Customer & Address</span>
                    <h4 style={{ margin: '2px 0 0', color: '#2563eb' }}>{selectedPurchase.customerCompName}</h4>
                    <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>📍 {selectedPurchase.customerAddress}</p>
                  </div>
                </div>
              </div>

              {/* Itemized Table */}
              <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                <table className="data-table" style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th>#</th>
                      <th>Product</th>
                      <th>Variant</th>
                      <th style={{ textAlign: 'center' }}>Pcs</th>
                      <th style={{ textAlign: 'center' }}>Sq.Ft</th>
                      <th style={{ textAlign: 'right' }}>Cost Price</th>
                      <th style={{ textAlign: 'right' }}>Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPurchase.rawEntries.map((item, idx) => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 'bold', color: '#64748b' }}>{idx + 1}</td>
                        <td><strong>{item.product?.product_code || item.product?.name}</strong></td>
                        <td>{item.variant?.variant_name || 'Default'}</td>
                        <td style={{ textAlign: 'center' }}>{item.pcs}</td>
                        <td style={{ textAlign: 'center' }}>{item.billed_sqft} sqft</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.cost_price)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(item.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', backgroundColor: 'rgba(37,99,235,0.06)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.2)' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#475569' }}>Total Billed Sq.Ft:</span>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                    {selectedPurchase.totalSqft.toFixed(2)} sq.ft
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#475569' }}>Total Pcs / Nos:</span>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                    {selectedPurchase.totalPcs} Pcs
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: '#475569' }}>Total Invoice Value:</span>
                  <div style={{ fontSize: '18px', fontWeight: '800', color: '#2563eb' }}>
                    {formatCurrency(selectedPurchase.totalCost)}
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
                💳 Record Supplier Payment ({paymentSupplier.company_name || paymentSupplier.name})
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
