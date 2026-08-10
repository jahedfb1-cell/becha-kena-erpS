import React from 'react';
import { isContactPickerSupported, pickContact } from '../utils/contactPicker';
import { normalizeBdPhone } from '../utils/format';

/**
 * A phone-number <input> with an optional "📱 import from contacts" button
 * next to it. The button only renders when the browser's Contact Picker
 * API is available (Android Chrome/Edge over HTTPS) — on unsupported
 * browsers it silently falls back to a plain input.
 *
 * onPick(contact) is called with { name, phone } when a contact is chosen.
 * Typically used to fill the phone value, and optionally a name field too.
 */
const PhoneContactField = ({
  value,
  onChange,
  onPick,
  disabled = false,
  required = false,
  placeholder = '',
  className = 'custom-form-input',
  inputStyle,
}) => {
  const supported = isContactPickerSupported();

  const handlePick = async () => {
    const contact = await pickContact();
    if (contact && onPick) {
      onPick(contact);
    }
  };

  // Normalize to standard "01XXXXXXXXX" Bangladeshi mobile format once the
  // user leaves the field, however they typed it in ("+880 1715-100033",
  // "0 1715-100033", etc.) - doesn't interfere with typing itself.
  const handleBlur = (e) => {
    const raw = e.target.value;
    const normalized = normalizeBdPhone(raw);
    if (normalized !== raw && onChange) {
      onChange({ target: { value: normalized } });
    }
  };

  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
      <input
        type="tel"
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={handleBlur}
        disabled={disabled}
        required={required}
        style={{ flex: 1, ...inputStyle }}
      />
      {supported && !disabled && (
        <button
          type="button"
          onClick={handlePick}
          title="Import from phone contacts"
          aria-label="Import from phone contacts"
          style={{
            flexShrink: 0,
            width: '38px',
            border: '1px solid var(--border, #e2e8f0)',
            borderRadius: '6px',
            background: 'var(--bg-base, #f1f5f9)',
            cursor: 'pointer',
            fontSize: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          📱
        </button>
      )}
    </div>
  );
};

export default PhoneContactField;
