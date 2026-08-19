import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import { useCustomers, useProducts, masterDataKeys } from '../hooks/useMasterData';
import SearchableSelect from './SearchableSelect';
import CustomerModal from './CustomerModal';

/**
 * Builder for a price list / rate card.
 *
 * Deliberately *not* a quotation: a rate card quotes prices per unit and
 * nothing else. A salesman needs to hand a client "this is what our products
 * cost per sq.ft" without first inventing window sizes, which is what the
 * real Quotation form requires, and such a sheet never becomes an order.
 *
 * Opens blank for a new sheet, or loads `recordId` to correct a saved one.
 * Printing is a separate route (PriceListPrintPage) rather than a nested
 * modal, so "Save & Print" saves first and then navigates there — the print
 * sheet has to render outside the dashboard layout to come out clean.
 */

const DEFAULT_TERMS = `1. Price is inclusive/exclusive of VAT & Tax as discussed.
2. Fittings, Fixing, and Installation charges are included in Dhaka city.
3. Delivery Time: 3 to 7 working days from the date of confirmation.
4. Payment Terms: 50% advance along with work order, balance 50% upon delivery/installation.
5. Rate validity: 15 days from the date of issue.`;

const DEFAULT_SUBJECT = 'Price List & Rate Quotation for Window Blinds';
const DEFAULT_VALIDITY = '15 Days';

const UOM_OPTIONS = [
  '1 Sq.Ft',
  '1 Pcs',
  '1 Set',
  '1 Rft',
  '1 Box',
  '1 Meter',
  '1 Pair',
  'Per Window',
];

const today = () => new Date().toISOString().substring(0, 10);

const newRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const makeEmptyRow = () => ({
  id: newRowId(),
  productId: '',
  productName: '',
  description: '',
  colorCode: '',
  uom: '1 Sq.Ft',
  rate: '',
  remarks: '',
});

/**
 * A product's minimum billing area lives on its supplier links, not on the
 * product row itself — the same blind can carry a different MOQ per
 * supplier. The rate card quotes the primary supplier, so read the link
 * with the best (lowest) priority_rank, matching how order approval picks
 * a supplier.
 */
const primaryMinBillingSqft = (product) => {
  const links = product?.supplierLinks;
  if (!Array.isArray(links) || links.length === 0) return null;

  let primary = links[0];
  for (let i = 1; i < links.length; i += 1) {
    if ((links[i].priority_rank ?? 999) < (primary.priority_rank ?? 999)) primary = links[i];
  }

  const moq = parseFloat(primary?.min_billing_sqft);
  return moq > 0 ? moq : null;
};

/**
 * One rate line.
 *
 * Split out and memoised because the builder holds an arbitrary number of
 * these: without it, a keystroke in the last row's remarks box re-renders
 * every other row and every product picker along with it. All the callbacks
 * it receives are stable, so a row only re-renders when its own data moves.
 */
