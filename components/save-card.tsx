"use client";

/*
  저장 카드 — 계획을 구글시트에 한 줄 스냅샷으로 남기고, 목록을 카드로 조회한다.
  계산기는 저장 없이도 완전히 동작한다. 저장 실패가 계산을 방해하는 일은 없다.
*/
import { useState } from "react";
import { Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, parseNumber } from "@/lib/calc";
import { deletePlan, fetchPlans, savePlan } from "@/lib/gas";
import { formatSavedAt } from "@/lib/ladder-state";
import type { LadderInputs, LadderResult } from "@/lib/ladder-state";

interface SaveCardProps {
  inputs: LadderInputs;
  /** 검증 실패 상태면 null — 저장할 결과가 없다 */
  result: LadderResult | null;
  /** 저장된 기록을 새 탭으로 여는 함수 */
  onOpenRecord: (row: unknown[]) => void;
  /** 저장에 성공했을 때 그 시각을 알린다 */
  onSaved: (savedAt: string) => void;
}

/*
  sonner의 알림 영역은 항상 polite라 오류의 긴급함이 전달되지 않는다.
  그래서 오류만은 우리가 직접 둔 role="alert" 리전(아래 SaveCard 안)에도 같이 실어,
  "하던 일을 끊고서라도 알린다"는 이전 버전의 접근성 수준을 유지한다.
  시각 구분(성공 초록/오류 빨강)은 Toaster의 richColors가 담당한다.
*/

