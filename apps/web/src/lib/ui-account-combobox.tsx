import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "./utils";
import { Input } from "./ui-input";

export type AccountComboboxOption = {
  id: string;
  label: string;
  description?: string;
};

type AccountComboboxProps = {
  value?: string;
  selectedLabel?: string;
  options: AccountComboboxOption[];
  onValueChange: (value: string) => void;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  disabled?: boolean;
  favoriteIds?: string[];
  recentIds?: string[];
  onToggleFavorite?: (id: string) => void;
};

export const AccountCombobox = ({
  value,
  selectedLabel,
  options,
  onValueChange,
  onSearchChange,
  placeholder = "Select account",
  searchPlaceholder = "Search accounts...",
  emptyMessage = "No accounts found.",
  isLoading = false,
  disabled = false,
  favoriteIds = [],
  recentIds = [],
  onToggleFavorite,
}: AccountComboboxProps) => {
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

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return options;
    }
    return options.filter((option) => {
      const label = option.label.toLowerCase();
      const description = option.description?.toLowerCase() ?? "";
      return label.includes(trimmed) || description.includes(trimmed);
    });
  }, [options, query]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const recentSet = useMemo(() => new Set(recentIds), [recentIds]);

  const favorites = filteredOptions.filter((option) => favoriteSet.has(option.id));
  const recents = filteredOptions.filter(
    (option) => !favoriteSet.has(option.id) && recentSet.has(option.id),
  );
  const rest = filteredOptions.filter(
    (option) => !favoriteSet.has(option.id) && !recentSet.has(option.id),
  );

  const renderOption = (option: AccountComboboxOption) => (
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
      <span className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
        {option.description ? <span>{option.description}</span> : null}
        {onToggleFavorite ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(option.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleFavorite(option.id);
              }
            }}
            className={cn(
              "rounded p-0.5 text-muted-foreground hover:text-foreground",
              favoriteSet.has(option.id) && "text-foreground",
            )}
            aria-label={favoriteSet.has(option.id) ? "Unfavorite account" : "Favorite account"}
          >
            <Star
              className="h-3.5 w-3.5"
              fill={favoriteSet.has(option.id) ? "currentColor" : "none"}
            />
          </span>
        ) : null}
      </span>
    </button>
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
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
          />
          <div className="mt-2 max-h-60 overflow-auto">
            {isLoading ? <div className="px-2 py-1 text-sm text-muted-foreground">Searching...</div> : null}
            {!isLoading && filteredOptions.length === 0 ? (
              <div className="px-2 py-1 text-sm text-muted-foreground">{emptyMessage}</div>
            ) : null}
            {!isLoading && favorites.length > 0 ? (
              <div className="px-2 py-1 text-xs uppercase text-muted-foreground">Favorites</div>
            ) : null}
            {!isLoading ? favorites.map(renderOption) : null}
            {!isLoading && recents.length > 0 ? (
              <div className="px-2 py-1 text-xs uppercase text-muted-foreground">Recent</div>
            ) : null}
            {!isLoading ? recents.map(renderOption) : null}
            {!isLoading && rest.length > 0 ? (
              <div className="px-2 py-1 text-xs uppercase text-muted-foreground">All</div>
            ) : null}
            {!isLoading ? rest.map(renderOption) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};
