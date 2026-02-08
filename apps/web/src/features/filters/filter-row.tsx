"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "../../lib/ui-button";
import { Input } from "../../lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";
import { DATE_RANGE_OPTIONS, STATUS_OPTIONS, type DateRangePreset } from "./filter-helpers";
import { AdvancedFilterPanel } from "./advanced-filter-panel";

type FilterOption = { value: string; label: string };
type QuickFilterField = "search" | "status" | "dateRange" | "party";

type FilterRowProps = {
  search: string;
  status: string;
  dateRange: DateRangePreset;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateRangeChange: (value: DateRangePreset) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  amountMin?: string;
  amountMax?: string;
  onAmountMinChange?: (value: string) => void;
  onAmountMaxChange?: (value: string) => void;
  partyLabel?: string;
  partyValue?: string;
  partyOptions?: FilterOption[];
  onPartyChange?: (value: string) => void;
  partySearch?: string;
  onPartySearchChange?: (value: string) => void;
  onApply: () => void;
  onReset?: () => void;
  isLoading?: boolean;
  leadingSlot?: ReactNode;
  quickFields?: QuickFilterField[];
  advancedTitle?: string;
};

type FilterChip = {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
};

const DATE_RANGE_LABELS = new Map(DATE_RANGE_OPTIONS.map((option) => [option.value, option.label]));
const STATUS_LABELS = new Map(STATUS_OPTIONS.map((option) => [option.value, option.label]));