const PriceListRow = React.memo(function PriceListRow({
  row,
  index,
  productOptions,
  canRemove,
  onFieldChange,
  onProductSelect,
  onRemove,
}) {
  const handleProduct = useCallback(
    (productId) => onProductSelect(row.id, productId),
    [onProductSelect, row.id]
  );

  const handleField = useCallback(
    (field) => (e) => onFieldChange(row.id, field, e.target.value),
    [onFieldChange, row.id]
  );

  return (
    <div className="pricelist-row">
      <div className="pricelist-item-grid">
        <div className="pricelist-row-index">#{index + 1}</div>

        <div className="pricelist-cell-product">
          <label className="pricelist-field-label">Product</label>
          <SearchableSelect
            dark
            options={productOptions}
            value={row.productId}
            onChange={handleProduct}
            placeholder="Search product by name or code..."
            emptyLabel="No products found"
            inputClassName="pricelist-input"
            ariaLabel="Select product"
          />
        </div>

        <div className="pricelist-cell-name">
          <label className="pricelist-field-label">Name / Heading</label>
          <input
            type="text"
            className="custom-form-input pricelist-input"
            placeholder="Product Name / Heading"
            value={row.productName}
            onChange={handleField('productName')}
          />
        </div>

        <div className="pricelist-cell-color">
          <label className="pricelist-field-label">Color / Code</label>
          <input
            type="text"
            className="custom-form-input pricelist-input"
            placeholder="Color / Code"
            value={row.colorCode}
            onChange={handleField('colorCode')}
          />
        </div>

        <div className="pricelist-cell-uom">
          <label className="pricelist-field-label">UOM</label>
          <select
            className="custom-form-input pricelist-input"
            value={row.uom}
            onChange={handleField('uom')}
          >
            {UOM_OPTIONS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        <div className="pricelist-cell-rate">
          <label className="pricelist-field-label">Rate (Tk)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="custom-form-input pricelist-input is-rate"
            placeholder="0.00"
            value={row.rate}
            onChange={handleField('rate')}
          />
        </div>

        <div className="pricelist-cell-actions">
          <button
            type="button"
            className="pricelist-delete-btn"
            onClick={() => onRemove(row.id)}
            disabled={!canRemove}
            title={canRemove ? 'Remove this item' : 'A price list needs at least one item'}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="pricelist-sub-grid">
        <div>
          <label className="pricelist-field-label">Specifications</label>
          <textarea
            rows="2"
            className="custom-form-input pricelist-input"
            placeholder="Product specifications / details / features (auto-filled on product select)..."
            value={row.description}
            onChange={handleField('description')}
          />
        </div>
        <div>
          <label className="pricelist-field-label">Remarks</label>
          <input
            type="text"
            className="custom-form-input pricelist-input"
            placeholder="Remarks / MOQ / Warranty..."
            value={row.remarks}
            onChange={handleField('remarks')}
          />
        </div>
      </div>
    </div>
  );
});

const PriceListModal = ({ isOpen, onClose, recordId = null, onSaved }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Master data comes from the shared React Query cache rather than a local
  // fetch, so opening this modal repeatedly costs nothing after the first
  // load and a customer added here shows up everywhere else immediately.
  const { data: customers, isLoading: customersLoading } = useCustomers({
    all: true,
    enabled: isOpen,
  });
  const { data: products, isLoading: productsLoading } = useProducts({
    enabled: isOpen,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [date, setDate] = useState(today);
  const [refNo, setRefNo] = useState('');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [validity, setValidity] = useState(DEFAULT_VALIDITY);
  const [terms, setTerms] = useState(DEFAULT_TERMS);
  const [items, setItems] = useState(() => [makeEmptyRow()]);

  /**
   * A saved sheet keeps the customer details as they were on the day it was
   * sent. When one is reopened without a linked customer record (a walk-in
   * enquiry), that snapshot is all there is, so it is held here and used
   * until the user actively picks someone from the list.
   */
  const [customerSnapshot, setCustomerSnapshot] = useState(null);

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);

  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!recordId;
  const loadingData = customersLoading || productsLoading || loadingRecord;

  /**
   * Search haystacks are built once per master-list change, not per
   * keystroke — this is what keeps typing in the pickers cheap no matter
   * how many customers or products exist.
   */
  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: String(c.id),
        label: c.company_name || c.name,
        sublabel: [c.company_name ? c.name : null, c.phone, c.customer_code]
          .filter(Boolean)
          .join(' · '),
        search: `${c.name || ''} ${c.company_name || ''} ${c.phone || ''} ${
          c.customer_code || ''
        }`.toLowerCase(),
      })),
    [customers]
  );

  const productOptions = useMemo(
    () =>
      products.map((p) => ({
        value: String(p.id),
        label: p.name,
        sublabel: [
          p.product_code ? `Code: ${p.product_code}` : null,
          p.unit ? `Unit: ${p.unit}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        search: `${p.name || ''} ${p.product_code || ''}`.toLowerCase(),
      })),
    [products]
  );

  // Row lookups happen on every product pick; a map keeps that O(1) instead
  // of scanning the whole product list each time.
  const productsById = useMemo(() => {
    const map = new Map();
    for (const p of products) map.set(String(p.id), p);
    return map;
  }, [products]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId]
  );

  // A live customer record always wins over the stored snapshot: re-saving
  // an old sheet should pick up a corrected phone number.
  const effectiveCustomer = useMemo(() => {
    if (selectedCustomer) {
      return {
        name: selectedCustomer.name || '',
        company: selectedCustomer.company_name || '',
        phone: selectedCustomer.phone || '',
        address: selectedCustomer.address || '',
      };
    }
    return customerSnapshot;
  }, [selectedCustomer, customerSnapshot]);

  const resetForm = useCallback(() => {
    setSelectedCustomerId('');
    setCustomerSnapshot(null);
    setDate(today());
    setRefNo('');
    setSubject(DEFAULT_SUBJECT);
    setValidity(DEFAULT_VALIDITY);
    setTerms(DEFAULT_TERMS);
    setItems([makeEmptyRow()]);
  }, []);

  /**
   * Nothing is carried between openings: a reopened modal still holding the
   * previous client's rates would be a real hazard.
   */
  useEffect(() => {
    if (!isOpen) return undefined;

    setError('');

    if (!recordId) {
      resetForm();
      return undefined;
    }

    let cancelled = false;
    setLoadingRecord(true);

    api
      .get(`/price-lists/${recordId}`)
      .then((res) => {
        if (cancelled) return;
        const record = res.data?.data;
        if (!record) return;

        setSelectedCustomerId(record.customer_id ? String(record.customer_id) : '');
        setCustomerSnapshot({
          name: record.customer_name || '',
          company: record.customer_company || '',
          phone: record.customer_phone || '',
          address: record.customer_address || '',
        });
        setDate((record.issue_date || '').substring(0, 10) || today());
        setRefNo(record.reference_no || '');
        setSubject(record.subject || '');
        setValidity(record.validity || '');
        setTerms(record.terms || '');
        setItems(
          (record.items || []).map((item) => ({
            id: newRowId(),
            productId: item.product_id ? String(item.product_id) : '',
            productName: item.product_name || '',
            description: item.description || '',
            colorCode: item.color_code || '',
            uom: item.uom || '1 Sq.Ft',
            rate: item.rate ?? '',
            remarks: item.remarks || '',
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.response?.data?.message || 'Could not load this price list.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, recordId, resetForm]);

  const handleCustomerChange = useCallback((customerId) => {
    setSelectedCustomerId(customerId);
    // Picking (or clearing) a customer is authoritative — a stale snapshot
    // must not survive underneath the new choice.
    setCustomerSnapshot(null);
  }, []);

  const handleCustomerCreated = useCallback(
    (newCustomer) => {
      if (newCustomer) {
        // Seed the shared cache so the new customer is selectable at once,
        // exactly as the Quotations and Orders pages do.
        queryClient.setQueryData(masterDataKeys.customers(true), (prev) => [
          newCustomer,
          ...(prev ?? []),
        ]);
        queryClient.setQueryData(masterDataKeys.customers(false), (prev) => [
          newCustomer,
          ...(prev ?? []),
        ]);
        setSelectedCustomerId(String(newCustomer.id));
        setCustomerSnapshot(null);
      }
      setIsCustomerModalOpen(false);
    },
    [queryClient]
  );

  // Every row callback below is stable (functional setState, no changing
  // deps) so PriceListRow's memoisation actually holds.
  const handleProductSelect = useCallback(
    (rowId, productId) => {
      const product = productsById.get(String(productId));

      setItems((prev) =>
        prev.map((row) => {
          if (row.id !== rowId) return row;

          if (!product) {
            return {
              ...row,
              productId: '',
              productName: '',
              description: '',
              colorCode: '',
              rate: '',
            };
          }

          const isPcs = (product.unit || '').trim().toLowerCase() === 'pcs';
          const moq = primaryMinBillingSqft(product);

          return {
            ...row,
            productId: String(product.id),
            productName: product.name || '',
            description: product.details || '',
            colorCode: product.product_code || '',
            uom: isPcs ? '1 Pcs' : '1 Sq.Ft',
            rate: parseFloat(product.default_unit_price) || '',
            remarks: moq ? `Min billing ${moq} Sft` : '',
          };
        })
      );
    },
    [productsById]
  );

  const handleFieldChange = useCallback((rowId, field, value) => {
    setItems((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  }, []);

  const addRow = useCallback(() => setItems((prev) => [...prev, makeEmptyRow()]), []);

  const removeRow = useCallback(
    (rowId) => setItems((prev) => prev.filter((row) => row.id !== rowId)),
    []
  );

  /**
   * A line counts as real once it has a name. The backend requires the same
   * thing, so an empty spare row at the bottom is simply dropped rather than
   * rejecting the whole sheet.
   */
  const filledItems = useMemo(
    () => items.filter((item) => item.productName.trim() !== ''),
    [items]
  );

  /**
   * `thenPrint` sends the user straight to the standalone print route
   * afterwards. Printing needs a saved record: the sheet is rendered on
   * its own route, outside the dashboard layout, because the global print
   * CSS cannot hide the dashboard chrome from inside a modal.
   */
  const handleSave = async ({ thenPrint = false } = {}) => {
    if (filledItems.length === 0) {
      setError('Add at least one item with a product name before saving.');
      return;
    }

    setSaving(true);
    setError('');

    const payload = {
      customer_id: selectedCustomerId || null,
      customer_name: effectiveCustomer?.name || null,
      customer_company: effectiveCustomer?.company || null,
      customer_phone: effectiveCustomer?.phone || null,
      customer_address: effectiveCustomer?.address || null,
      issue_date: date,
      subject: subject || null,
      validity: validity || null,
      terms: terms || null,
      items: filledItems.map((item) => ({
        product_id: item.productId || null,
        product_name: item.productName.trim(),
        description: item.description || null,
        color_code: item.colorCode || null,
        uom: item.uom || '1 Sq.Ft',
        rate: parseFloat(item.rate) || 0,
        remarks: item.remarks || null,
      })),
    };

    try {
      const res = isEditing
        ? await api.put(`/price-lists/${recordId}`, payload)
        : await api.post('/price-lists', payload);

      const saved = res.data?.data;
      onSaved?.(saved, res.data?.message);
      onClose();

      const printableId = saved?.id ?? recordId;
      if (thenPrint && printableId) navigate(`/price-lists/print/${printableId}`);
    } catch (err) {
      const validation = err.response?.data?.errors;
      setError(
        validation
          ? Object.values(validation).flat().join('\n')
          : err.response?.data?.message || 'Could not save this price list.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const canRemove = items.length > 1;

  return (
    <>
      <div className="custom-modal-overlay">
        <div
          className="custom-modal-container large-modal animate-fade-in"
          style={{ maxWidth: '1120px' }}
        >
          <div className="custom-modal-header">
            <div>
              <h2 className="custom-modal-title">
                📑 {isEditing ? `Edit Price List ${refNo}` : 'New Price List / Rate Card'}
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                {loadingData
                  ? '⏳ Loading...'
                  : 'Quote rates per unit — no sizes, no totals, never becomes an order'}
              </p>
            </div>
            <button type="button" className="custom-modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="custom-modal-form">
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  whiteSpace: 'pre-line',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* ── Client & document meta ─────────────────────────────── */}
            <div className="pricelist-section">
              <div className="pricelist-section-head">
                <h4 className="pricelist-section-title">👤 Client &amp; Quotation Information</h4>
                <button
                  type="button"
                  className="pricelist-ghost-btn"
                  onClick={() => setIsCustomerModalOpen(true)}
                >
                  ➕ Add New Customer
                </button>
              </div>

              <div className="custom-form-grid">
                <div className="custom-form-group">
                  <label className="custom-form-label">
                    Select Customer{customers.length > 0 ? ` (${customers.length})` : ''}
                  </label>
                  <SearchableSelect
                    dark
                    options={customerOptions}
                    value={selectedCustomerId}
                    onChange={handleCustomerChange}
                    placeholder="Search by name, company, phone or code..."
                    emptyLabel="No customers found"
                    ariaLabel="Select customer"
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">Quotation Date</label>
                  <input
                    type="date"
                    className="custom-form-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">Subject / Title</label>
                  <input
                    type="text"
                    className="custom-form-input"
                    placeholder="Subject line"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>

                <div className="custom-form-group">
                  <label className="custom-form-label">Rate Validity</label>
                  <input
                    type="text"
                    className="custom-form-input"
                    placeholder="e.g. 15 Days / 30 Days"
                    value={validity}
                    onChange={(e) => setValidity(e.target.value)}
                  />
                </div>
              </div>

              {effectiveCustomer && (
                <div className="pricelist-customer-chips">
                  {effectiveCustomer.name && (
                    <div>
                      <strong>Customer:</strong> {effectiveCustomer.name}
                    </div>
                  )}
                  {effectiveCustomer.company && (
                    <div>
                      <strong>Company:</strong> {effectiveCustomer.company}
                    </div>
                  )}
                  {effectiveCustomer.phone && (
                    <div>
                      <strong>Phone:</strong> {effectiveCustomer.phone}
                    </div>
                  )}
                  {effectiveCustomer.address && (
                    <div>
                      <strong>Address:</strong> {effectiveCustomer.address}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Rate lines ─────────────────────────────────────────── */}
            <div className="pricelist-section">
              <div className="pricelist-section-head">
                <h4 className="pricelist-section-title">
                  📦 Products &amp; Rate Items
                  {products.length > 0 && (
                    <span className="pricelist-section-count">
                      {products.length} products available
                    </span>
                  )}
                </h4>
                <button type="button" className="pricelist-ghost-btn" onClick={addRow}>
                  ➕ Add Item
                </button>
              </div>

              {/* Named once here on desktop; each field repeats its own label
                  below 1024px, where the row stacks. */}
              <div className="pricelist-col-head" aria-hidden="true">
                <span>#</span>
                <span>Product</span>
                <span>Name / Heading</span>
                <span>Color / Code</span>
                <span>UOM</span>
                <span className="align-right">Rate (Tk)</span>
                <span />
              </div>

              <div className="pricelist-items">
                {items.map((row, idx) => (
                  <PriceListRow
                    key={row.id}
                    row={row}
                    index={idx}
                    productOptions={productOptions}
                    canRemove={canRemove}
                    onFieldChange={handleFieldChange}
                    onProductSelect={handleProductSelect}
                    onRemove={removeRow}
                  />
                ))}
              </div>
            </div>

            {/* ── Terms ──────────────────────────────────────────────── */}
            <div className="pricelist-section">
              <div className="pricelist-section-head">
                <h4 className="pricelist-section-title">📌 Terms &amp; Conditions / Remarks</h4>
              </div>
              <textarea
                rows="4"
                className="custom-form-input"
                style={{ lineHeight: 1.5 }}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>

          <div className="custom-modal-footer" style={{ justifyContent: 'space-between' }}>
            <div className="pricelist-footer-meta">
              <span>
                Items: <strong>{filledItems.length}</strong>
              </span>
              {refNo && (
                <span>
                  Ref: <strong>{refNo}</strong>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-modal-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="pricelist-ghost-btn"
                style={{ padding: '10px 18px', fontSize: '13px' }}
                onClick={() => handleSave({ thenPrint: true })}
                disabled={saving || loadingRecord}
              >
                🖨️ Save &amp; Print
              </button>
              <button
                type="button"
                className="btn-modal-submit"
                onClick={() => handleSave()}
                disabled={saving || loadingRecord}
              >
                {saving ? 'Saving…' : isEditing ? '💾 Update Price List' : '💾 Save Price List'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {isCustomerModalOpen && (
        <CustomerModal
          isOpen={isCustomerModalOpen}
          onClose={() => setIsCustomerModalOpen(false)}
          onCustomerCreated={handleCustomerCreated}
        />
      )}
    </>
  );
};

export default PriceListModal;
