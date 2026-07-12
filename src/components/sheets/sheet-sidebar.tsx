"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  memo,
  useCallback,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import {
  Plus,
  Pencil,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

type Sheet = {
  id: string;
  title: string;
};

interface SheetTabItemProps {
  sheet: Sheet;
  isActive: boolean;
  isEditing: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dropPosition: "before" | "after" | null;
  onStartRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onPointerDown: (e: React.PointerEvent, sheetId: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onSubmitRename: (id: string) => void;
  onCancelRename: () => void;
}

const SheetTabItem = memo(function SheetTabItem({
  sheet,
  isActive,
  isEditing,
  onStartRename,
  onDuplicate,
  onDelete,
  onPointerDown,
  inputRef,
  editValue,
  onEditValueChange,
  onSubmitRename,
  onCancelRename,
  isDragging,
  isDropTarget,
  dropPosition,
}: SheetTabItemProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<"bottom" | "top">(
    "bottom",
  );
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        actionsRef.current &&
        !actionsRef.current.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
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

  useLayoutEffect(() => {
    if (!actionsOpen || !actionsRef.current || !menuRef.current) {
      if (!actionsOpen) setMenuPlacement("bottom");
      if (!actionsOpen) setMenuStyle(null);
      return;
    }

    const triggerRect = actionsRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - triggerRect.bottom - 12;
    const spaceAbove = triggerRect.top - 12;
    const placeTop = !(spaceBelow >= menuRect.height || spaceBelow >= spaceAbove);

    setMenuPlacement(placeTop ? "top" : "bottom");

    const left = Math.min(
      Math.max(triggerRect.right - menuRect.width, 8),
      viewportWidth - menuRect.width - 8,
    );
    const top = placeTop
      ? Math.max(8, triggerRect.top - menuRect.height - 4)
      : Math.min(viewportHeight - menuRect.height - 8, triggerRect.bottom + 4);

    setMenuStyle({
      position: "fixed",
      left,
      top,
      zIndex: 100,
    });
  }, [actionsOpen]);

  useLayoutEffect(() => {
    return () => {
      setActionsOpen(false);
    };
  }, []);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 px-3 py-1.5 cursor-grab select-none text-sm transition-colors shrink-0 border-r border-border/50 h-full active:cursor-grabbing",
        isActive
          ? "bg-background text-foreground border-t-2 border-t-primary"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border-t-2 border-t-transparent",
        isDragging && "opacity-40",
      )}
      data-sheet-id={sheet.id}
      onPointerDown={(e) => {
        if (isEditing) return;
        onPointerDown(e, sheet.id);
      }}

    >
      {isDropTarget && dropPosition === "before" && (
        <div className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
      )}
      {isDropTarget && dropPosition === "after" && (
        <div className="pointer-events-none absolute inset-y-1 right-0 w-0.5 rounded-full bg-primary" />
      )}

      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onBlur={() => onSubmitRename(sheet.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmitRename(sheet.id);
            if (e.key === "Escape") onCancelRename();
          }}
          className="bg-transparent outline-none text-sm border-b border-foreground/30 min-w-0 w-20"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate max-w-28 text-sm">{sheet.title}</span>
      )}

      {!isEditing && (
        <div className="relative shrink-0" ref={actionsRef}>
          <IconButton
            label="Sheet actions"
            draggable={false}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setActionsOpen((v) => !v);
            }}
            active={actionsOpen}
            className="size-5"
          >
            <ChevronDown className="size-3" />
          </IconButton>

          {actionsOpen && (
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                className={cn(
                  "min-w-44 rounded-lg border bg-popover p-1 shadow-md",
                  menuPlacement === "top" ? "origin-bottom-right" : "origin-top-right",
                  menuStyle && "menu-enter",
                )}
                style={menuStyle ?? { visibility: "hidden" }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartRename(sheet.id, sheet.title);
                    setActionsOpen(false);
                  }}
                >
                  <Pencil className="size-3.5" />
                  Rename
                </button>
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(sheet.id);
                    setActionsOpen(false);
                  }}
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(sheet.id);
                    setActionsOpen(false);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>
              </div>,
              document.body,
            )
          )}
        </div>
      )}
    </div>
  );
});

