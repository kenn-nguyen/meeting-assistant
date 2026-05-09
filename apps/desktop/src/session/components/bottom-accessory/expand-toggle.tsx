import { X } from "lucide-react";
import type { PointerEvent, ReactNode } from "react";

import { cn } from "@hypr/utils";

export function ExpandToggle({
  isExpanded,
  onToggle,
  onResizeStart,
  isResizing = false,
  label,
  showExpandedCloseIcon = false,
  collapsedClassName,
  trailingAccessory,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  onResizeStart?: (event: PointerEvent<HTMLButtonElement>) => void;
  isResizing?: boolean;
  label?: string;
  showExpandedCloseIcon?: boolean;
  collapsedClassName?: string;
  trailingAccessory?: ReactNode;
}) {
  const hasLabel = Boolean(label);
  const canResize = isExpanded && !!onResizeStart;

  return (
    <div className="group relative left-3 z-10 flex h-5 w-fit items-stretch">
      <button
        type="button"
        onClick={onToggle}
        onPointerDown={canResize ? onResizeStart : undefined}
        className={cn([
          "flex h-5 items-center justify-center gap-1",
          hasLabel ? "px-3" : "w-10",
          "rounded-t-[10px] rounded-b-none border-x border-t border-neutral-200",
          "text-neutral-400",
          isExpanded ? "bg-white" : (collapsedClassName ?? "bg-white"),
          "transition-colors hover:bg-neutral-100 hover:text-neutral-600",
          canResize || isResizing
            ? "cursor-row-resize"
            : "hover:cursor-pointer",
        ])}
        aria-label={
          isExpanded
            ? `Collapse ${label ?? ""}`.trim()
            : `Expand ${label ?? ""}`
        }
      >
        {label ? (
          <span className="text-[10px] font-medium">{label}</span>
        ) : null}
        {isExpanded && showExpandedCloseIcon ? (
          <X size={10} className="shrink-0" />
        ) : null}
      </button>
      {trailingAccessory ? (
        <div
          className={cn([
            "pointer-events-none ml-1 flex h-5 items-center",
            "opacity-0 transition-opacity",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          ])}
        >
          {trailingAccessory}
        </div>
      ) : null}
    </div>
  );
}
