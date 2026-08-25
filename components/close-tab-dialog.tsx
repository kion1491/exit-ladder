"use client";

/*
  탭을 닫기 전에 한 번 묻는 창.
  이 앱에서 탭을 닫는 것은 그 계획을 지우는 일이라, 실수로 사라지지 않게 막아준다.
  (지운 뒤에도 토스트의 '실행 취소'로 되돌릴 수 있다)

  라이브러리를 더 들이지 않고 직접 만들었다 — 버튼 두 개짜리 창이라 그럴 값어치가 없다.
*/
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

interface CloseTabDialogProps {
  title: string;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function CloseTabDialog({ title, open, onCancel, onConfirm }: CloseTabDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 창이 열리면 '지우기'에 초점을 두고, Esc로 닫을 수 있게 한다
  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="close-tab-title"
        aria-describedby="close-tab-desc"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg"
      >
        <h2 id="close-tab-title" className="text-base font-bold">
          {title} 계획을 지울까요?
        </h2>
        <p id="close-tab-desc" className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          탭을 닫으면 이 계획이 저장 목록에서도 지워집니다.
          지운 직후 잠깐 동안은 되돌릴 수 있습니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button
            ref={confirmRef}
            onClick={onConfirm}
            className="bg-danger text-white hover:bg-danger/90"
          >
            지우기
          </Button>
        </div>
      </div>
    </div>
  );
}
