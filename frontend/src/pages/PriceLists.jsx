import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { usePermission } from '../hooks/usePermission';
import { formatCurrency, formatDate } from '../utils/format';
import PriceListModal from '../components/PriceListModal';

/**
 * Saved rate cards.
 *
 * A price list quotes rates per unit and nothing else — no sizes, no totals,
 * and it never converts into an order. That is why it lives here rather than
 * as another status inside Quotations.
 *
 * The backend scopes the list by who created each sheet (a salesman sees
 * only their own), so this page shows whatever it is given without filtering
 * again.
 */

const PER_PAGE_OPTIONS = [15, 25, 50, 100];

const PriceLists = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const canCreate = can('price_lists:create');
  const canArchive = can('price_lists:archive');

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Filters. `search` is applied on submit rather than per keystroke — it is
  // a server round trip, not a client filter.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  // Builder modal: null = closed, { id: null } = new sheet, { id } = edit.
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/price-lists', {
        params: {
          page,
          per_page: perPage,
          search: search || undefined,
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          archived: showArchived ? 1 : undefined,
        },
      });
      setRows(res.data?.data || []);
      setMeta(res.data?.meta || { current_page: 1, last_page: 1, total: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load price lists.');
    } finally {
      setLoading(false);
    }
  }, [page, perPage, search, fromDate, toDate, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFromDate('');
    setToDate('');
    setShowArchived(false);
    setPage(1);
  };

  const handleSaved = (_record, message) => {
    setEditing(null);
    setNotice(message || 'Price list saved.');
    load();
  };


  const handleArchive = async (record) => {
    if (!window.confirm(`Archive price list ${record.reference_no}?`)) return;
    setError('');
    try {
      const res = await api.delete(`/price-lists/${record.id}`);
      setNotice(res.data?.message || 'Price list archived.');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not archive this price list.');
    }
  };

  const handleRestore = async (record) => {
    setError('');
    try {
      const res = await api.post(`/price-lists/${record.id}/restore`);
      setNotice(res.data?.message || 'Price list restored.');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not restore this price list.');
    }
  };

  /**
   * The span of rates a sheet quotes. Comes from withMin/withMax on the
   * index query, so no line items are loaded to render the list.
   */
  const rateRange = (record) => {
    const min = record.items_min_rate;
    const max = record.items_max_rate;
    if (min == null || max == null) return '—';
    return Number(min) === Number(max)
      ? formatCurrency(min)
      : `${formatCurrency(min)} – ${formatCurrency(max)}`;
  };

  const customerLabel = (record) =>
    record.customer_company || record.customer_name || record.customer?.name || '—';

  const rowActions = (record) => (
    <div className="pricelist-row-actions">
      {!record.is_archived && canCreate && (
        <button type="button" className="text-btn" onClick={() => setEditing({ id: record.id })}>
          ✏️ Edit
        </button>
      )}
      <button
        type="button"
        className="text-btn"
        style={{ color: 'var(--info)' }}
        onClick={() => navigate(`/price-lists/print/${record.id}`)}
      >
        🖨️ Print
      </button>
      {canArchive &&
        (record.is_archived ? (
          <button
            type="button"
            className="text-btn"
            style={{ color: 'var(--success)' }}
            onClick={() => handleRestore(record)}
          >
            ♻️ Restore
          </button>
        ) : (
          <button
            type="button"
            className="text-btn"
            style={{ color: 'var(--danger)' }}
            onClick={() => handleArchive(record)}
          >
            🗑️ Archive
          </button>
        ))}
    </div>
  );

  return (
    <div className="content-container animate-fade-in">
      <div className="page-header-row">
        <div>
          <h1>Price Lists</h1>
          <p>Saved rate cards — quote per-unit prices to a client without creating a quotation</p>
        </div>
        {canCreate && (
          <div className="page-header-actions">
            <button type="button" className="primary-btn" onClick={() => setEditing({ id: null })}>
              + New Price List
            </button>
          </div>
        )}
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="pricelist-filter-bar">
        <div className="pricelist-filter-field pricelist-filter-search">
          <label>Search</label>
          <input
            type="text"
            className="modern-form-control"
            placeholder="Ref no, customer, phone or subject"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
        </div>

        <div className="pricelist-filter-field">
          <label>From</label>
          <input
            type="date"
            className="modern-form-control"
            value={fromDate}
            onChange={(e) => {
              setPage(1);
              setFromDate(e.target.value);
            }}
          />
        </div>

        <div className="pricelist-filter-field">
          <label>To</label>
          <input
            type="date"
            className="modern-form-control"
            value={toDate}
            onChange={(e) => {
              setPage(1);
              setToDate(e.target.value);
            }}
          />
        </div>

        <div className="pricelist-filter-field pricelist-filter-actions">
          <button type="button" className="secondary-btn" onClick={applySearch}>
            🔍 Search
          </button>
          <button type="button" className="text-btn" onClick={clearFilters}>
            Clear
          </button>
        </div>

        <label className="pricelist-archive-toggle">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setPage(1);
              setShowArchived(e.target.checked);
            }}
          />
          Show archived
        </label>
      </div>

      {error && <div className="pricelist-alert is-error">⚠️ {error}</div>}
      {notice && <div className="pricelist-alert is-ok">✅ {notice}</div>}

      {/* ── Desktop table ───────────────────────────────────────────── */}
      <div className="card-table-wrapper pricelist-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ref No.</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Subject</th>
              <th style={{ textAlign: 'center' }}>Items</th>
              <th style={{ textAlign: 'right' }}>Rate range</th>
              <th>Created by</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '28px' }}>
                  Loading price lists…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '28px' }}>
                  {showArchived
                    ? 'No archived price lists.'
                    : 'No price lists saved yet. Use “+ New Price List” to build one.'}
                </td>
              </tr>
            ) : (
              rows.map((record) => (
                <tr key={record.id}>
                  <td style={{ fontWeight: 700 }}>{record.reference_no}</td>
                  <td>{formatDate(record.issue_date)}</td>
                  <td>{customerLabel(record)}</td>
                  <td style={{ maxWidth: '260px' }}>{record.subject || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{record.items_count ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{rateRange(record)}</td>
                  <td>{record.creator?.name || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{rowActions(record)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list ────────────────────────────────────────── */}
      <div className="pricelist-mobile-list">
        {loading ? (
          <div className="pricelist-card">Loading price lists…</div>
        ) : rows.length === 0 ? (
          <div className="pricelist-card">
            {showArchived ? 'No archived price lists.' : 'No price lists saved yet.'}
          </div>
        ) : (
          rows.map((record) => (
            <div key={record.id} className="pricelist-card">
              <div className="pricelist-card-top">
                <strong>{record.reference_no}</strong>
                <span>{formatDate(record.issue_date)}</span>
              </div>
              <div className="pricelist-card-customer">{customerLabel(record)}</div>
              {record.subject && <div className="pricelist-card-subject">{record.subject}</div>}
              <div className="pricelist-card-meta">
                <span>
                  {record.items_count ?? 0} item(s) · {rateRange(record)}
                </span>
                <span>{record.creator?.name || '—'}</span>
              </div>
              {rowActions(record)}
            </div>
          ))
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {meta.total > 0 && (
        <div className="pricelist-pagination">
          <div className="pricelist-pagination-info">
            <span>Show</span>
            <select
              value={perPage}
              onChange={(e) => {
                setPerPage(parseInt(e.target.value, 10));
                setPage(1);
              }}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              per page — page {meta.current_page} of {meta.last_page} ({meta.total} total)
            </span>
          </div>

          <div className="pricelist-pagination-controls">
            <button
              type="button"
              disabled={meta.current_page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={meta.current_page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {editing && (
        <PriceListModal
          isOpen
          recordId={editing.id}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default PriceLists;
