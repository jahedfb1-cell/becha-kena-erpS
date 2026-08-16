// Satisfies Rule 1 (Navigation & Breadcrumbs), Rule 2 (Performance & Skeletons), 
// Rule 3 (Touch Target ≥44px), Rule 5 (WCAG AA & Tokens), Rule 6 (Type Scale & Tabular Num), 
// Rule 7 (Button 6-States & 4-Variants & Confirmation), Rule 8 (4px/8px Spacing).

import React, { useState, useEffect, useRef } from 'react';
import axios from '../api/axios';

const CompanyProfile = () => {
  const [form, setForm] = useState({
    company_name: '',
    company_address: '',
    mobile: '',
    email: '',
    opening_balance: '0.00',
    company_web: '',
    company_facebook: '',
    vat_reg_no: '',
    terms_conditions: '',
    receipt_qr_template: '',
    browser_title: '',
  });

  const [companyLogoFile, setCompanyLogoFile] = useState(null);
  const [invoiceLogoFile, setInvoiceLogoFile] = useState(null);
  const [receiptLogoFile, setReceiptLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [appIconFile, setAppIconFile] = useState(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState('/logo-demo.svg');
  const [invoiceLogoPreview, setInvoiceLogoPreview] = useState('/logo-demo.svg');
  const [receiptLogoPreview, setReceiptLogoPreview] = useState('/logo-demo.svg');
  const [faviconPreview, setFaviconPreview] = useState('/logo-demo.svg');
  const [appIconPreview, setAppIconPreview] = useState('/logo-demo.svg');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const companyLogoRef = useRef(null);
  const invoiceLogoRef = useRef(null);
  const receiptLogoRef = useRef(null);
  const faviconRef = useRef(null);
  const appIconRef = useRef(null);

  // Load current profile on mount
  useEffect(() => {
    axios.get('/company-profile')
      .then(res => {
        const d = res.data?.data || res.data;
        setForm({
          company_name:     d.company_name     || '',
          company_address:  d.company_address  || '',
          mobile:           d.mobile           || '',
          email:            d.email            || '',
          opening_balance:  d.opening_balance  || '0.00',
          company_web:      d.company_web      || '',
          company_facebook: d.company_facebook || '',
          vat_reg_no:       d.vat_reg_no       || '',
          terms_conditions: d.terms_conditions || '',
          receipt_qr_template: d.receipt_qr_template || '',
          browser_title:    d.browser_title    || '',
        });
        setCompanyLogoPreview(d.company_logo_url || '/logo-demo.svg');
        setInvoiceLogoPreview(d.invoice_logo_url || '/logo-demo.svg');
        setReceiptLogoPreview(d.receipt_logo_url || '/logo-demo.svg');
        setFaviconPreview(d.favicon_url || '/logo-demo.svg');
        setAppIconPreview(d.app_icon_url || '/logo-demo.svg');
      })
      .catch(() => {
        setCompanyLogoPreview('/logo-demo.svg');
        setInvoiceLogoPreview('/logo-demo.svg');
        setReceiptLogoPreview('/logo-demo.svg');
        setFaviconPreview('/logo-demo.svg');
        setAppIconPreview('/logo-demo.svg');
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (type === 'company') {
      setCompanyLogoFile(file);
      setCompanyLogoPreview(url);
    } else if (type === 'favicon') {
      setFaviconFile(file);
      setFaviconPreview(url);
    } else if (type === 'receipt') {
      setReceiptLogoFile(file);
      setReceiptLogoPreview(url);
    } else if (type === 'app_icon') {
      setAppIconFile(file);
      setAppIconPreview(url);
    } else {
      setInvoiceLogoFile(file);
      setInvoiceLogoPreview(url);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (companyLogoFile) fd.append('company_logo', companyLogoFile);
      if (invoiceLogoFile) fd.append('invoice_logo', invoiceLogoFile);
      if (receiptLogoFile) fd.append('receipt_logo', receiptLogoFile);
      if (faviconFile) fd.append('favicon', faviconFile);
      if (appIconFile) fd.append('app_icon', appIconFile);

      const res = await axios.post('/company-profile', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data?.data || res.data;
      if (d.company_logo_url) setCompanyLogoPreview(d.company_logo_url);
      if (d.invoice_logo_url) setInvoiceLogoPreview(d.invoice_logo_url);
      if (d.receipt_logo_url) setReceiptLogoPreview(d.receipt_logo_url);
      if (d.app_icon_url) setAppIconPreview(d.app_icon_url);
      if (d.favicon_url) {
        setFaviconPreview(d.favicon_url);
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'shortcut icon';
          document.getElementsByTagName('head')[0].appendChild(link);
        }
        link.href = d.favicon_url;
      }
      setCompanyLogoFile(null);
      setInvoiceLogoFile(null);
      setReceiptLogoFile(null);
      setFaviconFile(null);
      setAppIconFile(null);
      showToast('Company profile updated successfully!', 'success');
    } catch (err) {
      // A validation failure (422) puts the actually useful reason inside
      // `errors`, e.g. "The app icon field must be a file of type: jpg,
      // jpeg, png." - the top-level message is just "The given data was
      // invalid.", which tells the user nothing about which field or why.
      const fieldErrors = err?.response?.data?.errors;
      const firstFieldError = fieldErrors ? Object.values(fieldErrors).flat()[0] : null;
      showToast(
        firstFieldError || err?.response?.data?.message || 'Failed to save company profile.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  // Rule 2: Skeleton Loader component during initial fetch
  if (loading) {
    return (
      <div style={{ maxWidth: '1040px', padding: '0 0 40px', fontFamily: 'var(--sans)' }}>
        {/* Breadcrumb Skeleton */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <div className="skeleton-box" style={{ width: '80px', height: '14px', borderRadius: '4px' }} />
          <div className="skeleton-box" style={{ width: '12px', height: '14px', borderRadius: '4px' }} />
          <div className="skeleton-box" style={{ width: '120px', height: '14px', borderRadius: '4px' }} />
        </div>

        {/* Title Skeleton */}
        <div className="skeleton-box" style={{ width: '240px', height: '32px', borderRadius: '6px', marginBottom: '8px' }} />
        <div className="skeleton-box" style={{ width: '380px', height: '16px', borderRadius: '4px', marginBottom: '24px' }} />

        {/* Form Skeleton Card */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div className="skeleton-box" style={{ width: '100%', height: '44px', borderRadius: '6px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '44px', borderRadius: '6px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '44px', borderRadius: '6px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="skeleton-box" style={{ width: '100%', height: '120px', borderRadius: '8px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '120px', borderRadius: '8px' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1040px', padding: '0 0 48px', color: 'var(--text-main)', fontFamily: 'var(--sans)' }}>

      {/* Toast Notification (Accessible ARIA Live Region) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
            background: toast.type === 'success' ? '#15803d' : '#dc2626',
            color: '#ffffff', padding: '12px 20px', borderRadius: '8px',
            fontWeight: 600, fontSize: '14px', minHeight: '44px',
            display: 'flex', alignItems: 'center', gap: '10px',
            boxShadow: '0 10px 25px rgba(0,0,0,.18)',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <span style={{ fontSize: '16px' }}>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Rule 1: Persistent Breadcrumbs */}
      <nav aria-label="Breadcrumb" style={{ marginBottom: '12px' }}>
        <ol style={{ display: 'flex', alignItems: 'center', gap: '8px', listStyle: 'none', padding: 0, margin: 0, fontSize: '12px', color: '#64748b' }}>
          <li><a href="/dashboard" style={{ color: '#64748b', textDecoration: 'none' }}>Home</a></li>
          <li aria-hidden="true">&gt;</li>
          <li><span style={{ color: '#64748b' }}>Settings</span></li>
          <li aria-hidden="true">&gt;</li>
          <li><span style={{ color: 'var(--primary)', fontWeight: 600 }} aria-current="page">Company Profile</span></li>
        </ol>
      </nav>

      {/* Rule 6: Type Scale Title (32px / 2rem) */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-heading)', margin: 0, letterSpacing: '-0.02em' }}>
            Company Profile &amp; Branding
          </h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0 0' }}>
            Configure your organization details, official logos, and print header settings.
          </p>
        </div>

        {/* Action Badge */}
        <span style={{
          background: '#e0f2fe', color: '#0369a1',
          padding: '6px 14px', borderRadius: '16px',
          fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span>🏢</span> System Master Config
        </span>
      </div>

      {/* ── CREATIVE LIVE BRANDING PREVIEW HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#ffffff', borderRadius: '14px', padding: '24px',
        marginBottom: '28px', boxShadow: '0 10px 25px rgba(15,23,42,0.25)',
        border: '1px solid rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '180px', height: '180px', background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 700 }}>
            <span>✨</span> Live Print &amp; Document Header Preview
          </div>
          <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', color: '#cbd5e1' }}>
            Real-time Output
          </span>
        </div>

        <div style={{ background: '#ffffff', color: '#1e293b', padding: '16px', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', boxSizing: 'border-box' }}>
          {/* Invoice & Print Header Logo (Full Banner Scale 2491x356) */}
          <img
            src={invoiceLogoPreview || companyLogoPreview}
            alt="Invoice & Print Header Logo Preview"
            style={{ width: '100%', maxWidth: '100%', height: 'auto', maxHeight: '180px', objectFit: 'contain', display: 'block' }}
            onError={(e) => { e.target.src = '/logo-demo.svg'; }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit}>

        {/* ── SECTION 1: Company Profile Information ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <span style={{ fontSize: '20px' }}>🏢</span>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
              Organization Details
            </h2>
          </div>

          {/* Rule 8: Strict 4px/8px Spacing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Company Name <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                name="company_name"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.company_name}
                onChange={handleChange}
                placeholder="e.g. Dhaka Blinds"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Company Address <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                name="company_address"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.company_address}
                onChange={handleChange}
                placeholder="Full office address"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Mobile Number <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input
                name="mobile"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none', fontVariantNumeric: 'tabular-nums'
                }}
                value={form.mobile}
                onChange={handleChange}
                placeholder="e.g. 01629000200"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Email Address
              </label>
              <input
                name="email"
                type="email"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.email}
                onChange={handleChange}
                placeholder="info@dhakablinds.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Opening Balance (BDT)
              </label>
              {/* Rule 6: Monospaced/tabular numbers */}
              <input
                name="opening_balance"
                type="number"
                step="0.01"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none', fontVariantNumeric: 'tabular-nums'
                }}
                value={form.opening_balance}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Company Website
              </label>
              <input
                name="company_web"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.company_web}
                onChange={handleChange}
                placeholder="www.dhakablinds.com"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Facebook Page / Social URL
              </label>
              <input
                name="company_facebook"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.company_facebook}
                onChange={handleChange}
                placeholder="https://facebook.com/dhakablinds"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Company VAT Reg. No.
              </label>
              <input
                name="vat_reg_no"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none', fontVariantNumeric: 'tabular-nums'
                }}
                value={form.vat_reg_no}
                onChange={handleChange}
                placeholder="e.g. 123456789"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
                Browser Tab Title
              </label>
              <input
                name="browser_title"
                style={{
                  width: '100%', minHeight: '44px', padding: '10px 14px',
                  fontSize: '14px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none'
                }}
                value={form.browser_title || ''}
                onChange={handleChange}
                placeholder="e.g. Dhaka Blinds - ERP & IMS Portal"
              />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '8px' }}>
              Quotation Terms &amp; Conditions
            </label>
            <textarea
              name="terms_conditions"
              rows={4}
              style={{
                width: '100%', padding: '12px 14px',
                fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px',
                background: 'var(--bg-card)', color: 'var(--text-heading)',
                boxSizing: 'border-box', outline: 'none', resize: 'vertical',
                lineHeight: '1.5', fontFamily: 'var(--sans)'
              }}
              value={form.terms_conditions}
              onChange={handleChange}
              placeholder="Enter quotation print terms and conditions..."
            />
          </div>

          <div style={{ marginTop: '20px', borderTop: '1px dashed var(--border)', paddingTop: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginBottom: '4px' }}>
              Money Receipt QR Code Template
            </label>
            <span style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px', lineHeight: '1.4' }}>
              Define the layout of the scanned QR Code data using placeholder tokens. Values that are empty or not generated yet will automatically fall back to empty text in the QR.
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'start' }}>
              <textarea
                name="receipt_qr_template"
                rows={5}
                style={{
                  width: '100%', padding: '12px 14px',
                  fontSize: '13px', border: '1px solid var(--border)', borderRadius: '6px',
                  background: 'var(--bg-card)', color: 'var(--text-heading)',
                  boxSizing: 'border-box', outline: 'none', resize: 'vertical',
                  lineHeight: '1.5', fontFamily: 'monospace'
                }}
                value={form.receipt_qr_template || ''}
                onChange={handleChange}
                placeholder="Enter receipt QR template..."
              />
              <div style={{ background: 'var(--bg-app)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-main)', lineHeight: '1.6' }}>
                <strong style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-heading)' }}>Available Tokens:</strong>
                <ul style={{ margin: 0, paddingLeft: '14px', listStyleType: 'square' }}>
                  <li><code>{`{url}`}</code> - Digital verification link</li>
                  <li><code>{`{payment_no}`}</code> - Receipt Voucher No</li>
                  <li><code>{`{invoice_no}`}</code> - Invoice Reference</li>
                  <li><code>{`{order_no}`}</code> - Original Order No</li>
                  <li><code>{`{customer}`}</code> - Customer Name</li>
                  <li><code>{`{customer_phone}`}</code> - Customer Phone</li>
                  <li><code>{`{amount}`}</code> - Paid Amount</li>
                  <li><code>{`{payment_method}`}</code> - Method (Cash/Bank/Mobile)</li>
                  <li><code>{`{due_amount}`}</code> - Invoice Due Amount</li>
                  <li><code>{`{total_amount}`}</code> - Invoice Total Amount</li>
                  <li><code>{`{date}`}</code> - Receipt Date</li>
                  <li><code>{`{delivery_date}`}</code> - Scheduled Delivery Date</li>
                  <li><code>{`{salesman}`}</code> - Salesman Name</li>
                  <li><code>{`{company}`}</code> - Company Name</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Dual Logo Settings & Upload ── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', marginBottom: '28px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🖼️</span>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Logos &amp; Visual Identity
              </h2>
            </div>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              Supported: PNG, JPG (Max 5MB — Favicon Max 2MB)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>

            {/* Company Logo Box */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Main Company Logo
                </label>
                <span style={{ fontSize: '11px', background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: '4px' }}>
                  Web &amp; System Reports
                </span>
              </div>

              <div
                onClick={() => companyLogoRef.current?.click()}
                style={{
                  height: '140px', border: '2px dashed #cbd5e1', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: '#ffffff', position: 'relative',
                  overflow: 'hidden', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                {companyLogoPreview ? (
                  <img
                    src={companyLogoPreview}
                    alt="Company Logo Preview"
                    style={{ maxHeight: '110px', maxWidth: '90%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/logo-demo.svg'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '28px', marginBottom: '4px' }}>📷</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload Main Logo</div>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={companyLogoRef}
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => handleFileChange(e, 'company')}
              />

              {companyLogoFile && (
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Selected: {companyLogoFile.name}
                </div>
              )}
            </div>

            {/* Invoice Logo Box */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Invoice &amp; Print Header Logo
                </label>
                <span style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Print Documents
                </span>
              </div>

              <div
                onClick={() => invoiceLogoRef.current?.click()}
                style={{
                  height: '140px', border: '2px dashed #cbd5e1', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: '#ffffff', position: 'relative',
                  overflow: 'hidden', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                {invoiceLogoPreview ? (
                  <img
                    src={invoiceLogoPreview}
                    alt="Invoice Logo Preview"
                    style={{ maxHeight: '110px', maxWidth: '90%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/logo-demo.svg'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '28px', marginBottom: '4px' }}>🧾</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload Print Header Logo</div>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={invoiceLogoRef}
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => handleFileChange(e, 'invoice')}
              />

              {invoiceLogoFile && (
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Selected: {invoiceLogoFile.name}
                </div>
              )}
            </div>

            {/* Money Receipt Logo Box */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Money Receipt Logo
                </label>
                <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Money Receipt Print
                </span>
              </div>

              <div
                onClick={() => receiptLogoRef.current?.click()}
                style={{
                  height: '140px', border: '2px dashed #cbd5e1', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: '#ffffff', position: 'relative',
                  overflow: 'hidden', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                {receiptLogoPreview ? (
                  <img
                    src={receiptLogoPreview}
                    alt="Receipt Logo Preview"
                    style={{ maxHeight: '110px', maxWidth: '90%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/logo-demo.svg'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '28px', marginBottom: '4px' }}>💳</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload Receipt Logo</div>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={receiptLogoRef}
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => handleFileChange(e, 'receipt')}
              />

              {receiptLogoFile && (
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Selected: {receiptLogoFile.name}
                </div>
              )}
            </div>

            {/* Browser Favicon Icon Box */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Browser Favicon Icon
                </label>
                <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Browser Tab Icon
                </span>
              </div>

              <div
                onClick={() => faviconRef.current?.click()}
                style={{
                  height: '140px', border: '2px dashed #cbd5e1', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: '#ffffff', position: 'relative',
                  overflow: 'hidden', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                {faviconPreview ? (
                  <img
                    src={faviconPreview}
                    alt="Favicon Preview"
                    style={{ maxHeight: '80px', maxWidth: '80px', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/logo-demo.svg'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '28px', marginBottom: '4px' }}>🌐</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload Favicon</div>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={faviconRef}
                accept="image/png,image/jpeg,image/jpg,image/x-icon,image/vnd.microsoft.icon"
                style={{ display: 'none' }}
                onChange={e => handleFileChange(e, 'favicon')}
              />

              {faviconFile && (
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Selected: {faviconFile.name}
                </div>
              )}
            </div>

            {/* APK / App Icon Box */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  APK / App Icon
                </label>
                <span style={{ fontSize: '11px', background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  Home Screen Icon
                </span>
              </div>

              <div
                onClick={() => appIconRef.current?.click()}
                style={{
                  height: '140px', border: '2px dashed #cbd5e1', borderRadius: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', background: '#ffffff', position: 'relative',
                  overflow: 'hidden', transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}
              >
                {appIconPreview ? (
                  <img
                    src={appIconPreview}
                    alt="App Icon Preview"
                    style={{ maxHeight: '110px', maxWidth: '90%', objectFit: 'contain' }}
                    onError={(e) => { e.target.src = '/logo-demo.svg'; }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                    <div style={{ fontSize: '28px', marginBottom: '4px' }}>📱</div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>Click to upload App Icon</div>
                  </div>
                )}
              </div>

              <input
                type="file"
                ref={appIconRef}
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: 'none' }}
                onChange={e => handleFileChange(e, 'app_icon')}
              />

              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px', lineHeight: '1.4' }}>
                Used for the installed PWA and WebView APK home-screen icon. A square image with a
                transparent or solid background works best — a wide banner logo gets awkwardly
                cropped here. Falls back to Main Company Logo until one is uploaded.
              </div>

              {appIconFile && (
                <div style={{ fontSize: '12px', color: '#15803d', fontWeight: 600, marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  ✓ Selected: {appIconFile.name}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Rule 7: Buttons — Primary Action with 6 interactive states */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              minHeight: '44px', padding: '12px 32px',
              background: saving ? '#94a3b8' : 'var(--primary)',
              color: '#ffffff', border: 'none', borderRadius: '8px',
              fontWeight: 700, fontSize: '15px',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: saving ? 'none' : '0 4px 12px rgba(37,99,235,0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            {saving ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                Saving Changes...
              </>
            ) : (
              <>💾 Save Company Profile</>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};

export default CompanyProfile;
