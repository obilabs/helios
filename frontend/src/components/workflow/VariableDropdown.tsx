import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { WORKFLOW_VARIABLES } from './types';

interface VariableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function VariableDropdown({
  value,
  onChange,
  placeholder = 'Select or type value...',
  disabled,
}: VariableDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input value with prop
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter variables based on search
  const filteredCategories = WORKFLOW_VARIABLES.map(cat => ({
    ...cat,
    variables: cat.variables.filter(
      v =>
        v.label.toLowerCase().includes(search.toLowerCase()) ||
        v.key.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.variables.length > 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setSearch(newValue);
    onChange(newValue);

    if (!isOpen && newValue.length > 0) {
      setIsOpen(true);
    }
  };

  const handleSelectVariable = (key: string) => {
    const variableValue = `{{${key}}}`;
    setInputValue(variableValue);
    onChange(variableValue);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setInputValue('');
    onChange('');
    inputRef.current?.focus();
  };

  const isVariable = inputValue.startsWith('{{') && inputValue.endsWith('}}');

  return (
    <div className="variable-dropdown" ref={containerRef}>
      <div className={`variable-input-wrapper ${isOpen ? 'focused' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={isVariable ? 'has-variable' : ''}
        />
        {inputValue && !disabled && (
          <button
            type="button"
            className="variable-clear"
            onClick={handleClear}
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          className="variable-toggle"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {isOpen && !disabled && (
        <div className="variable-menu">
          <div className="variable-menu-header">
            <span>Insert Variable</span>
          </div>
          <div className="variable-menu-content">
            {filteredCategories.length === 0 && (
              <div className="variable-empty">
                No matching variables
              </div>
            )}
            {filteredCategories.map((category) => (
              <div key={category.name} className="variable-category">
                <div className="variable-category-label">{category.label}</div>
                {category.variables.map((variable) => (
                  <button
                    key={variable.key}
                    type="button"
                    className="variable-option"
                    onClick={() => handleSelectVariable(variable.key)}
                  >
                    <span className="variable-option-label">{variable.label}</span>
                    <span className="variable-option-key">{`{{${variable.key}}}`}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="variable-menu-footer">
            <span>Or type a custom value</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default VariableDropdown;
