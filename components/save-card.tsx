"use client";

/*
  저장 줄.
  예전에는 '저장 목록' 버튼을 눌러 카드로 조회했지만, 이제 저장된 계획은
  로그인하면 탭으로 이미 열려 있다 — 그래서 여기 남은 일은 저장뿐이다.
  (다른 기기에서 저장한 것을 가져오려면 '다시 불러오기')
*/
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SaveCardProps {
  /** 이미 저장된 계획이면 버튼 문구가 '갱신'이 된다 */
  isSaved: boolean;
  saving: boolean;
  onSave: () => void;
  onRefresh: () => void;
}

export function SaveCard({ isSaved, saving, onSave, onRefresh }: SaveCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={saving} className="min-w-[9rem]">
          {saving ? "저장 중…" : isSaved ? "이 계획 갱신" : "이 계획 저장"}
        </Button>
        <Button variant="outline" onClick={onRefresh} disabled={saving}>
          <RefreshCw className="size-3.5" />
          다시 불러오기
        </Button>
        <p className="w-full text-[11px] leading-relaxed text-muted-foreground">
          {isSaved
            ? "저장해 둔 계획입니다. 고친 내용을 저장하면 같은 계획이 갱신됩니다."
            : "저장하면 이 탭이 계획으로 남아, 다음에 들어와도 탭으로 열려 있습니다."}
        </p>
      </CardContent>
    </Card>
  );
}
