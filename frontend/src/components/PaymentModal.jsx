import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { formatCurrency } from '../utils/format';

const PaymentModal = ({ isOpen, onClose, invoice, onPaymentRecorded }) => {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().substring(0, 10));
  const [discountAmount, setDiscountAmount] = useState('');
  
  // Bank details
  const [bankName, setBankName] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  
  // Mobile details
  const [mobileProvider, setMobileProvider] = useState('bKash');
  const [transactionId, setTransactionId] = useState('');

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && invoice) {
      // Default amount to due amount
      setAmount(invoice.due_amount || '');
      setDiscountAmount('');
      setPaymentMethod('cash');
      setPaymentDate(new Date().toISOString().substring(0, 10));
    }
  }, [isOpen, invoice]);

  if (!isOpen || !invoice) return null;

  const dueAmt = parseFloat(invoice.due_amount) || 0;
  const payingAmt = parseFloat(amount) || 0;
  const discAmt = parseFloat(discountAmount) || 0;
  const remainingBal = Math.max(0, dueAmt - payingAmt - discAmt);

  // Quick fill handlers
  const handleFullPay = () => {
    setAmount(dueAmt.toFixed(2));
    setDiscountAmount('');
  };

  const handleHalfPay = () => {
    setAmount((dueAmt / 2).toFixed(2));
    setDiscountAmount('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (payingAmt <= 0 && discAmt <= 0) {
      setError('Please enter a valid payment or discount amount.');
      return;
    }

    if (payingAmt + discAmt > dueAmt + 0.01) {
      setError(`Total payment + discount (${formatCurrency(payingAmt + discAmt)}) exceeds invoice due (${formatCurrency(dueAmt)}).`);
      return;
    }

    setLoading(true);
    try {
      const payload = {
        invoice_id: invoice.id,
        amount: payingAmt,
        payment_method: paymentMethod,
        payment_date: paymentDate,
        discount_amount: discAmt,
        notes,
      };

      if (paymentMethod === 'bank') {
        payload.bank_name = bankName;
        payload.cheque_number = chequeNumber;
      } else if (paymentMethod === 'mobile') {
        payload.mobile_provider = mobileProvider;
        payload.transaction_id = transactionId;
      }

      const response = await api.post('/payments', payload);
      if (onPaymentRecorded) {
        onPaymentRecorded(response.data.data);
      }
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process payment receipt.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount('');
    setPaymentMethod('cash');
    setPaymentDate(new Date().toISOString().substring(0, 10));
    setDiscountAmount('');
    setBankName('');
    setChequeNumber('');
    setMobileProvider('bKash');
    setTransactionId('');
    setNotes('');
    setError('');
    onClose();
  };

  return (
    <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div 
        className="custom-modal-container animate-fade-in" 
        style={{ 
          maxWidth: '620px', 
          padding: 0, 
          borderRadius: '16px', 
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          backgroundColor: '#ffffff'
        }}
      >
        {/* Creative Gradient Header Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #059669 100%)',
          padding: '24px 28px',
          color: '#ffffff',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.9, fontWeight: 700 }}>
                💳 Payment Receipt Voucher
              </div>
              <h2 style={{ margin: '6px 0 0 0', fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>
                Invoice #{invoice.invoice_number}
              </h2>
              <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '2px' }}>
                Customer: <strong>{invoice.customer?.company_name || invoice.customer?.name}</strong>
              </div>
            </div>
            
            <button 
              type="button" 
              onClick={handleClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: '#fff',
                fontSize: '20px',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s'
              }}
            >
              &times;
            </button>
          </div>

          {/* Financial Recalculation Overview Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr 1fr', 
            gap: '12px', 
            marginTop: '20px',
            background: 'rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(8px)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <div>
              <div style={{ fontSize: '11px', opacity: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Total Due</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>{formatCurrency(dueAmt)}</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', opacity: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Paying Now</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }}>{formatCurrency(payingAmt + discAmt)}</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', opacity: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>New Balance</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: remainingBal === 0 ? '#6ee7b7' : '#ffffff' }}>
                {remainingBal === 0 ? '🎉 FULLY PAID' : formatCurrency(remainingBal)}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              marginBottom: '20px',
              fontSize: '13px',
              fontWeight: 600
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Quick Amount Fill Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Select Payment Amount</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={handleHalfPay}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#475569'
                }}
              >
                50% Advance
              </button>
              <button 
                type="button" 
                onClick={handleFullPay}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #86efac',
                  background: '#f0fdf4',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#166534'
                }}
              >
                ⚡ Full Pay ({formatCurrency(dueAmt)})
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Amount Received (৳) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                required
                className="modern-form-control"
                style={{ fontSize: '15px', fontWeight: 'bold', color: '#059669' }}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Waive-off / Discount (৳)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Optional discount"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                disabled={loading}
                className="modern-form-control"
                style={{ fontSize: '15px' }}
              />
            </div>
          </div>

          {/* Interactive Payment Method Selector Tiles */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '8px' }}>
              Payment Method *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Cash Tile */}
              <div 
                onClick={() => setPaymentMethod('cash')}
                style={{
                  border: `2px solid ${paymentMethod === 'cash' ? '#059669' : '#e2e8f0'}`,
                  backgroundColor: paymentMethod === 'cash' ? '#ecfdf5' : '#ffffff',
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>💵</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'cash' ? '#065f46' : '#475569' }}>
                  Cash Pay
                </div>
              </div>

              {/* Bank Tile */}
              <div 
                onClick={() => setPaymentMethod('bank')}
                style={{
                  border: `2px solid ${paymentMethod === 'bank' ? '#2563eb' : '#e2e8f0'}`,
                  backgroundColor: paymentMethod === 'bank' ? '#eff6ff' : '#ffffff',
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>🏦</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'bank' ? '#1e40af' : '#475569' }}>
                  Bank / Cheque
                </div>
              </div>

              {/* Mobile Tile */}
              <div 
                onClick={() => setPaymentMethod('mobile')}
                style={{
                  border: `2px solid ${paymentMethod === 'mobile' ? '#9333ea' : '#e2e8f0'}`,
                  backgroundColor: paymentMethod === 'mobile' ? '#faf5ff' : '#ffffff',
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>📱</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'mobile' ? '#6b21a8' : '#475569' }}>
                  Mobile Banking
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Method Details */}
          {paymentMethod === 'bank' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', padding: '16px', backgroundColor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af' }}>Bank Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Dutch-Bangla Bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  disabled={loading}
                  required
                  className="modern-form-control"
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af' }}>Cheque / Ref Number *</label>
                <input
                  type="text"
                  placeholder="Cheque No."
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  disabled={loading}
                  required
                  className="modern-form-control"
                />
              </div>
            </div>
          )}

          {paymentMethod === 'mobile' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px', padding: '16px', backgroundColor: '#faf5ff', borderRadius: '10px', border: '1px solid #e9d5ff' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b21a8' }}>Mobile Provider *</label>
                <select
                  value={mobileProvider}
                  onChange={(e) => setMobileProvider(e.target.value)}
                  disabled={loading}
                  required
                  className="modern-form-control"
                >
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Rocket">Rocket</option>
                  <option value="Upay">Upay</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#6b21a8' }}>Transaction ID (TxnID) *</label>
                <input
                  type="text"
                  placeholder="e.g. 9J58AXK2"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  disabled={loading}
                  required
                  className="modern-form-control"
                />
              </div>
            </div>
          )}

          {/* Payment Date & Remarks */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '16px', marginBottom: '24px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={loading}
                required
                className="modern-form-control"
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Remarks / Notes</label>
              <input
                type="text"
                placeholder="Optional payment notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                className="modern-form-control"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
            <button 
              type="button" 
              className="logout-btn" 
              onClick={handleClose} 
              disabled={loading}
              style={{ padding: '10px 20px' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {loading ? (
                <span>⏳ Processing...</span>
              ) : (
                <span>💳 Record Payment Voucher</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
