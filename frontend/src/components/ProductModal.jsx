import React, { useState, useEffect, useRef } from 'react';
import api from '../api/axios';

/* ─── tiny inline styles object ─── */
const S = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10,10,30,0.65)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1060, padding: '8px',
  },
  modal: {
    background: '#ffffff',
    borderRadius: '3px',
    boxShadow: '0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.1)',
    width: '100%', maxWidth: '780px',
    maxHeight: '92vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    animation: 'pmSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)',
  },
  header: {
    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
    padding: '22px 24px 18px',
    position: 'relative',
    flexShrink: 0,
  },
  headerBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    background: 'rgba(255,255,255,0.18)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '20px', padding: '3px 12px',
    fontSize: '11px', fontWeight: 700, color: '#fff',
    letterSpacing: '0.5px', textTransform: 'uppercase',
    marginBottom: '8px',
  },
  headerTitle: {
    margin: 0, fontSize: '20px', fontWeight: 800,
    color: '#fff', lineHeight: 1.3,
    textShadow: '0 1px 4px rgba(0,0,0,0.15)',
  },
  headerSub: {
    margin: '4px 0 0', fontSize: '13px',
    color: 'rgba(255,255,255,0.75)',
  },
  closeBtn: {
    position: 'absolute', top: '16px', right: '16px',
    width: '34px', height: '34px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff', fontSize: '18px', fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s ease', lineHeight: 1,
  },
  tabBar: {
    display: 'flex', gap: 0,
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    padding: '0 20px',
    flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '24px',
    background: '#f8fafc',
  },
  section: {
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid #e8ecf0',
    padding: '6px',
    marginBottom: '16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  sectionTitle: {
    fontSize: '12px', fontWeight: 800, letterSpacing: '0.8px',
    textTransform: 'uppercase', color: '#6366f1',
    marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px',
  },
  grid2: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: '14px',
  },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 700,
    color: '#374151', marginBottom: '2px', letterSpacing: '0.3px',
  },
  input: {
    width: '100%', padding: '10px 14px',
    fontSize: '13.5px', fontWeight: 500,
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px', background: '#fff',
    color: '#111827', boxSizing: 'border-box',
    outline: 'none', transition: 'all 0.2s ease',
    appearance: 'none', WebkitAppearance: 'none',
  },
  inputDisabled: {
    background: '#f1f5f9', color: '#475569',
    borderColor: '#e2e8f0', cursor: 'default',
  },
  textarea: {
    width: '100%', padding: '10px 14px',
    fontSize: '13.5px', fontWeight: 500,
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px', background: '#fff',
    color: '#111827', boxSizing: 'border-box',
    outline: 'none', transition: 'all 0.2s ease',
    resize: 'vertical', fontFamily: 'inherit',
    minHeight: '80px',
  },
  supplierRow: {
    display: 'grid',
    gridTemplateColumns: '2.2fr 0.7fr 1.1fr 1.1fr auto',
    gap: '10px', alignItems: 'end',
    background: '#f8fafc',
    border: '1.5px solid #e2e8f0',
    borderRadius: '12px', padding: '14px',
    transition: 'all 0.2s ease',
  },
  priorityBadge: {
    width: '28px', height: '28px', borderRadius: '50%',
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    color: '#fff', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: '12px', fontWeight: 800,
    flexShrink: 0,
  },
  footer: {
    padding: '16px 24px',
    background: '#fff',
    borderTop: '1px solid #e8ecf0',
    display: 'flex', justifyContent: 'flex-end', gap: '10px',
    flexShrink: 0,
  },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    color: '#fff', border: 'none',
    padding: '11px 28px', borderRadius: '10px',
    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
  },
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    background: '#f1f5f9', color: '#475569',
    border: '1.5px solid #e2e8f0',
    padding: '11px 22px', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  errorBox: {
    background: '#fef2f2', border: '1px solid #fecaca',
    borderRadius: '10px', padding: '12px 16px',
    color: '#dc2626', fontSize: '13px', fontWeight: 500,
    marginBottom: '16px', whiteSpace: 'pre-line',
    display: 'flex', alignItems: 'flex-start', gap: '8px',
  },
};

/* ─── Skeleton loader ─── */
const SkeletonLine = ({ w = '100%', h = '38px', r = '10px' }) => (
  <div style={{
    width: w, height: h, borderRadius: r,
    background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
    backgroundSize: '200% 100%',
    animation: 'pmSkeleton 1.4s ease-in-out infinite',
  }} />
);

