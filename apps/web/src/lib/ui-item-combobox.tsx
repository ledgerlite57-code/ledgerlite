import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./utils";
import { Input } from "./ui-input";

export type ItemComboboxOption = {
  id: string;
  label: string;
  description?: string;
};

type ItemComboboxProps = {
  value?: string;
  selectedLabel?: string;
  options: ItemComboboxOption[];
  onValueChange: (value: string) => void;
  onSearchChange?: (value: string) => void;
  onCreateNew?: (label?: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  createLabel?: string;
};

export const ItemCombobox = ({
  value,
  selectedLabel,
  options,
  onValueChange,
  onSearchChange,
  onCreateNew,
  placeholder = "Select item",
  searchPlaceholder = "Search items...",
  emptyMessage = "No items found.",
  isLoading = false,
  disabled = false,
  createLabel,
}: ItemComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  useEffect(() => {
    onSearchChange?.(query);
  }, [onSearchChange, query]);

  const activeLabel =
    selectedLabel ?? (value ? options.find((option) => option.id === value)?.label : undefined);
  const displayLabel = activeLabel?.trim() ? activeLabel : "";

  const handleSelect = (id: string) => {
    onValueChange(id);
    setOpen(false);
    setQuery("");
    onSearchChange?.("");
  };

  const handleCreate = () => {
    if (!onCreateNew) {
      return;
    }
    const trimmed = query.trim();
    onCreateNew(trimmed || undefined);
    setOpen(false);
    setQuery("");
    onSearchChange?.("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-4 py-2 text-base",
          disabled && "cursor-not-allowed opacity-60",
        )}
        onClick={() => {
          if (!disabled) {
            setOpen((prev) => !prev);
          }
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
          {displayLabel || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover p-2 shadow-md">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoFocus
            className="h-12 px-4 text-base"
          />
          <div className="mt-2 max-h-60 overflow-auto">
            {isLoading ? <div className="px-2 py-1 text-sm text-muted-foreground">Searching...</div> : null}
            {!isLoading && options.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : null}
            {!isLoading
              ? options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-sm hover:bg-accent",
                      option.id === value && "bg-accent",
                    )}
                    onClick={() => handleSelect(option.id)}
                  >
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="ml-2 text-xs text-muted-foreground">{option.description}</span>
                    ) : null}
                  </button>
                ))
              : null}
            {onCreateNew && !disabled ? (
              <button
                type="button"
                className="mt-2 w-full rounded-sm border border-dashed border-border px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent"
                onClick={handleCreate}
              >
                {createLabel ?? (query.trim() ? `Create "${query.trim()}"` : "Create new item")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