export const SheetSidebar = memo(function SheetSidebar() {
  const sheets = useStore((s) => s.sheets);
  const currentSheetId = useStore((s) => s.currentSheetId);
  const addSheet = useStore((s) => s.addSheet);
  const deleteSheet = useStore((s) => s.deleteSheet);
  const setCurrentSheet = useStore((s) => s.setCurrentSheet);
  const updateSheet = useStore((s) => s.updateSheet);
  const duplicateSheet = useStore((s) => s.duplicateSheet);
  const reorderSheets = useStore((s) => s.reorderSheets);

  const { addToast } = useToast();
  const confirm = useConfirm();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [draggingSheetId, setDraggingSheetId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const dragState = useRef({
    draggingId: null as string | null,
    dropTarget: null as { id: string; position: "before" | "after" } | null,
    didDrag: false,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      observer.disconnect();
    };
  }, [checkScroll, sheets.length]);

  const scrollBy = useCallback((dir: "left" | "right") => {
    scrollContainerRef.current?.scrollBy({
      left: dir === "left" ? -200 : 200,
      behavior: "smooth",
    });
  }, []);

  const handleAddSheet = useCallback(() => {
    const count = sheets.length + 1;
    addSheet(`Sheet ${count}`);
    addToast({ title: "Sheet created", variant: "success" });
    // Scroll to the right after adding
    requestAnimationFrame(() => {
      const el = scrollContainerRef.current;
      if (el) {
        el.scrollLeft = el.scrollWidth;
      }
    });
  }, [sheets.length, addSheet, addToast]);

  const handleStartRename = useCallback((id: string, title: string) => {
    setEditingId(id);
    setEditValue(title);
  }, []);

  const handleSubmitRename = useCallback(
    (id: string) => {
      if (editValue.trim()) {
        updateSheet(id, { title: editValue.trim() });
        addToast({ title: "Sheet renamed" });
      }
      setEditingId(null);
    },
    [editValue, updateSheet, addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const sheet = sheets.find((s) => s.id === id);
      const confirmed = await confirm({
        title: "Delete sheet",
        description: `Are you sure you want to delete "${sheet?.title ?? "Untitled"}"? All widgets on this sheet will be permanently removed.`,
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        variant: "destructive",
      });
      if (confirmed) {
        deleteSheet(id);
        addToast({ title: "Sheet deleted", variant: "destructive" });
      }
    },
    [sheets, confirm, deleteSheet, addToast],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      duplicateSheet(id);
      addToast({ title: "Sheet duplicated", variant: "success" });
    },
    [duplicateSheet, addToast],
  );

  const clearDragState = useCallback(() => {
    setDraggingSheetId(null);
    setDropTarget(null);
  }, []);

  const handleTabPointerDown = useCallback(
    (e: React.PointerEvent, sheetId: string) => {
      if (editingId) return;
      e.preventDefault();
      dragState.current.draggingId = sheetId;
      dragState.current.didDrag = false;
      dragState.current.startX = e.clientX;
      dragState.current.startY = e.clientY;
      setDraggingSheetId(sheetId);
      setDropTarget(null);
      const el = scrollContainerRef.current;
      if (el) {
        el.setPointerCapture(e.pointerId);
      }
    },
    [editingId],
  );

  const handleContainerPointerMove = useCallback(
    (_e: React.PointerEvent) => {
      const { draggingId } = dragState.current;
      if (!draggingId || !scrollContainerRef.current) return;

      const { startX, startY, didDrag } = dragState.current;
      if (!didDrag) {
        const dx = _e.clientX - startX;
        const dy = _e.clientY - startY;
        if (dx * dx + dy * dy > 25) {
          dragState.current.didDrag = true;
        } else {
          return;
        }
      }

      const tabs = scrollContainerRef.current.querySelectorAll<HTMLElement>(
        "[data-sheet-id]",
      );
      let best: { id: string; position: "before" | "after" } | null = null;
      let bestDist = Infinity;

      tabs.forEach((tab) => {
        const id = tab.getAttribute("data-sheet-id");
        if (!id || id === draggingId) return;
        const rect = tab.getBoundingClientRect();
        if (_e.clientX >= rect.left - 4 && _e.clientX <= rect.right + 4) {
          const mid = rect.left + rect.width / 2;
          const dist = Math.abs(_e.clientX - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = {
              id,
              position: _e.clientX < mid ? "before" : "after",
            };
          }
        }
      });

      dragState.current.dropTarget = best;
      setDropTarget(best);
    },
    [],
  );

  const handleContainerPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      const { draggingId, dropTarget: dt, didDrag } = dragState.current;
      dragState.current.draggingId = null;
      dragState.current.dropTarget = null;
      dragState.current.didDrag = false;

      if (draggingId && didDrag && dt && dt.id !== draggingId) {
        reorderSheets(draggingId, dt.id, dt.position);
      } else if (draggingId && !didDrag) {
        setCurrentSheet(draggingId);
      }
      clearDragState();
    },
    [reorderSheets, clearDragState, setCurrentSheet],
  );

  return (
    <div className="relative z-40 flex h-10 shrink-0 border-t border-border bg-muted/30">
      {/* New sheet button */}
      <div className="flex items-center border-r border-border px-1.5">
        <IconButton label="New Sheet" onClick={handleAddSheet}>
          <Plus className="size-4" />
        </IconButton>
      </div>

      {/* Scroll left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy("left")}
          className="flex items-center justify-center px-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
          aria-label="Scroll left"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      )}

      {/* Sheet tabs */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
      >
        {sheets.map((sheet) => {
          const isActive = sheet.id === currentSheetId;
          const isEditing = editingId === sheet.id;

          return (
            <SheetTabItem
              key={sheet.id}
              sheet={sheet}
              isActive={isActive}
              isEditing={isEditing}
              isDragging={draggingSheetId === sheet.id}
              isDropTarget={dropTarget?.id === sheet.id}
              dropPosition={dropTarget?.id === sheet.id ? dropTarget.position : null}
              onStartRename={handleStartRename}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onPointerDown={handleTabPointerDown}
              inputRef={inputRef}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onSubmitRename={handleSubmitRename}
              onCancelRename={() => setEditingId(null)}
            />
          );
        })}
      </div>

      {/* Scroll right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scrollBy("right")}
          className="flex items-center justify-center px-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
          aria-label="Scroll right"
        >
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
});
