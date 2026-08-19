import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useDeferredValue,
  useId,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Type-to-search single-select combobox.
 *
 * Written to replace `<select>` where the option list is a master list
 * (customers, products) rather than a handful of fixed choices. A native
 * select has to put every option in the DOM up front, which on a repeating
 * form — the price list builder renders one product picker per line —
 * multiplies out to rows x products nodes before the user has typed
 * anything. This renders nothing but an input until it is opened, and even
 * then caps how many results reach the DOM.
 *
 * Options must arrive pre-shaped as:
 *   { value, label, sublabel?, search }
 * where `search` is an already-lowercased haystack. Building it in the
 * caller's useMemo keeps filtering to a plain substring test instead of
 * re-lowercasing the whole master list on every keystroke.
 */

const DEFAULT_MAX_RESULTS = 50;
const MENU_MAX_HEIGHT = 260;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 12;

const SearchableSelect = ({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyLabel = 'No matches found',
  maxResults = DEFAULT_MAX_RESULTS,
  disabled = false,
  dark = false,
  className = '',
  inputClassName = '',
  ariaLabel,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState(null);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const listRef = useRef(null);

  const listId = `${useId()}-listbox`;

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)) || null,
    [options, value]
  );

  // The input echoes keystrokes immediately while the filtered list is
  // allowed to lag a frame behind, so typing never feels stuck behind a
  // long list re-render.
  const deferredQuery = useDeferredValue(query);

  const { visible, matchCount } = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    if (!q) {
      return { visible: options.slice(0, maxResults), matchCount: options.length };
    }

    const matches = [];
    for (let i = 0; i < options.length; i += 1) {
      if (options[i].search.includes(q)) matches.push(options[i]);
    }
    return { visible: matches.slice(0, maxResults), matchCount: matches.length };
  }, [options, deferredQuery, maxResults]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setQuery('');
    setActiveIndex(0);
  }, [disabled]);

  const commit = useCallback(
    (option) => {
      onChange(option ? option.value : '');
      close();
      inputRef.current?.focus();
    },
    [onChange, close]
  );

  /**
   * The menu is portalled to <body> and positioned from the input's own
   * rect. It has to be: this control is used inside .custom-modal-container,
   * which sets `overflow: hidden` and sits in a scrolling modal body, so an
   * absolutely positioned popover would simply be clipped away.
   */
  const positionMenu = useCallback(() => {
    const anchor = rootRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const flipUp = spaceBelow < 160 && spaceAbove > spaceBelow;

    const next = {
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, Math.min(MENU_MAX_HEIGHT, flipUp ? spaceAbove : spaceBelow)),
      ...(flipUp
        ? { bottom: window.innerHeight - rect.top + MENU_GAP }
        : { top: rect.bottom + MENU_GAP }),
    };

    // This runs on every scroll event, including scrolls inside the menu's
    // own option list. Returning the previous object when nothing moved
    // keeps those from re-rendering the whole dropdown.
    setMenuStyle((prev) =>
      prev &&
      prev.left === next.left &&
      prev.width === next.width &&
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next
    );
  }, []);

  // Measure before paint so the menu never shows up in the wrong place for
  // a frame. Listeners exist only while open — a closed picker costs
  // nothing, which matters when a form holds a dozen of them.
  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return undefined;
    }

    positionMenu();
    // Capture phase: the modal body is the element that actually scrolls,
    // and scroll events from it do not bubble to window.
    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);

    return () => {
      window.removeEventListener('scroll', positionMenu, true);
      window.removeEventListener('resize', positionMenu);
    };
  }, [isOpen, positionMenu]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (e) => {
      const insideControl = rootRef.current?.contains(e.target);
      // The menu lives outside this component's DOM subtree, so it needs
      // its own containment check or clicking an option would close the
      // list before the click landed.
      const insideMenu = menuRef.current?.contains(e.target);
      if (!insideControl && !insideMenu) close();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, close]);

  // Keep the highlighted row inside the scroll viewport during arrow-key
  // navigation.
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    listRef.current.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        open();
        return;
      }
      if (visible.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((prev) => (prev + step + visible.length) % visible.length);
      return;
    }

    if (e.key === 'Enter') {
      if (!isOpen) return;
      e.preventDefault();
      if (visible[activeIndex]) commit(visible[activeIndex]);
      return;
    }

    if (e.key === 'Escape') {
      if (!isOpen) return;
      e.preventDefault();
      close();
      return;
    }

    if (e.key === 'Tab' && isOpen) close();
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setActiveIndex(0);
    if (!isOpen) setIsOpen(true);
  };

  const hiddenCount = matchCount - visible.length;

  const menu =
    isOpen && menuStyle ? (
      <div
        ref={menuRef}
        style={menuStyle}
        className={`search-dropdown-list searchable-select-list${dark ? ' is-dark' : ''}`}
      >
        <div ref={listRef} id={listId} role="listbox">
          {visible.length === 0 ? (
            <div className="dropdown-item empty">{emptyLabel}</div>
          ) : (
            visible.map((option, idx) => (
              <div
                key={option.value}
                role="option"
                aria-selected={String(option.value) === String(value)}
                className={`dropdown-item searchable-select-option${
                  idx === activeIndex ? ' is-active' : ''
                }`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(option)}
              >
                <div className="searchable-select-label">{option.label}</div>
                {option.sublabel && (
                  <div className="searchable-select-sublabel">{option.sublabel}</div>
                )}
              </div>
            ))
          )}
        </div>

        {hiddenCount > 0 && (
          <div className="searchable-select-more">
            +{hiddenCount} more — keep typing to narrow down
          </div>
        )}
      </div>
    ) : null;

  return (
    <div ref={rootRef} className={`searchable-select${className ? ` ${className}` : ''}`}>
      <div className="searchable-select-control">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          className={`${
            dark ? 'custom-form-input' : 'modern-form-control'
          } searchable-select-input${inputClassName ? ` ${inputClassName}` : ''}`}
          placeholder={selected ? selected.label : placeholder}
          value={isOpen ? query : selected?.label || ''}
          onChange={handleChange}
          onFocus={open}
          // Focus alone is not enough to reopen: after picking an option the
          // input keeps focus, so a second click would fire no focus event.
          onClick={() => {
            if (!isOpen) open();
          }}
          onKeyDown={handleKeyDown}
        />

        {selected && !disabled && (
          <button
            type="button"
            className={`searchable-select-clear${dark ? ' is-dark' : ''}`}
            title="Clear selection"
            aria-label="Clear selection"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => commit(null)}
          >
            ✕
          </button>
        )}
      </div>

      {menu && createPortal(menu, document.body)}
    </div>
  );
};

export default React.memo(SearchableSelect);
