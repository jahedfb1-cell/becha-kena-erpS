import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Extension } from '@tiptap/core';

// Custom TipTap LineHeight Extension
const LineHeight = Extension.create({
  name: 'lineHeight',

  addOptions() {
    return {
      types: ['paragraph', 'heading'],
      defaultLineHeight: '1.35',
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => element.style.lineHeight || null,
            renderHTML: attributes => {
              if (!attributes.lineHeight) {
                return {};
              }
              return {
                style: `line-height: ${attributes.lineHeight}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight: lineHeight => ({ commands }) => {
        return this.options.types.every(type =>
          commands.updateAttributes(type, { lineHeight })
        );
      },
      unsetLineHeight: () => ({ commands }) => {
        return this.options.types.every(type =>
          commands.updateAttributes(type, { lineHeight: null })
        );
      },
    };
  },
});

const S = {
  container: {
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    background: '#ffffff',
    overflow: 'hidden',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
  },
  // Same `border` shorthand as .container, not the longhand `borderColor`.
  // React warns when an inline style mixes a shorthand and its longhand for
  // the same property across renders (it can't tell which should win), and
  // this object is spread on top of .container every time isEditable flips.
  containerDisabled: {
    background: '#f1f5f9',
    border: '1.5px solid #e2e8f0',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
  },
  btn: {
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#475569',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    transition: 'all 0.15s ease',
  },
  // Same reason as containerDisabled above: `border` shorthand, not
  // `borderColor`, so it doesn't fight .btn's own `border` on every toggle
  // of a toolbar button's active state.
  btnActive: {
    background: '#ede9fe',
    color: '#6366f1',
    border: '1px solid #c4b5fd',
  },
  select: {
    background: '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    padding: '3px 6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#334155',
    cursor: 'pointer',
    outline: 'none',
  },
  divider: {
    width: '1px',
    height: '16px',
    background: '#cbd5e1',
    margin: '0 4px',
  },
};

// Matches renderRichText.jsx's own HTML sniff, so a value round-trips the
// same way on both the editing and printing sides.
const looksLikeHtml = (str) => /<[a-z][\s\S]*>/i.test(str);

// This editor's own onChange always emits real TipTap HTML, but `value` can
// also arrive holding years of plain text saved by the plain <input>/
// <textarea> this component replaced on several forms (Quotation/Order
// remarks, line-item notes, etc.). Handing a plain string straight to
// TipTap's `content` option runs it through an HTML parser, not a text
// node — something like "Width < 60in" would have "< 60in" partly eaten as
// a malformed tag. Escaping it and wrapping each line in its own paragraph
// keeps a legacy plain-text value rendering exactly as it always did.
const toEditorContent = (value) => {
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.split(/\r?\n/).map((line) => `<p>${line}</p>`).join('');
};

const RichTextEditor = ({
  value = '',
  onChange,
  placeholder = 'Write details here...',
  disabled = false,
  readOnly = false,
  minHeight = '110px',
}) => {
  const isEditable = !disabled && !readOnly;

  // There is no @tiptap/extension-placeholder in this project's dependency
  // tree, and placeholder text needs a ProseMirror decoration to sit inside
  // the content — a plain CSS ::before on the wrapper can't reach in there.
  // Tracked as state (not read from `editor.isEmpty` at render time)
  // because a programmatic setContent() call below passes emitUpdate=false
  // specifically to avoid re-triggering onChange, which means onUpdate does
  // not fire for it and this has to be set explicitly at that call site too.
  const [isEmpty, setIsEmpty] = useState(!value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      LineHeight,
    ],
    content: toEditorContent(value),
    editable: isEditable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setIsEmpty(editor.isEmpty);
      if (onChange) {
        onChange(html === '<p></p>' ? '' : html);
      }
    },
  });

  useEffect(() => {
    if (editor && value !== undefined) {
      const currentHtml = editor.getHTML();
      const nextContent = toEditorContent(value);
      if (nextContent !== currentHtml) {
        if (!value && currentHtml === '<p></p>') return;
        editor.commands.setContent(nextContent, false);
        setIsEmpty(editor.isEmpty);
      }
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditable);
    }
  }, [isEditable, editor]);

  if (!editor) return null;

  // Detect current line height of selection
  const currentLineHeight =
    editor.getAttributes('paragraph').lineHeight ||
    editor.getAttributes('heading').lineHeight ||
    '1.35';

  return (
    <div style={{ ...S.container, ...(isEditable ? {} : S.containerDisabled) }}>
      <style>{`
        /*
         * @tiptap/react's <EditorContent className="rte-content"> puts that
         * class on a wrapper div it renders; the contenteditable surface
         * TipTap itself mounts one level inside it, with its own classes
         * "tiptap ProseMirror". Rules meant for the editing surface — the
         * outline, the box padding, the type — have to target ".rte-content
         * .tiptap", or they land on an element with nothing to paint: the
         * outline stays as the browser's default focus ring (visible as a
         * rectangle around the typed text) and the padding never reaches
         * the text at all. Rules about markup inside the content (p, ul,
         * h2...) are unaffected either way, since a descendant selector
         * still matches through the extra level of nesting.
         */
        .rte-content .tiptap {
          outline: none;
          padding: 10px 14px;
          font-size: 13.5px;
          line-height: 1.35;
          color: #111827;
          font-family: inherit;
          min-height: ${minHeight};
        }
        .rte-content p {
          margin: 0 0 2px 0;
        }
        .rte-content p:last-child {
          margin-bottom: 0;
        }
        .rte-content ul, .rte-content ol {
          padding-left: 20px;
          margin: 4px 0 8px 0;
        }
        .rte-content h2 {
          font-size: 16px;
          font-weight: 700;
          margin: 8px 0 4px 0;
        }
        .rte-content h3 {
          font-size: 14px;
          font-weight: 700;
          margin: 6px 0 4px 0;
        }
        .rte-content blockquote {
          border-left: 3px solid #6366f1;
          padding-left: 10px;
          margin: 6px 0;
          color: #4b5563;
          font-style: italic;
        }
        .rte-btn:hover:not(:disabled) {
          background: #e2e8f0;
          color: #1e293b;
        }
        .rte-content[contenteditable="false"] {
          background: #f1f5f9;
          color: #475569;
          cursor: default;
        }
      `}</style>

      {isEditable && (
        <div style={S.toolbar}>
          {/* Bold */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('bold') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Ctrl+B)"
          >
            <strong>B</strong>
          </button>

          {/* Italic */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('italic') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Ctrl+I)"
          >
            <em>I</em>
          </button>

          {/* Strike */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('strike') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <s>S</s>
          </button>

          <div style={S.divider} />

          {/* H2 */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('heading', { level: 2 }) ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </button>

          {/* H3 */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('heading', { level: 3 }) ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </button>

          <div style={S.divider} />

          {/* Line Height Selector */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }} title="Line Spacing">↕ Line:</span>
            <select
              style={S.select}
              value={currentLineHeight}
              onChange={e => {
                const val = e.target.value;
                if (val === 'default') {
                  editor.chain().focus().unsetLineHeight().run();
                } else {
                  editor.chain().focus().setLineHeight(val).run();
                }
              }}
              title="Adjust Line Spacing / Gap"
            >
              <option value="1.0">Tight (1.0)</option>
              <option value="1.15">Compact (1.15)</option>
              <option value="1.35">Normal (1.35)</option>
              <option value="1.6">Relaxed (1.6)</option>
              <option value="2.0">Double (2.0)</option>
            </select>
          </div>

          <div style={S.divider} />

          {/* Bullet List */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('bulletList') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet List"
          >
            • List
          </button>

          {/* Ordered List */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('orderedList') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered List"
          >
            1. List
          </button>

          {/* Blockquote */}
          <button
            type="button"
            className="rte-btn"
            style={{ ...S.btn, ...(editor.isActive('blockquote') ? S.btnActive : {}) }}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Quote"
          >
            “ Quote
          </button>

          <div style={S.divider} />

          {/* Clear formatting */}
          <button
            type="button"
            className="rte-btn"
            style={S.btn}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().unsetLineHeight().run()}
            title="Clear Formatting"
          >
            🧹 Clear
          </button>

          {/* Undo */}
          <button
            type="button"
            className="rte-btn"
            style={S.btn}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            ↩
          </button>

          {/* Redo */}
          <button
            type="button"
            className="rte-btn"
            style={S.btn}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            ↪
          </button>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              left: '14px',
              right: '14px',
              fontSize: '13.5px',
              lineHeight: 1.35,
              color: '#94a3b8',
              // The click has to land on the ProseMirror content underneath
              // to focus it, not on this label.
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} className="rte-content" />
      </div>
    </div>
  );
};

export default RichTextEditor;