let cachedCategories = null;
let cachedSuppliers = null;
let cachedUnits = null;

const ProductModal = ({ isOpen, onClose, onProductSaved, initialData = null, isViewOnly = false }) => {
  const [productCode, setProductCode] = useState('');
  const [name, setName]               = useState('');
  const [unit, setUnit]               = useState('Square feet');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [defaultUnitPrice, setDefaultUnitPrice]   = useState('');
  const [productSize, setProductSize]             = useState('');
  const [details, setDetails]         = useState('');

  const [categories, setCategories]       = useState(cachedCategories || []);
  const [suppliers, setSuppliers]         = useState(cachedSuppliers || []);
  const [unitsList, setUnitsList]         = useState(cachedUnits || []);
  const [supplierLinks, setSupplierLinks] = useState([]);

  const [loadingData, setLoadingData] = useState(!cachedCategories || !cachedSuppliers || !cachedUnits);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const firstRef = useRef(null);

  /* ─── fetch data on open ─── */
  useEffect(() => {
    if (!isOpen) return;
    setError('');

    const populateFormData = (cats, sups, uList) => {
      setCategories(cats);
      setSuppliers(sups);
      setUnitsList(uList);
      if (initialData) {
        setProductCode(initialData.product_code || '');
        setName(initialData.name || '');
        setUnit(initialData.unit || 'Square feet');
        setProductCategoryId(initialData.product_category_id || '');
        setDefaultUnitPrice(initialData.default_unit_price || '');
        setProductSize(initialData.product_size || '');
        setDetails(initialData.details || '');
        const existingLinks = initialData.supplierLinks || initialData.supplier_links || [];
        setSupplierLinks(
          existingLinks.map(l => ({
            id: l.id,
            supplier_id: l.supplier_id,
            priority_rank: l.priority_rank || 1,
            cost_price: l.cost_price ?? '',
            min_billing_sqft: l.min_billing_sqft ?? '',
          }))
        );
      } else {
        setProductCode(''); setName(''); setUnit('Square feet');
        setProductCategoryId(''); setDefaultUnitPrice(''); setProductSize(''); setDetails('');
        setSupplierLinks(sups.length > 0
          ? [{ supplier_id: sups[0].id, priority_rank: 1, cost_price: '', min_billing_sqft: '' }]
          : []);
      }
    };

    if (cachedCategories && cachedSuppliers && cachedUnits) {
      populateFormData(cachedCategories, cachedSuppliers, cachedUnits);
      setLoadingData(false);
      setTimeout(() => firstRef.current?.focus(), 50);
      return;
    }

    setLoadingData(true);
    const fetchData = async () => {
      try {
        const [catRes, supRes, unitRes] = await Promise.all([
          api.get('/master/product-categories'),
          api.get('/suppliers'),
          api.get('/settings/units').catch(() => ({ data: { data: [] } })),
        ]);
        const cats = catRes.data.data || [];
        const sups = supRes.data.data || [];
        const uList = unitRes.data.data || [];
        cachedCategories = cats;
        cachedSuppliers = sups;
        cachedUnits = uList;
        populateFormData(cats, sups, uList);
      } catch (err) {
        setError('Failed to load form data. Please try again.');
      } finally {
        setLoadingData(false);
        setTimeout(() => firstRef.current?.focus(), 100);
      }
    };
    fetchData();
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  /* ─── helpers ─── */
  const handleAddSupplierLink = () => {
    const defaultSupplierId = suppliers.length > 0 ? suppliers[0].id : '';
    setSupplierLinks([...supplierLinks, {
      supplier_id: defaultSupplierId,
      priority_rank: supplierLinks.length + 1,
      cost_price: '', min_billing_sqft: '',
    }]);
  };

  const handleRemoveSupplierLink = idx => {
    setSupplierLinks(
      supplierLinks.filter((_, i) => i !== idx)
        .map((item, i) => ({ ...item, priority_rank: i + 1 }))
    );
  };

  const handleLinkChange = (idx, field, val) => {
    const updated = [...supplierLinks];
    updated[idx][field] = val;
    setSupplierLinks(updated);
  };

  const handleClose = () => {
    setProductCode(''); setName(''); setUnit('Square feet');
    setProductCategoryId(''); setDefaultUnitPrice(''); setProductSize(''); setDetails('');
    setSupplierLinks([]); setError('');
    onClose();
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (isViewOnly) return;
    setError('');

    if (!productCode.trim()) return setError('Color Code / Product Code is required.');
    if (!name.trim()) return setError('Product Name is required.');
    if (!defaultUnitPrice || parseFloat(defaultUnitPrice) < 0)
      return setError('Valid Sales Price is required.');

    setLoading(true);
    try {
      const payload = {
        product_code: productCode.trim(),
        name: name.trim(), unit,
        product_category_id: productCategoryId ? parseInt(productCategoryId) : null,
        default_unit_price: parseFloat(defaultUnitPrice),
        product_size: productSize !== '' ? parseFloat(productSize) : null,
        details: details.trim(),
        supplier_links: supplierLinks
          .filter(l => l.supplier_id)
          .map((l, i) => ({
            supplier_id: parseInt(l.supplier_id),
            priority_rank: parseInt(l.priority_rank) || i + 1,
            cost_price: parseFloat(l.cost_price) || 0,
            min_billing_sqft: (l.min_billing_sqft !== '' && !isNaN(parseFloat(l.min_billing_sqft)))
              ? parseFloat(l.min_billing_sqft) : 10,
          })),
      };
      const res = initialData?.id
        ? await api.put(`/products/${initialData.id}`, payload)
        : await api.post('/products', payload);

      onProductSaved?.(res.data.data);
      handleClose();
    } catch (err) {
      const errs = err.response?.data?.errors;
      setError(errs ? Object.values(errs).flat().join('\n') : (err.response?.data?.message || 'Failed to save product.'));
    } finally {
      setLoading(false);
    }
  };

  /* ─── input focus style helper ─── */
  const inputStyle = (id, extra = {}) => ({
    ...S.input,
    ...(isViewOnly || loading ? S.inputDisabled : {}),
    ...(focusedField === id ? {
      borderColor: '#6366f1',
      boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
    } : {}),
    ...extra,
  });

  const textareaStyle = (id) => ({
    ...S.textarea,
    ...(isViewOnly || loading ? { ...S.inputDisabled, cursor: 'default' } : {}),
    ...(focusedField === id ? {
      borderColor: '#6366f1',
      boxShadow: '0 0 0 3px rgba(99,102,241,0.15)',
    } : {}),
  });

  const isEdit = !!initialData;

  /* ─── render ─── */
  return (
    <>
      {/* Keyframes injected once */}
      <style>{`
        @keyframes pmSlideUp {
          from { opacity:0; transform:translateY(30px) scale(0.97); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes pmSkeleton {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pmRowIn {
          from { opacity:0; transform:translateX(-12px); }
          to   { opacity:1; transform:translateX(0); }
        }
        .pm-close-btn:hover { background:rgba(255,255,255,0.35) !important; transform:rotate(90deg); }
        .pm-supplier-row:hover { border-color:#6366f1 !important; background:#faf8ff !important; }
        .pm-add-btn:hover { background:#ede9fe !important; border-color:#8b5cf6 !important; color:#6d28d9 !important; }
        .pm-remove-btn:hover { background:#fef2f2 !important; border-color:#fca5a5 !important; }
        .pm-btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,0.5) !important; }
        .pm-btn-secondary:hover:not(:disabled) { background:#e2e8f0 !important; }
        .pm-input:focus { border-color:#6366f1 !important; box-shadow:0 0 0 3px rgba(99,102,241,0.15) !important; }
        @media (max-width:640px) {
          .pm-grid2 { grid-template-columns:1fr !important; }
          .pm-supplier-row { grid-template-columns:1fr 1fr !important; }
          .pm-supplier-row > *:nth-child(1) { grid-column:1/-1; }
          .pm-modal { max-height:98vh !important; border-radius:16px !important; }
        }
      `}</style>

      <div style={S.overlay} onClick={e => e.target === e.currentTarget && handleClose()}>
        <div style={S.modal} className="pm-modal" role="dialog" aria-modal="true">

          {/* ── Header ── */}
          <div style={S.header}>
            <div style={S.headerBadge}>
              {isViewOnly ? '👁 View Mode' : isEdit ? '✏️ Edit' : '✨ New Product'}
            </div>
            <h2 style={S.headerTitle}>
              {isViewOnly
                ? `${initialData?.name || 'Product Details'}`
                : isEdit ? 'Edit Product Information'
                : 'Add New Product'}
            </h2>
            {initialData?.product_code && (
              <p style={S.headerSub}>Code: <strong>{initialData.product_code}</strong></p>
            )}
            <button
              type="button"
              className="pm-close-btn"
              style={S.closeBtn}
              onClick={handleClose}
              title="Close"
            >×</button>
          </div>

          {/* ── Body ── */}
          <div style={S.body}>

            {/* Error Banner */}
            {error && (
              <div style={S.errorBox}>
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Section 1: Basic Info */}
            <div style={S.section}>
              <div style={S.sectionTitle}>
                <span style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:'6px', width:'22px', height:'22px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px' }}>📦</span>
                Basic Information
              </div>

              {loadingData ? (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
                  {[1,2,3,4].map(i => (
                    <div key={i}>
                      <SkeletonLine w="60%" h="12px" r="4px" />
                      <div style={{ height:'6px' }} />
                      <SkeletonLine h="40px" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={S.grid2} className="pm-grid2">

                  {/* Color / Product Code */}
                  <div>
                    <label style={S.label}>
                      Color / Product Code
                      {!isViewOnly && <span style={{ color:'#ef4444' }}> *</span>}
                    </label>
                    <input
                      ref={firstRef}
                      className="pm-input"
                      type="text"
                      style={inputStyle('code')}
                      placeholder="e.g. WBR 343 or DBB 1116"
                      value={productCode}
                      onChange={e => setProductCode(e.target.value)}
                      onFocus={() => setFocusedField('code')}
                      onBlur={() => setFocusedField(null)}
                      disabled={loading || isViewOnly}
                    />
                  </div>

                  {/* Product Name */}
                  <div>
                    <label style={S.label}>
                      Product Name
                      {!isViewOnly && <span style={{ color:'#ef4444' }}> *</span>}
                    </label>
                    <input
                      className="pm-input"
                      type="text"
                      style={inputStyle('name')}
                      placeholder="Full product name"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onFocus={() => setFocusedField('name')}
                      onBlur={() => setFocusedField(null)}
                      disabled={loading || isViewOnly}
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label style={S.label}>Product Category</label>
                    <select
                      className="pm-input"
                      style={inputStyle('cat')}
                      value={productCategoryId}
                      onChange={e => setProductCategoryId(e.target.value)}
                      onFocus={() => setFocusedField('cat')}
                      onBlur={() => setFocusedField(null)}
                      disabled={loading || isViewOnly}
                    >
                      <option value="">— Select Category —</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Unit */}
                  <div>
                    <label style={S.label}>
                      Measurement Unit
                      {!isViewOnly && <span style={{ color:'#ef4444' }}> *</span>}
                    </label>
                    <select
                      className="pm-input"
                      style={inputStyle('unit')}
                      value={unit}
                      onChange={e => setUnit(e.target.value)}
                      onFocus={() => setFocusedField('unit')}
                      onBlur={() => setFocusedField(null)}
                      disabled={loading || isViewOnly}
                    >
                      {(() => {
                        // Quotations bill against exactly three measurement units, one
                        // per pricing formula: sq.ft (W x H / 144), PVC sq.ft (slat-based
                        // width first) and per-piece. Units coming from Settings are
                        // deliberately NOT merged in here — an extra unit would have no
                        // calculation behind it in the quotation builder.
                        const baseUnits = [
                          { name: 'Square Feet ( sq.ft )', value: 'Square feet' },
                          { name: 'PVC sq.ft', value: 'PVC sq.ft' },
                          { name: 'Pieces ( pcs )', value: 'Pcs' },
                        ];
                        // Keep a legacy product's saved unit selectable so opening an old
                        // record for edit does not silently re-assign its unit on save.
                        if (unit && !baseUnits.some(b => b.value.toLowerCase() === unit.toLowerCase())) {
                          baseUnits.push({ name: `${unit} (legacy)`, value: unit });
                        }
                        return baseUnits.map((u, idx) => (
                          <option key={u.value + idx} value={u.value}>
                            {u.name}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Pricing */}
            <div style={S.section}>
              <div style={S.sectionTitle}>
                <span style={{ background:'linear-gradient(135deg,#10b981,#059669)', borderRadius:'6px', width:'22px', height:'22px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px' }}>💰</span>
                Pricing & Description
              </div>

              {loadingData ? (
                <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                  <SkeletonLine h="40px" />
                  <SkeletonLine h="80px" />
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: unit === 'PVC sq.ft' ? '1fr 1fr' : '1fr', gap: '14px', marginBottom: '14px' }} className="pm-grid2">
                    {/* Sales Price */}
                    <div>
                      <label style={S.label}>
                        Sales Price (per {unit})
                        {!isViewOnly && <span style={{ color:'#ef4444' }}> *</span>}
                      </label>
                      <div style={{ position:'relative' }}>
                        <span style={{
                          position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)',
                          fontSize:'15px', fontWeight:700, color: isViewOnly ? '#94a3b8' : '#6366f1',
                          pointerEvents:'none',
                        }}>৳</span>
                        <input
                          className="pm-input"
                          type="number" step="0.01" min="0"
                          style={{ ...inputStyle('price'), paddingLeft:'30px' }}
                          placeholder="0.00"
                          value={defaultUnitPrice}
                          onChange={e => setDefaultUnitPrice(e.target.value)}
                          onFocus={() => setFocusedField('price')}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        />
                      </div>
                    </div>

                    {/* Slat Width — only meaningful for PVC strip curtains, whose
                        billed width is calculated from a slat count */}
                    {unit === 'PVC sq.ft' && (
                      <div>
                        <label style={S.label}>
                          Slat Size / Width (inches)
                          <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>
                            (e.g., 8)
                          </span>
                        </label>
                        <input
                          className="pm-input"
                          type="number" step="0.1" min="0"
                          style={inputStyle('size')}
                          placeholder="e.g. 8"
                          value={productSize}
                          onChange={e => setProductSize(e.target.value)}
                          onFocus={() => setFocusedField('size')}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        />
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div>
                    <label style={S.label}>
                      Product Details
                      <span style={{ fontWeight:400, color:'#9ca3af', fontSize:'11px', marginLeft:'6px' }}>
                        (shown on Quotation & Invoice)
                      </span>
                    </label>
                    <textarea
                      className="pm-input"
                      style={textareaStyle('details')}
                      rows={3}
                      placeholder="Specs, notes, or print description for quotation & invoice..."
                      value={details}
                      onChange={e => setDetails(e.target.value)}
                      onFocus={() => setFocusedField('details')}
                      onBlur={() => setFocusedField(null)}
                      disabled={loading || isViewOnly}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Section 3: Supplier Links */}
            <div style={S.section}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={S.sectionTitle}>
                  <span style={{ background:'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius:'6px', width:'22px', height:'22px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px' }}>🔗</span>
                  Supplier Links & Priority
                </div>
                {!isViewOnly && (
                  <button
                    type="button"
                    className="pm-add-btn"
                    onClick={handleAddSupplierLink}
                    disabled={loading || suppliers.length === 0}
                    style={{
                      display:'inline-flex', alignItems:'center', gap:'6px',
                      background:'#ede9fe', color:'#6d28d9',
                      border:'1.5px solid #c4b5fd',
                      padding:'6px 14px', borderRadius:'8px',
                      fontSize:'12px', fontWeight:700, cursor:'pointer',
                      transition:'all 0.2s', flexShrink:0,
                    }}
                  >
                    + Add Supplier
                  </button>
                )}
              </div>

              {loadingData ? (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  <SkeletonLine h="70px" />
                  <SkeletonLine h="70px" w="80%" />
                </div>
              ) : supplierLinks.length === 0 ? (
                <div style={{
                  textAlign:'center', padding:'24px',
                  background:'#f8fafc', borderRadius:'12px',
                  border:'2px dashed #e2e8f0',
                  color:'#94a3b8', fontSize:'13px',
                }}>
                  <div style={{ fontSize:'28px', marginBottom:'8px' }}>🏭</div>
                  No suppliers linked yet.
                  {!isViewOnly && <div style={{ fontSize:'12px', marginTop:'4px' }}>Click "+ Add Supplier" to link one.</div>}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                  {supplierLinks.map((link, idx) => (
                    <div
                      key={idx}
                      className="pm-supplier-row"
                      style={{
                        ...S.supplierRow,
                        gridTemplateColumns: isViewOnly ? '2.2fr 0.7fr 1.1fr 1.1fr' : '2.2fr 0.7fr 1.1fr 1.1fr auto',
                        animation: 'pmRowIn 0.2s ease',
                      }}
                    >
                      {/* Supplier select */}
                      <div>
                        <label style={{ ...S.label, fontSize:'11px', display:'flex', alignItems:'center', gap:'6px' }}>
                          <span style={S.priorityBadge}>{idx + 1}</span>
                          Supplier
                        </label>
                        <select
                          className="pm-input"
                          style={inputStyle(`sup-${idx}`)}
                          value={link.supplier_id}
                          onChange={e => handleLinkChange(idx, 'supplier_id', e.target.value)}
                          onFocus={() => setFocusedField(`sup-${idx}`)}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        >
                          {suppliers.map(s => {
                            let comp = s.company_name || '';
                            let human = s.name || '';
                            const isHumanComp = /blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(human);
                            const isCompPerson = /^[a-zA-Z\s]+$/.test(comp) && !/blinds|ltd|inc|corp|company|enterprise|trader|store|shop|supplier|factory|group|brosan|hardware|bd|solutions|decor|interior/i.test(comp);

                            if ((!comp && isHumanComp) || (isHumanComp && isCompPerson)) {
                              comp = human;
                            }
                            const compName = comp || human || 'Supplier';

                            return (
                              <option key={s.id} value={s.id}>
                                {compName}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* Priority */}
                      <div>
                        <label style={{ ...S.label, fontSize:'11px' }}>Priority</label>
                        <input
                          className="pm-input"
                          type="number" min="1"
                          style={inputStyle(`pri-${idx}`)}
                          placeholder="1"
                          value={link.priority_rank}
                          onChange={e => handleLinkChange(idx, 'priority_rank', e.target.value)}
                          onFocus={() => setFocusedField(`pri-${idx}`)}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        />
                      </div>

                      {/* Cost Price */}
                      <div>
                        <label style={{ ...S.label, fontSize:'11px' }}>Buy / Cost (৳)</label>
                        <input
                          className="pm-input"
                          type="number" step="0.01" min="0"
                          style={inputStyle(`cost-${idx}`)}
                          placeholder="0.00"
                          value={link.cost_price}
                          onChange={e => handleLinkChange(idx, 'cost_price', e.target.value)}
                          onFocus={() => setFocusedField(`cost-${idx}`)}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        />
                      </div>

                      {/* MOQ */}
                      <div>
                        <label style={{ ...S.label, fontSize:'11px' }}>MOQ (Sq.Ft)</label>
                        <input
                          className="pm-input"
                          type="number" step="0.01" min="0"
                          style={inputStyle(`moq-${idx}`)}
                          placeholder="10"
                          value={link.min_billing_sqft}
                          onChange={e => handleLinkChange(idx, 'min_billing_sqft', e.target.value)}
                          onFocus={() => setFocusedField(`moq-${idx}`)}
                          onBlur={() => setFocusedField(null)}
                          disabled={loading || isViewOnly}
                        />
                      </div>

                      {/* Remove */}
                      {!isViewOnly && (
                        <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:'0' }}>
                          <button
                            type="button"
                            className="pm-remove-btn"
                            onClick={() => handleRemoveSupplierLink(idx)}
                            style={{
                              width:'36px', height:'36px', borderRadius:'8px',
                              background:'#fef2f2', border:'1.5px solid #fecaca',
                              color:'#ef4444', fontSize:'16px',
                              cursor:'pointer', display:'flex',
                              alignItems:'center', justifyContent:'center',
                              transition:'all 0.2s', flexShrink:0,
                            }}
                            title="Remove supplier link"
                          >✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={S.footer}>
            {!isViewOnly && (
              <button
                type="button"
                className="pm-btn-primary"
                style={S.btnPrimary}
                disabled={loading || loadingData}
                onClick={handleSubmit}
              >
                {loading
                  ? <><span style={{ width:'16px', height:'16px', border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }} /> Saving…</>
                  : <><span>💾</span> {isEdit ? 'Save Changes' : 'Create Product'}</>
                }
              </button>
            )}
            <button
              type="button"
              className="pm-btn-secondary"
              style={S.btnSecondary}
              onClick={handleClose}
              disabled={loading}
            >
              {isViewOnly ? '✕ Close' : '✕ Cancel'}
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
};

export default ProductModal;
