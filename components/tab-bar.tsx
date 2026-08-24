"use client";

/*
  계산기 탭 줄.
  - 클릭/화살표로 전환, 닫기 버튼으로 닫기
  - 드래그로 순서 바꾸기 (마우스·터치 모두 되도록 포인터 이벤트를 직접 다룬다.
    HTML5 드래그앤드롭은 모바일에서 아예 동작하지 않는다)
  - 키보드만 쓰는 사람을 위해 Ctrl+←/→로도 순서를 바꿀 수 있다
*/
import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { getTabTitle, type LadderTab } from "@/lib/ladder-state";

interface TabBarProps {
  tabs: LadderTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onReorder: (from: number, to: number) => void;
}

/** 드래그가 아니라 '누른 것'으로 볼 여유 거리(px) */
const DRAG_THRESHOLD = 6;

export function TabBar({ tabs, activeId, onSelect, onClose, onAdd, onReorder }: TabBarProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /** 포인터가 지금 몇 번째 탭 위에 있는지 (탭 가운데를 기준으로 판정) */
  const findIndexAt = (clientX: number): number | null => {
    const list = listRef.current;
    if (!list) return null;
    const items = [...list.querySelectorAll<HTMLElement>('[data-tab-id]')];
    for (let i = 0; i < items.length; i++) {
      const box = items[i].getBoundingClientRect();
      if (clientX < box.left + box.width / 2) return i;
    }
    return items.length - 1;
  };

  const handlePointerDown = (event: React.PointerEvent, id: string) => {
    // 닫기 버튼을 누른 경우는 드래그로 보지 않는다
    if ((event.target as HTMLElement).closest("[data-close]")) return;
    dragRef.current = { id, startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
      drag.moved = true;
      setDraggingId(drag.id);
    }

    const from = tabs.findIndex((tab) => tab.id === drag.id);
    const to = findIndexAt(event.clientX);
    if (to !== null && from !== -1 && to !== from) onReorder(from, to);
  };

  const endDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraggingId(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // 끌어서 옮긴 직후라면 뒤따라오는 클릭을 한 번 무시한다
    justDraggedRef.current = Boolean(drag?.moved);
  };

  /*
    탭 전환은 click으로 처리한다.
    포인터 이벤트만으로 처리하면 키보드·보조기기가 만드는 클릭을 놓친다.
  */
  const handleClick = (id: string) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onSelect(id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const tab = tabs[index];

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      const next = (index + step + tabs.length) % tabs.length;

      if (event.ctrlKey || event.metaKey) {
        onReorder(index, next);   // 순서 바꾸기
      } else {
        onSelect(tabs[next].id);  // 전환
        // 옮겨간 탭으로 포커스도 따라간다
        requestAnimationFrame(() => {
          listRef.current
            ?.querySelector<HTMLElement>(`[data-tab-id="${tabs[next].id}"]`)
            ?.focus();
        });
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onClose(tab.id);
    }
  };

  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
      <div ref={listRef} role="tablist" aria-label="계산기 탭" className="flex items-center gap-1">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        const title = getTabTitle(tab.inputs);
        return (
          <div
            key={tab.id}
            data-tab-id={tab.id}
            id={"tab-" + tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls="ladder-panel"
            tabIndex={isActive ? 0 : -1}
            title={title}
            onPointerDown={(event) => handlePointerDown(event, tab.id)}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={() => handleClick(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex shrink-0 cursor-pointer touch-none select-none items-center gap-1 rounded-t-lg border-b-2 px-3 py-2 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground ${
              isActive
                ? "border-profit bg-card font-bold"
                : "border-transparent text-muted-foreground hover:bg-muted"
            } ${draggingId === tab.id ? "opacity-50" : ""}`}
          >
            <span className="max-w-[10rem] truncate">{title}</span>
            <button
              type="button"
              data-close
              aria-label={`${title} 탭 닫기`}
              onClick={() => onClose(tab.id)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      </div>

      {/* 새 탭 버튼은 tablist 바깥에 둔다 — tablist의 직계 자식은 탭이어야 한다 */}
      <button
        type="button"
        onClick={onAdd}
        aria-label="새 탭 열기"
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
