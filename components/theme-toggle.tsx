"use client";

/*
  라이트/다크/시스템 전환 버튼.
  mounted 가드: 서버는 사용자의 테마를 모르므로, 첫 페인트에서는
  아이콘을 확정하지 않아야 화면이 어긋나지 않는다(hydration 안전).
*/
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 클라이언트에서만 true가 되는 안전한 mounted 판별 — 이펙트 없이 처리한다
const emptySubscribe = () => () => {};
const useMounted = () =>
  useSyncExternalStore(emptySubscribe, () => true, () => false);

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="화면 테마 바꾸기">
          {mounted ? (
            <>
              <Sun className="size-4 dark:hidden" />
              <Moon className="hidden size-4 dark:block" />
            </>
          ) : (
            <span className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>라이트</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>다크</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>시스템 설정</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
