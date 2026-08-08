import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link,
  Image,
  Type,
  Hash,
  Undo,
  Redo,
  List,
  ListOrdered,
  Minus,
  Table,
  ChevronDown,
  Code,
  X
} from 'lucide-react';
import MergeFieldPicker from './MergeFieldPicker';
import type { MergeField } from './MergeFieldPicker';
import './TemplateEditor.css';

interface TemplateEditorProps {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
}

const fontSizes = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Medium', value: '16px' },
  { label: 'Large', value: '18px' },
  { label: 'Extra Large', value: '24px' },
];

const fontFamilies = [
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: 'Times New Roman, serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif' },
  { label: 'Tahoma', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS', value: 'Trebuchet MS, sans-serif' },
];

const colors = [
  '#000000', '#374151', '#6b7280', '#9ca3af',
  '#dc2626', '#ea580c', '#d97706', '#ca8a04',
  '#16a34a', '#059669', '#0d9488', '#0891b2',
  '#2563eb', '#7c3aed', '#a855f7', '#db2777',
];

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  value,
  onChange,
  className,
  placeholder = 'Start typing your signature...',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showMergeFields, setShowMergeFields] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSize, setShowFontSize] = useState(false);
  const [showFontFamily, setShowFontFamily] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceCode, setSourceCode] = useState('');

  useEffect(() => {
    if (editorRef.current && !isSourceMode) {
      // Only update if content actually differs
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value, isSourceMode]);

  const execCommand = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleContentChange();
  }, []);

  const handleContentChange = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedRange(selection.getRangeAt(0).cloneRange());
    }
  }, []);

  const restoreSelection = useCallback(() => {
    if (savedRange) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedRange);
      }
    }
  }, [savedRange]);

  const insertMergeField = useCallback((field: MergeField) => {
    restoreSelection();
    const fieldHtml = `<span class="merge-field" contenteditable="false" data-field="${field.key}">{{${field.key}}}</span>&nbsp;`;
    document.execCommand('insertHTML', false, fieldHtml);
    setShowMergeFields(false);
    handleContentChange();
    editorRef.current?.focus();
  }, [restoreSelection, handleContentChange]);

  const insertLink = useCallback(() => {
    if (!linkUrl) return;
    restoreSelection();
    const text = linkText || linkUrl;
    const linkHtml = `<a href="${linkUrl}" target="_blank">${text}</a>`;
    document.execCommand('insertHTML', false, linkHtml);
    setShowLinkDialog(false);
    setLinkUrl('');
    setLinkText('');
    handleContentChange();
    editorRef.current?.focus();
  }, [linkUrl, linkText, restoreSelection, handleContentChange]);

  const insertImage = useCallback(() => {
    if (!imageUrl) return;
    restoreSelection();
    const imgHtml = `<img src="${imageUrl}" alt="${imageAlt || ''}" style="max-width: 100%; height: auto;" />`;
    document.execCommand('insertHTML', false, imgHtml);
    setShowImageDialog(false);
    setImageUrl('');
    setImageAlt('');
    handleContentChange();
    editorRef.current?.focus();
  }, [imageUrl, imageAlt, restoreSelection, handleContentChange]);

  const setFontSize = useCallback((size: string) => {
    // Use span with inline style for more reliable font sizing
    restoreSelection();
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = size;
      try {
        range.surroundContents(span);
      } catch (e) {
        // If we can't surround (selection spans elements), use execCommand fallback
        document.execCommand('fontSize', false, '7');
        // Then fix the font tags
        const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
        fonts?.forEach(font => {
          const span = document.createElement('span');
          span.style.fontSize = size;
          span.innerHTML = font.innerHTML;
          font.replaceWith(span);
        });
      }
    }
    setShowFontSize(false);
    handleContentChange();
    editorRef.current?.focus();
  }, [restoreSelection, handleContentChange]);

  const setFontFamily = useCallback((font: string) => {
    execCommand('fontName', font);
    setShowFontFamily(false);
  }, [execCommand]);

  const setColor = useCallback((color: string) => {
    execCommand('foreColor', color);
    setShowColorPicker(false);
  }, [execCommand]);

  const toggleSourceMode = useCallback(() => {
    if (isSourceMode) {
      // Switching from source to visual
      if (editorRef.current) {
        editorRef.current.innerHTML = sourceCode;
        handleContentChange();
      }
    } else {
      // Switching from visual to source
      setSourceCode(value);
    }
    setIsSourceMode(!isSourceMode);
  }, [isSourceMode, sourceCode, value, handleContentChange]);

  const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSourceCode(e.target.value);
    onChange(e.target.value);
  }, [onChange]);

  const insertTable = useCallback(() => {
    restoreSelection();
    const tableHtml = `
      <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <tr>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
        <tr>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
      </table>
    `;
    document.execCommand('insertHTML', false, tableHtml);
    handleContentChange();
    editorRef.current?.focus();
  }, [restoreSelection, handleContentChange]);

  return (
    <div className={`template-editor ${className || ''}`}>
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('undo')}
            title="Undo"
          >
            <Undo size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('redo')}
            title="Redo"
          >
            <Redo size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <div className="toolbar-dropdown">
            <button
              type="button"
              className="toolbar-button dropdown-trigger"
              onClick={() => {
                saveSelection();
                setShowFontFamily(!showFontFamily);
              }}
              title="Font Family"
            >
              <Type size={16} />
              <ChevronDown size={12} />
            </button>
            {showFontFamily && (
              <div className="dropdown-menu font-family-menu">
                {fontFamilies.map(font => (
                  <button
                    key={font.value}
                    type="button"
                    className="dropdown-item"
                    onClick={() => setFontFamily(font.value)}
                    style={{ fontFamily: font.value }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="toolbar-dropdown">
            <button
              type="button"
              className="toolbar-button dropdown-trigger"
              onClick={() => {
                saveSelection();
                setShowFontSize(!showFontSize);
              }}
              title="Font Size"
            >
              <span className="font-size-icon">A</span>
              <ChevronDown size={12} />
            </button>
            {showFontSize && (
              <div className="dropdown-menu">
                {fontSizes.map(size => (
                  <button
                    key={size.value}
                    type="button"
                    className="dropdown-item"
                    onClick={() => setFontSize(size.value)}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('bold')}
            title="Bold"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('italic')}
            title="Italic"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('underline')}
            title="Underline"
          >
            <Underline size={16} />
          </button>

          <div className="toolbar-dropdown">
            <button
              type="button"
              className="toolbar-button dropdown-trigger"
              onClick={() => {
                saveSelection();
                setShowColorPicker(!showColorPicker);
              }}
              title="Text Color"
            >
              <span className="color-icon">A</span>
              <ChevronDown size={12} />
            </button>
            {showColorPicker && (
              <div className="dropdown-menu color-picker">
                <div className="color-grid">
                  {colors.map(color => (
                    <button
                      key={color}
                      type="button"
                      className="color-swatch"
                      style={{ backgroundColor: color }}
                      onClick={() => setColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('justifyLeft')}
            title="Align Left"
          >
            <AlignLeft size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('justifyCenter')}
            title="Align Center"
          >
            <AlignCenter size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('justifyRight')}
            title="Align Right"
          >
            <AlignRight size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('insertUnorderedList')}
            title="Bullet List"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('insertOrderedList')}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => execCommand('insertHorizontalRule')}
            title="Horizontal Line"
          >
            <Minus size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              saveSelection();
              setShowLinkDialog(true);
            }}
            title="Insert Link"
          >
            <Link size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              saveSelection();
              setShowImageDialog(true);
            }}
            title="Insert Image"
          >
            <Image size={16} />
          </button>
          <button
            type="button"
            className="toolbar-button"
            onClick={() => {
              saveSelection();
              insertTable();
            }}
            title="Insert Table"
          >
            <Table size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="toolbar-button merge-field-button"
            onClick={() => {
              saveSelection();
              setShowMergeFields(!showMergeFields);
            }}
            title="Insert Merge Field"
          >
            <Hash size={16} />
            <span>Merge Field</span>
            <ChevronDown size={12} />
          </button>
        </div>

        <div className="toolbar-spacer" />

        <div className="toolbar-group">
          <button
            type="button"
            className={`toolbar-button ${isSourceMode ? 'active' : ''}`}
            onClick={toggleSourceMode}
            title={isSourceMode ? 'Visual Mode' : 'HTML Source'}
          >
            <Code size={16} />
          </button>
        </div>
      </div>

      {showMergeFields && (
        <div className="merge-field-dropdown">
          <MergeFieldPicker onSelect={insertMergeField} />
        </div>
      )}

      <div className="editor-content-wrapper">
        {isSourceMode ? (
          <textarea
            className="editor-source"
            value={sourceCode}
            onChange={handleSourceChange}
            placeholder="Enter HTML code..."
            spellCheck={false}
          />
        ) : (
          <div
            ref={editorRef}
            className="editor-content"
            contentEditable
            onInput={handleContentChange}
            onBlur={handleContentChange}
            data-placeholder={placeholder}
            suppressContentEditableWarning
          />
        )}
      </div>

      {/* Link Dialog */}
      {showLinkDialog && (
        <div className="editor-dialog-overlay" onClick={() => setShowLinkDialog(false)}>
          <div className="editor-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Insert Link</h3>
              <button className="dialog-close" onClick={() => setShowLinkDialog(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label>URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  autoFocus
                />
              </div>
              <div className="dialog-field">
                <label>Link Text (optional)</label>
                <input
                  type="text"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  placeholder="Click here"
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn-secondary" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={insertLink} disabled={!linkUrl}>
                Insert Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Dialog */}
      {showImageDialog && (
        <div className="editor-dialog-overlay" onClick={() => setShowImageDialog(false)}>
          <div className="editor-dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Insert Image</h3>
              <button className="dialog-close" onClick={() => setShowImageDialog(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label>Image URL</label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                  autoFocus
                />
              </div>
              <div className="dialog-field">
                <label>Alt Text (optional)</label>
                <input
                  type="text"
                  value={imageAlt}
                  onChange={e => setImageAlt(e.target.value)}
                  placeholder="Description of image"
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn-secondary" onClick={() => setShowImageDialog(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={insertImage} disabled={!imageUrl}>
                Insert Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateEditor;
