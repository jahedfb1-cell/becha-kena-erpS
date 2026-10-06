import React, { useEffect, useState } from 'react';
import api from '../api/axios';

/**
 * Picks a registered bank account or mobile wallet (Settings → Bank /
 * Mobile accounts). Money is always tied to a real account so each account's
 * balance can be worked out; a typed bank name could not be.
 *
 * The lists are fetched once per page load and shared by every picker.
 *
 * Props:
 *   kind      'bank' | 'mobile'
 *   value     selected account id ('' when none)
 *   onChange  (id: string, account: object|undefined) => void
 */
const cache = {};
const load = (kind) => {
  if (!cache[kind]) {
    cache[kind] = api
      .get(kind === 'bank' ? '/settings/bank-accounts' : '/settings/mobile-accounts')
      .then((res) => res.data?.data || [])
      .catch(() => {
        delete cache[kind]; // let the next picker try again
        return [];
      });
  }
  return cache[kind];
};

/** Call after adding or removing an account so pickers show the new list. */
export const refreshAccountPickers = () => {
  delete cache.bank;
  delete cache.mobile;
};

const AccountPicker = ({ kind, value, onChange, disabled = false, required = true, className = 'custom-form-input', style }) => {
  const [accounts, setAccounts] = useState(null);

  useEffect(() => {
    let alive = true;
    load(kind).then((list) => alive && setAccounts(list));
    return () => { alive = false; };
  }, [kind]);

  // Exactly one account: pick it, nothing to choose.
  useEffect(() => {
    if (accounts && accounts.length === 1 && !value) {
      onChange(String(accounts[0].id), accounts[0]);
    }
  }, [accounts, value, onChange]);

  if (accounts === null) {
    return <select className={className} style={style} disabled><option>Loading accounts…</option></select>;
  }

  if (accounts.length === 0) {
    return (
      <div className="account-picker-empty">
        No {kind === 'bank' ? 'bank account' : 'mobile account'} is registered yet. An admin can add one in
        {' '}<strong>Settings → {kind === 'bank' ? 'Bank Accounts' : 'Mobile Accounts'}</strong>.
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value, accounts.find((a) => String(a.id) === e.target.value))}
      disabled={disabled}
      required={required}
      className={className}
      style={style}
    >
      <option value="" disabled>{kind === 'bank' ? 'Select bank account…' : 'Select mobile account…'}</option>
      {accounts.map((a) => (
        <option key={a.id} value={String(a.id)}>
          {kind === 'bank'
            ? `${a.bank_name} — ${a.account_number}${a.branch ? ` (${a.branch})` : ''}`
            : `${a.provider} — ${a.account_number}`}
        </option>
      ))}
    </select>
  );
};

export default AccountPicker;