export const FilterRow = ({
  search,
  status,
  dateRange,
  dateFrom,
  dateTo,
  onSearchChange,
  onStatusChange,
  onDateRangeChange,
  onDateFromChange,
  onDateToChange,
  amountMin,
  amountMax,
  onAmountMinChange,
  onAmountMaxChange,
  partyLabel,
  partyValue,
  partyOptions,
  onPartyChange,
  partySearch,
  onPartySearchChange,
  onApply,
  onReset,
  isLoading,
  leadingSlot,
  quickFields,
  advancedTitle,
}: FilterRowProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const showAmount = onAmountMinChange && onAmountMaxChange;
  const showParty = partyLabel && partyOptions && onPartyChange;
  const showPartySearch = showParty && onPartySearchChange;
  const normalizedPartyValue = partyValue && partyValue.length > 0 ? partyValue : "all";
  const quickSet = new Set<QuickFilterField>(quickFields ?? ["search", "status", "dateRange"]);
  if (showParty && !quickSet.has("party")) {
    // Default for party-aware modules: keep party in quick row for day-to-day filtering.
    quickSet.add("party");
  }

  const hasAdvanced =
    (showAmount && Boolean(onAmountMinChange) && Boolean(onAmountMaxChange)) ||
    Boolean(onDateFromChange) ||
    Boolean(onDateToChange) ||
    (showParty && !quickSet.has("party")) ||
    !quickSet.has("search") ||
    !quickSet.has("status") ||
    !quickSet.has("dateRange");

  const activeChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];

    if (search.trim()) {
      chips.push({
        key: "search",
        label: "Search",
        value: search.trim(),
        onRemove: () => onSearchChange(""),
      });
    }

    if (status && status !== "all") {
      chips.push({
        key: "status",
        label: "Status",
        value: STATUS_LABELS.get(status) ?? status,
        onRemove: () => onStatusChange("all"),
      });
    }

    if (dateRange && dateRange !== "all") {
      chips.push({
        key: "dateRange",
        label: "Date Range",
        value: DATE_RANGE_LABELS.get(dateRange) ?? dateRange,
        onRemove: () => {
          onDateRangeChange("all");
          onDateFromChange("");
          onDateToChange("");
        },
      });
    }

    if (dateFrom) {
      chips.push({
        key: "dateFrom",
        label: "From",
        value: dateFrom,
        onRemove: () => onDateFromChange(""),
      });
    }

    if (dateTo) {
      chips.push({
        key: "dateTo",
        label: "To",
        value: dateTo,
        onRemove: () => onDateToChange(""),
      });
    }

    if (showAmount && amountMin) {
      chips.push({
        key: "amountMin",
        label: "Min",
        value: amountMin,
        onRemove: () => onAmountMinChange?.(""),
      });
    }

    if (showAmount && amountMax) {
      chips.push({
        key: "amountMax",
        label: "Max",
        value: amountMax,
        onRemove: () => onAmountMaxChange?.(""),
      });
    }

    if (showParty && partyValue) {
      const selected = partyOptions?.find((option) => option.value === partyValue);
      chips.push({
        key: "party",
        label: partyLabel,
        value: selected?.label ?? partyValue,
        onRemove: () => onPartyChange?.(""),
      });
    }

    return chips;
  }, [
    amountMax,
    amountMin,
    dateFrom,
    dateRange,
    dateTo,
    onAmountMaxChange,
    onAmountMinChange,
    onDateFromChange,
    onDateRangeChange,
    onDateToChange,
    onPartyChange,
    onSearchChange,
    onStatusChange,
    partyLabel,
    partyOptions,
    partyValue,
    search,
    showAmount,
    showParty,
    status,
  ]);

  const activeCount = activeChips.length;

  return (
    <div className="filter-shell">
      <div className="filter-row filter-row-quick">
        {leadingSlot}
        {quickSet.has("search") ? (
          <label>
            Search
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} />
          </label>
        ) : null}
        {quickSet.has("status") ? (
          <label>
            Status
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        {quickSet.has("dateRange") ? (
          <label>
            Date Range
            <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRangePreset)}>
              <SelectTrigger aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        {showParty && quickSet.has("party") ? (
          <label>
            {partyLabel}
            <Select
              value={normalizedPartyValue}
              onValueChange={(value) => onPartyChange?.(value === "all" ? "" : value)}
            >
              <SelectTrigger aria-label={partyLabel}>
                <SelectValue placeholder={`Select ${partyLabel?.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {partyOptions?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        <div className="filter-actions">
          <Button variant="secondary" onClick={onApply} disabled={isLoading}>
            Apply
          </Button>
          {hasAdvanced ? (
            <Button variant="outline" onClick={() => setAdvancedOpen((open) => !open)} disabled={isLoading}>
              {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Advanced
            </Button>
          ) : null}
          {onReset ? (
            <Button variant="ghost" onClick={onReset} disabled={isLoading}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <AdvancedFilterPanel open={advancedOpen && hasAdvanced} title={advancedTitle}>
        {!quickSet.has("search") ? (
          <label>
            Search
            <Input value={search} onChange={(event) => onSearchChange(event.target.value)} />
          </label>
        ) : null}
        {!quickSet.has("status") ? (
          <label>
            Status
            <Select value={status} onValueChange={onStatusChange}>
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        {!quickSet.has("dateRange") ? (
          <label>
            Date Range
            <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRangePreset)}>
              <SelectTrigger aria-label="Date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        <label>
          From
          <Input type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
        </label>
        <label>
          To
          <Input type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} />
        </label>
        {showAmount ? (
          <label>
            Amount Min
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountMin}
              onChange={(event) => onAmountMinChange?.(event.target.value)}
            />
          </label>
        ) : null}
        {showAmount ? (
          <label>
            Amount Max
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amountMax}
              onChange={(event) => onAmountMaxChange?.(event.target.value)}
            />
          </label>
        ) : null}
        {showPartySearch ? (
          <label>
            Search {partyLabel}
            <Input
              value={partySearch ?? ""}
              onChange={(event) => onPartySearchChange?.(event.target.value)}
              placeholder={`Search ${partyLabel?.toLowerCase()}`}
            />
          </label>
        ) : null}
        {showParty && !quickSet.has("party") ? (
          <label>
            {partyLabel}
            <Select
              value={normalizedPartyValue}
              onValueChange={(value) => onPartyChange?.(value === "all" ? "" : value)}
            >
              <SelectTrigger aria-label={partyLabel}>
                <SelectValue placeholder={`Select ${partyLabel?.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {partyOptions?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </AdvancedFilterPanel>

      <div className="filter-chip-strip">
        <div className="filter-chip-header">
          <span className="muted">{activeCount} active filter{activeCount === 1 ? "" : "s"}</span>
          {onReset && activeCount > 0 ? (
            <Button variant="ghost" size="sm" onClick={onReset} disabled={isLoading}>
              Clear all
            </Button>
          ) : null}
        </div>
        {activeCount > 0 ? (
          <div className="chip-row">
            {activeChips.map((chip) => (
              <span key={chip.key} className="filter-chip">
                <strong>{chip.label}:</strong> {chip.value}
                <button
                  type="button"
                  className="filter-chip-remove"
                  aria-label={`Remove ${chip.label} filter`}
                  onClick={chip.onRemove}
                  disabled={isLoading}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
