import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { formatCurrency } from '../utils/format';
import AccountPicker from './AccountPicker';

const PaymentModal = ({ isOpen, onClose, invoice, onPaymentRecorded }) => {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().substring(0, 10));
  const [discountAmount, setDiscountAmount] = useState('');
  // Why the waive-off was given. Optional — left blank, the receipt simply
  // doesn't carry a reason line.
  const [discountNote, setDiscountNote] = useState('');

  // Bank details: the registered account the money went into
  // (Settings → Bank Accounts), so that account's balance stays right.
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');

  // Mobile details: the registered wallet (Settings → Mobile Accounts).
  const [mobileAccountId, setMobileAccountId] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && invoice) {
      // Leave amount blank — user must manually enter the received amount
      setAmount('');
      setDiscountAmount('');
      setDiscountNote('');
      setPaymentMethod('cash');
      setPaymentDate(new Date().toISOString().substring(0, 10));
      setBankAccountId('');
      setMobileAccountId('');
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
    setDiscountNote('');
  };

  const handleHalfPay = () => {
    setAmount((dueAmt / 2).toFixed(2));
    setDiscountAmount('');
    setDiscountNote('');
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
        // Only meaningful alongside a waive-off; sent trimmed so a stray
        // space never counts as a reason and prints an empty line.
        discount_note: discAmt > 0 ? discountNote.trim() : '',
        notes,
      };

      if (paymentMethod === 'bank') {
        if (!bankAccountId) {
          setError('Choose the bank account the money went into.');
          return;
        }
        payload.bank_account_id = Number(bankAccountId);
        payload.cheque_number = chequeNumber;
      } else if (paymentMethod === 'mobile') {
        if (!mobileAccountId) {
          setError('Choose the mobile account the money went into.');
          return;
        }
        payload.mobile_account_id = Number(mobileAccountId);
        payload.transaction_id = transactionId;
      }

      const response = await api.post('/payments', payload);
      const savedPayment = response.data.data;
      if (onPaymentRecorded) {
        onPaymentRecorded(savedPayment);
      }
      // Auto-open money receipt in new tab
      if (savedPayment?.id) {
        window.open(`/payments/${savedPayment.id}/receipt`, '_blank');
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
    setDiscountNote('');
    setBankAccountId('');
    setChequeNumber('');
    setMobileAccountId('');
    setTransactionId('');
    setNotes('');
    setError('');
    onClose();
  };

  return (
    <div className="custom-modal-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="custom-modal-container animate-fade-in" style={{ maxWidth: '640px' }}>
        {/* Header Banner */}
        <div className="custom-modal-header" style={{ background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)', borderBottom: '1px solid rgba(16, 185, 129, 0.3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#34d399', fontWeight: 800 }}>
              💳 Payment Receipt Voucher
            </div>
            <h2 className="custom-modal-title" style={{ marginTop: '4px' }}>
              Invoice #{invoice.invoice_number}
            </h2>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
              Customer: <strong>{invoice.customer?.company_name || invoice.customer?.name}</strong>
            </div>
          </div>
          
          <button type="button" className="custom-modal-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        {/* Financial Recalculation Overview Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr', 
          gap: '12px', 
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Total Due</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24' }}>{formatCurrency(dueAmt)}</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Paying Now</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399' }}>{formatCurrency(payingAmt + discAmt)}</div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>New Balance</div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: remainingBal === 0 ? '#34d399' : '#f8fafc' }}>
              {remainingBal === 0 ? '🎉 FULLY PAID' : formatCurrency(remainingBal)}
            </div>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="custom-modal-form">
          {error && (
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', whiteSpace: 'pre-line' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Quick Amount Fill Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>Payment Amount</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={handleHalfPay}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', fontSize: '12px', color: '#cbd5e1', cursor: 'pointer' }}
              >
                50% Advance
              </button>
              <button 
                type="button" 
                onClick={handleFullPay}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(52, 211, 153, 0.4)', background: 'rgba(16, 185, 129, 0.15)', fontSize: '12px', fontWeight: 700, color: '#34d399', cursor: 'pointer' }}
              >
                ⚡ Full Pay ({formatCurrency(dueAmt)})
              </button>
            </div>
          </div>

          <div className="custom-form-grid">
            <div className="custom-form-group">
              <label className="custom-form-label">Amount Received (৳) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                required
                className="custom-form-input"
                style={{ fontSize: '15px', fontWeight: 'bold', color: '#34d399' }}
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">Waive-off / Discount (৳)</label>
              <input
                type="number"
                step="0.01"
                placeholder="Optional discount"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                disabled={loading}
                className="custom-form-input"
                style={{ fontSize: '15px' }}
              />
            </div>
          </div>

          {/* Why the waive-off was given. Always on screen, directly under the
              amount it explains — it used to appear only once a discount had
              been typed, and a field nobody can see reads as a field that was
              never built. The conditionality lives in the hint line instead.
              Staying optional is deliberate: a reason that had to be filled in
              before the receipt could be saved would be answered "discount"
              within a week, which looks like a record but is not one. */}
          <div className="custom-form-group">
            <label className="custom-form-label">
              Reason for the waive-off
              <span style={{ marginLeft: '6px', fontWeight: 500, color: '#94a3b8' }}>(optional)</span>
            </label>
            <input
              type="text"
              maxLength={255}
              placeholder="e.g. Rounding adjustment, agreed settlement, delay compensation"
              value={discountNote}
              onChange={(e) => setDiscountNote(e.target.value)}
              disabled={loading}
              className="custom-form-input"
            />
            <span style={{ display: 'block', marginTop: '6px', fontSize: '11.5px', color: discAmt <= 0 && discountNote.trim() ? '#fbbf24' : '#94a3b8' }}>
              {discAmt <= 0
                ? (discountNote.trim()
                    ? '⚠️ No waive-off amount entered above, so this reason will not be saved.'
                    : 'Used only when you enter a waive-off amount above.')
                : (discountNote.trim()
                    ? `✅ Printed on the receipt under the ${formatCurrency(discAmt)} waive-off.`
                    : 'Leave blank and the receipt shows the waive-off amount without a reason.')}
            </span>
          </div>

          {/* Interactive Payment Method Selector Tiles */}
          <div>
            <label className="custom-form-label" style={{ display: 'block', marginBottom: '8px' }}>
              Payment Method *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Cash Tile */}
              <div 
                onClick={() => setPaymentMethod('cash')}
                style={{
                  border: `2px solid ${paymentMethod === 'cash' ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                  backgroundColor: paymentMethod === 'cash' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>💵</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'cash' ? '#34d399' : '#cbd5e1' }}>
                  Cash Pay
                </div>
              </div>

              {/* Bank Tile */}
              <div 
                onClick={() => setPaymentMethod('bank')}
                style={{
                  border: `2px solid ${paymentMethod === 'bank' ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                  backgroundColor: paymentMethod === 'bank' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>🏦</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'bank' ? '#60a5fa' : '#cbd5e1' }}>
                  Bank / Cheque
                </div>
              </div>

              {/* Mobile Tile */}
              <div 
                onClick={() => setPaymentMethod('mobile')}
                style={{
                  border: `2px solid ${paymentMethod === 'mobile' ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
                  backgroundColor: paymentMethod === 'mobile' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255,255,255,0.03)',
                  padding: '12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>📱</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: paymentMethod === 'mobile' ? '#c084fc' : '#cbd5e1' }}>
                  Mobile Banking
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Method Details */}
          {paymentMethod === 'bank' && (
            <div className="custom-form-grid" style={{ padding: '16px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <div className="custom-form-group">
                <label className="custom-form-label" style={{ color: '#60a5fa' }}>Bank Account *</label>
                <AccountPicker kind="bank" value={bankAccountId} onChange={setBankAccountId} disabled={loading} />
              </div>
              <div className="custom-form-group">
                <label className="custom-form-label" style={{ color: '#60a5fa' }}>Cheque / Ref Number *</label>
                <input
                  type="text"
                  placeholder="Cheque No."
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  disabled={loading}
                  required
                  className="custom-form-input"
                />
              </div>
            </div>
          )}

          {paymentMethod === 'mobile' && (
            <div className="custom-form-grid" style={{ padding: '16px', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '12px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
              <div className="custom-form-group">
                <label className="custom-form-label" style={{ color: '#c084fc' }}>Mobile Account *</label>
                <AccountPicker kind="mobile" value={mobileAccountId} onChange={setMobileAccountId} disabled={loading} />
              </div>
              <div className="custom-form-group">
                <label className="custom-form-label" style={{ color: '#c084fc' }}>Transaction ID (TxnID) *</label>
                <input
                  type="text"
                  placeholder="e.g. 9J58AXK2"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  disabled={loading}
                  required
                  className="custom-form-input"
                />
              </div>
            </div>
          )}

          {/* Payment Date & Remarks */}
          <div className="custom-form-grid">
            <div className="custom-form-group">
              <label className="custom-form-label">Payment Date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={loading}
                required
                className="custom-form-input"
              />
            </div>

            <div className="custom-form-group">
              <label className="custom-form-label">Remarks / Notes</label>
              <input
                type="text"
                placeholder="Optional payment notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                className="custom-form-input"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="custom-modal-footer">
            <button 
              type="button" 
              className="btn-modal-cancel" 
              onClick={handleClose} 
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-modal-submit"
              disabled={loading}
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
            >
              {loading ? 'Processing...' : '💳 Record Payment Voucher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentModal;
