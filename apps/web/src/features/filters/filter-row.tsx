"use client";

import type { ReactNode } from "react";
import { Button } from "../../lib/ui-button";
import { Input } from "../../lib/ui-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../lib/ui-select";
import { DATE_RANGE_OPTIONS, STATUS_OPTIONS, type DateRangePreset } from "./filter-helpers";

type FilterOption = { value: string; label: string };

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
};

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
}: FilterRowProps) => {
  const showAmount = onAmountMinChange && onAmountMaxChange;
  const showParty = partyLabel && partyOptions && onPartyChange;
  const showPartySearch = showParty && onPartySearchChange;
  const normalizedPartyValue = partyValue && partyValue.length > 0 ? partyValue : "all";

  return (
    <div className="filter-row">
      {leadingSlot}
      <label>
        Search
        <Input value={search} onChange={(event) => onSearchChange(event.target.value)} />
      </label>
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
            onChange={(event) => onAmountMinChange(event.target.value)}
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
            onChange={(event) => onAmountMaxChange(event.target.value)}
          />
        </label>
      ) : null}
      {showParty ? (
        <label>
          {partyLabel}
          {showPartySearch ? (
            <>
              <Input
                value={partySearch ?? ""}
                onChange={(event) => onPartySearchChange?.(event.target.value)}
                placeholder={`Search ${partyLabel?.toLowerCase()}`}
              />
              <div style={{ height: 8 }} />
            </>
          ) : null}
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
      <div>
        <Button variant="secondary" onClick={onApply} disabled={isLoading}>
          Apply Filters
        </Button>
      </div>
      {onReset ? (
        <div>
          <Button variant="ghost" onClick={onReset} disabled={isLoading}>
            Clear
          </Button>
        </div>
      ) : null}
    </div>
  );
};
