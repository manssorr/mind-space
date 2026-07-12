"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/store";
import { IconButton } from "@/components/ui/icon-button";
import { WidgetColorPalette } from "./widget-color-palette";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

interface WidgetToolbarProps {
  widgetId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  hideTitle?: boolean;
}

function stopPropagation(e: React.PointerEvent) {
  e.stopPropagation();
}

export const WidgetToolbar = memo(function WidgetToolbar({
  widgetId,
  collapsed,
  onToggleCollapse,
  onStartRename,
  hideTitle = false,
}: WidgetToolbarProps) {
  const widget = useStore((s) => s.widgets[widgetId]);
  const selectedWidgetIds = useStore((s) => s.selectedWidgetIds);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const handleAction = useCallback(
    (action: (id: string) => void, multiAction?: (ids: string[]) => void) => {
      const isMulti =
        selectedWidgetIds.includes(widgetId) && selectedWidgetIds.length > 1;
      if (isMulti && multiAction) {
        multiAction(selectedWidgetIds);
      } else {
        action(widgetId);
      }
    },
    [widgetId, selectedWidgetIds],
  );

  useEffect(() => {
    if (!actionsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(e.target as Node)
      ) {
        setActionsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [actionsOpen]);

  if (!widget) return null;

  return (
    <div className="flex items-center justify-between gap-0.5 w-full">
      <IconButton
        label={collapsed ? "Expand" : "Collapse"}
        onPointerDown={stopPropagation}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </IconButton>

      <div className="flex items-center justify-between w-full">
        {hideTitle ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <button
            onPointerDown={stopPropagation}
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
            className="flex h-6 min-w-24 max-w-48 flex-none items-center truncate rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Rename"
          >
            <span className="truncate">{widget.title}</span>
          </button>
        )}

        <div className="relative shrink-0" ref={actionsRef}>
          <IconButton
            label="Widget actions"
            onPointerDown={stopPropagation}
            onClick={(e) => {
              e.stopPropagation();
              setActionsOpen((v) => !v);
            }}
            active={actionsOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </IconButton>

          {actionsOpen && (
            <div
              className="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-lg border bg-popover p-1 shadow-md menu-enter origin-top-right"
              onPointerDown={stopPropagation}
            >
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const s = useStore.getState();
                  if (!s.currentSheetId) return;
                  handleAction(
                    (id) => s.duplicateWidget(s.currentSheetId!, id),
                    (ids) => s.duplicateWidgets(s.currentSheetId!, ids),
                  );
                  setActionsOpen(false);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Duplicate
              </button>

              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const s = useStore.getState();
                  if (!s.currentSheetId) return;
                  handleAction(
                    (id) => s.deleteWidgetAnimated(s.currentSheetId!, id),
                    (ids) => s.deleteWidgetsAnimated(s.currentSheetId!, ids),
                  );
                  setActionsOpen(false);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>

              <div className="h-px bg-border my-1" />

              <WidgetColorPalette
                currentId={widget.colorTheme}
                onSelect={(id) => {
                  useStore.getState().updateWidget(widgetId, {
                    colorTheme: id === "default" ? undefined : id,
                  });
                  setActionsOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
