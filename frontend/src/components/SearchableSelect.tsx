import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, Loader2, Trash2 } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  canDelete?: boolean;
  deleteTooltip?: string;
}

interface SearchableSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  containerClassName?: string;
  dropdownClassName?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  onSearchChange?: (term: string) => void;
  loading?: boolean;
  disableLocalFilter?: boolean;
  dropdownPosition?: 'auto' | 'top' | 'bottom';
  onDeleteOption?: (value: string | number, e: React.MouseEvent) => void;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  className = '',
  containerClassName = '',
  dropdownClassName = '',
  disabled = false,
  required = false,
  id,
  name,
  onSearchChange,
  loading = false,
  disableLocalFilter = false,
  dropdownPosition = 'auto',
  onDeleteOption
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Monitor screen size for mobile responsiveness
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const selectedOption = useMemo(() => {
    return options.find(opt => String(opt.value) === String(value));
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (disableLocalFilter || !searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter(opt =>
      opt.label.toLowerCase().includes(term) ||
      String(opt.value).toLowerCase().includes(term)
    );
  }, [options, searchTerm, disableLocalFilter]);

  // Handle click outside to close dropdown (desktop only, mobile uses modal backdrop)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isMobile]);

  // Lock body scroll on mobile when popup is open
  useEffect(() => {
    if (isOpen && isMobile) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, isMobile]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Determine placement (top vs bottom) and focus search input when dropdown opens (desktop)
  useEffect(() => {
    if (isOpen) {
      if (!isMobile) {
        if (dropdownPosition === 'top') {
          setPlacement('top');
        } else if (dropdownPosition === 'bottom') {
          setPlacement('bottom');
        } else if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          if (spaceBelow < 260 && spaceAbove > 220) {
            setPlacement('top');
          } else {
            setPlacement('bottom');
          }
        }
        setTimeout(() => {
          searchInputRef.current?.focus();
        }, 50);
      }
    } else {
      setSearchTerm('');
    }
  }, [isOpen, dropdownPosition, isMobile]);

  const handleSelect = (val: string | number) => {
    onChange(String(val));
    setIsOpen(false);
  };

  const baseInputCls = className || "w-full bg-surface-container border border-outline-variant text-on-surface text-xs rounded px-3.5 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all placeholder:text-on-surface-variant/60 shadow-2xs";

  return (
    <div ref={containerRef} className={`relative ${containerClassName || 'w-full'} ${isOpen ? 'z-50' : ''}`}>
      {/* Hidden native input for HTML form validation */}
      {required && (
        <input
          type="text"
          value={value ? String(value) : ''}
          required={required}
          onChange={() => { }}
          tabIndex={-1}
          className="sr-only pointer-events-none opacity-0 absolute h-0 w-0"
          id={id}
          name={name}
        />
      )}

      {/* Select Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(prev => !prev)}
        className={`${baseInputCls} flex items-center justify-between gap-2 text-left cursor-pointer select-none`}
      >
        <span className={`truncate ${!selectedOption ? 'text-on-surface-variant/60 font-normal' : ''}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-75 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Desktop Dropdown Menu */}
      {isOpen && !disabled && !isMobile && (
        <div className={`absolute ${dropdownClassName || 'left-0 right-0'} ${placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-[100] bg-surface dark:bg-surface-container-high border border-outline-variant rounded shadow-xl overflow-hidden flex flex-col max-h-80 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md`}>
          {/* Search Box */}
          <div className="p-2 border-b border-outline-variant/60 bg-surface-container-low flex items-center gap-2">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
            ) : (
              <Search className="w-3.5 h-3.5 text-on-surface-variant shrink-0" />
            )}
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={e => {
                const val = e.target.value;
                setSearchTerm(val);
                onSearchChange?.(val);
              }}
              className="w-full bg-transparent text-xs text-on-surface placeholder:text-on-surface-variant/60 outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  onSearchChange?.('');
                }}
                className="p-0.5 hover:bg-surface-container-high rounded text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="overflow-y-auto py-1 max-h-48 text-xs scrollbar-thin">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-on-surface-variant/70 italic text-center text-xs">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <div
                    key={opt.value}
                    onClick={() => !opt.disabled && handleSelect(opt.value)}
                    className={`px-3 py-2 flex items-center justify-between group cursor-pointer transition-colors ${opt.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'hover:bg-surface-container-high text-on-surface'
                      }`}
                  >
                    <span className="truncate flex-1 pr-2">{opt.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      {opt.canDelete && onDeleteOption && (
                        <button
                          type="button"
                          title={opt.deleteTooltip || "Delete unused option"}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteOption(opt.value, e);
                          }}
                          className="p-1 text-on-surface-variant/50 hover:text-error hover:bg-error/10 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Mobile Popup Modal (Bottom Sheet / Popup Dialog) */}
      {isOpen && !disabled && isMobile && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex flex-col justify-end p-0 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          {/* Popup Container (Bottom Sheet with safe-area spacing) */}
          <div
            className="relative w-full max-h-[85vh] bg-surface dark:bg-surface-container-high border-t border-outline-variant rounded-t-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grab Handle */}
            <div className="w-10 h-1 bg-outline-variant/70 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/60 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm text-on-surface truncate">
                  {selectedOption ? selectedOption.label : placeholder}
                </span>
                <span className="text-[11px] text-on-surface-variant font-medium px-2 py-0.5 rounded-full bg-surface-container shrink-0 tabular-nums">
                  {filteredOptions.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 -mr-1 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Box */}
            <div className="p-3 border-b border-outline-variant/40 bg-surface-container-low flex items-center gap-2 shrink-0">
              {loading ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              ) : (
                <Search className="w-4 h-4 text-on-surface-variant shrink-0" />
              )}
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={e => {
                  const val = e.target.value;
                  setSearchTerm(val);
                  onSearchChange?.(val);
                }}
                className="w-full bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    onSearchChange?.('');
                  }}
                  className="p-1 hover:bg-surface-container rounded-full text-on-surface-variant hover:text-on-surface cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Options List */}
            <div className="overflow-y-auto overscroll-contain py-1 max-h-[55vh] divide-y divide-outline-variant/20 scrollbar-thin pb-6">
              {filteredOptions.length === 0 ? (
                <div className="py-10 text-center text-on-surface-variant text-xs italic">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = String(opt.value) === String(value);
                  return (
                    <div
                      key={opt.value}
                      onClick={() => !opt.disabled && handleSelect(opt.value)}
                      className={`px-4 py-3 min-h-[46px] flex items-center justify-between text-sm transition-colors cursor-pointer active:bg-primary/10 ${
                        opt.disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isSelected
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-on-surface active:bg-surface-container-high'
                      }`}
                    >
                      <span className="truncate flex-1 pr-3">{opt.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                        {opt.canDelete && onDeleteOption && (
                          <button
                            type="button"
                            title={opt.deleteTooltip || 'Delete unused option'}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteOption(opt.value, e);
                            }}
                            className="p-1.5 text-on-surface-variant/50 hover:text-error hover:bg-error/10 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