export function SaveCard({ inputs, result, onOpenRecord, onSaved }: SaveCardProps) {
  const [alertText, setAlertText] = useState("");
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState(false);
  const [records, setRecords] = useState<unknown[][] | null>(null);
  // 지우기 전 한 번 더 묻는 중인 기록 / 지금 지우는 중인 기록
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const notify = (message: string, isError: boolean) => {
    if (isError) {
      toast.error(message);
      // 같은 오류가 연달아 나도 다시 읽히도록 비웠다가 채운다
      setAlertText("");
      requestAnimationFrame(() => setAlertText(message));
    } else {
      toast.success(message);
    }
  };

  const handleSave = async () => {
    if (!result) {
      notify("계산 결과가 있어야 저장할 수 있습니다.", true);
      return;
    }
    setSaving(true);
    try {
      await savePlan({
        // 종목명·메모는 재계산을 돌리지 않으므로 저장 직전 inputs에서 최신값을 읽는다
        name: inputs.name.trim() || "(무명)",
        market: inputs.market,
        entry: result.entry,
        stop: result.stop,
        splits: result.ladder.length,
        ratio: result.ratio,
        sells: result.ladder.map((row) => formatPrice(row.price, inputs.market)).join(" / "),
        /*
          예산은 국내 시장 전용. 미국 시장에서는 입력칸만 감추고 값은 남겨두므로
          여기서 시장을 한 번 더 확인하지 않으면 미국 기록에 엉뚱한 예산이 딸려 간다.
          저장 기록은 고칠 화면이 없으니 처음부터 깨끗해야 한다.
        */
        budget: inputs.market === "KR" ? toBudgetValue(inputs.budgetText) : "",
        ceiling: result.ceilingPrice ?? "",
        memo: inputs.memo.trim(),
      });
      const savedAt = new Date().toISOString();
      onSaved(savedAt);
      notify(`저장했습니다 · ${formatSavedAt(savedAt)}`, false);
    } catch (error) {
      notify(`저장 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (savedAt: string, name: string) => {
    setDeletingKey(savedAt);
    try {
      await deletePlan(savedAt, name);
      // 목록을 다시 부르지 않고 화면에서만 걷어낸다 — 구글 왕복을 한 번 아낀다
      setRecords((prev) => prev?.filter((row) => String(row[0] ?? "") !== savedAt) ?? null);
      setConfirmKey(null);
      notify(`${name || "(무명)"} 계획을 지웠습니다.`, false);
    } catch (error) {
      notify(`삭제 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setDeletingKey(null);
    }
  };

  const handleList = async () => {
    setListing(true);
    try {
      setRecords(await fetchPlans());
      setConfirmKey(null);
    } catch (error) {
      notify(`목록 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setListing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">저장</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex max-w-md gap-2">
          <Button className="flex-1" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : "이 계획 저장"}
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleList} disabled={listing}>
            {listing ? "불러오는 중…" : "저장 목록"}
          </Button>
        </div>


        {records !== null && (
          <div aria-live="polite" className="space-y-2">
            {records.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">아직 저장된 계획이 없습니다.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  누르면 탭으로 열립니다. 이미 열어둔 계획은 그 탭으로 이동합니다.
                  오른쪽 휴지통으로 지울 수 있습니다.
                </p>
                {records.map((row, index) => {
                  /*
                    시트 한 줄 칸 순서(기획서 7.3절):
                    0 날짜 · 1 종목명 · 2 시장 · 3 매수가 · 4 손절가 ·
                    5 분할수 · 6 손익비 · 7 매도가 · 8 예산 · 9 상한가 · 10 메모
                  */
                  const savedAt = String(row[0] ?? "");
                  const name = String(row[1] ?? "");
                  const label = name || "(무명)";
                  const confirming = confirmKey === savedAt;

                  return (
                    <div
                      key={savedAt || index}
                      className="relative rounded-lg border bg-muted/40 transition-colors hover:border-profit"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenRecord(row)}
                        title="탭으로 열기"
                        className="w-full rounded-lg p-3 pr-10 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                      >
                        <div className="mb-1 flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-bold">{label}</span>
                          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-foreground">
                            <Clock className="size-3 text-muted-foreground" />
                            {formatSavedAt(savedAt)}
                          </span>
                        </div>
                        <div className="overflow-x-auto whitespace-nowrap text-[13px] font-medium text-profit">
                          {String(row[7] || "")}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {[
                            row[2] ? (row[2] === "US" ? "미국" : "국내") : null,
                            row[5] ? `${row[5]}분할` : null,
                            row[6] ? `손익비 ${Number(row[6]).toFixed(1)}` : null,
                            row[3] ? `매수 ${formatPrice(Number(row[3]), row[2] === "US" ? "US" : "KR")}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </button>

                      {/* 지우기 — 카드를 여는 버튼과 형제로 두어 버튼이 겹치지 않게 한다 */}
                      <button
                        type="button"
                        aria-label={`${label} 계획 지우기`}
                        onClick={() => setConfirmKey(confirming ? null : savedAt)}
                        className="absolute right-2 top-2 rounded p-1.5 text-muted-foreground hover:bg-danger-soft hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                      >
                        <Trash2 className="size-3.5" />
                      </button>

                      {/*
                        되돌릴 수 없는 일이라 한 번 더 묻는다.
                        카드 안에서 바로 확인하므로 어느 계획을 지우는지 헷갈릴 일이 없다.
                      */}
                      {confirming && (
                        <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
                          <span className="mr-auto text-[11px] text-danger">
                            지우면 되돌릴 수 없습니다.
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmKey(null)}
                            disabled={deletingKey === savedAt}
                          >
                            취소
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDelete(savedAt, name)}
                            disabled={deletingKey === savedAt}
                            className="bg-danger text-white hover:bg-danger/90"
                          >
                            {deletingKey === savedAt ? "지우는 중…" : "지우기"}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </CardContent>

      {/* 오류를 즉시(assertive) 알리는 스크린리더 전용 리전 */}
      <p role="alert" className="sr-only">{alertText}</p>
    </Card>
  );
}

/** 예산 입력 문자열을 저장용 숫자로 (유효하지 않으면 빈 값) */
function toBudgetValue(text: string): number | "" {
  const value = parseNumber(text);
  return isFinite(value) && value > 0 ? value : "";
}
