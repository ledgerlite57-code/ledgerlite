"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "./utils";
import { Button } from "./ui-button";

type EditableCellProps = {
  isActive: boolean;
  onActivate?: () => void;
  isReadOnly?: boolean;
  align?: "left" | "right";
  className?: string;
  display?: React.ReactNode;
  placeholder?: string;
  children: React.ReactNode;
};

export const EditableCell = ({
  isActive,
  onActivate,
  isReadOnly = false,
  align = "left",
  className,
  display,
  placeholder,
  children,
}: EditableCellProps) => {
  const hasDisplay = display !== null && display !== undefined && display !== "";
  const showPlaceholder = !hasDisplay && placeholder;
  const handleActivate = () => {
    if (!isReadOnly && !isActive) {
      onActivate?.();
    }
  };

  return (
    <div
      className={cn(
        "line-grid-cell",
        align === "right" && "line-grid-cell-right",
        isActive && !isReadOnly && "line-grid-cell-active",
        isReadOnly && "line-grid-cell-readonly",
        className,
      )}
      onClick={handleActivate}
    >
      {isActive && !isReadOnly ? (
        children
      ) : (
        <span className={cn("line-grid-display", showPlaceholder && "line-grid-placeholder")}>
          {showPlaceholder ? placeholder : display}
        </span>
      )}
    </div>
  );
};

type LineItemRowActionsProps = {
  isExpanded: boolean;
  onToggleDetails: () => void;
  onRemove: () => void;
  disableRemove?: boolean;
  isReadOnly?: boolean;
};

export const LineItemRowActions = ({
  isExpanded,
  onToggleDetails,
  onRemove,
  disableRemove = false,
  isReadOnly = false,
}: LineItemRowActionsProps) => (
  <div className="line-grid-actions">
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggleDetails}
      aria-label={isExpanded ? "Hide line details" : "Show line details"}
    >
      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
    </Button>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onRemove}
      disabled={isReadOnly || disableRemove}
      aria-label="Remove line"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
);

type LineItemDetailsProps = {
  title?: string;
  children: React.ReactNode;
};

export const LineItemDetails = ({ title = "Line details", children }: LineItemDetailsProps) => (
  <div className="line-grid-details">
    <div className="line-grid-details-title">{title}</div>
    <div className="line-grid-details-grid">{children}</div>
  </div>
);
