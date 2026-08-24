"use client";

/*
  저장 카드 — 계획을 구글시트에 한 줄 스냅샷으로 남기고, 목록을 카드로 조회한다.
  계산기는 저장 없이도 완전히 동작한다. 저장 실패가 계산을 방해하는 일은 없다.
*/
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, parseNumber } from "@/lib/calc";
import {
  fetchPlans, formatRecordDate, readConnection, savePlan, writeConnection,
  type GasConnection,
} from "@/lib/gas";
import type { LadderInputs, LadderResult } from "@/lib/ladder-state";

interface SaveCardProps {
  inputs: LadderInputs;
  /** 검증 실패 상태면 null — 저장할 결과가 없다 */
  result: LadderResult | null;
  /** 저장된 기록을 새 탭으로 여는 함수 */
  onOpenRecord: (row: unknown[]) => void;
}

/*
  sonner의 알림 영역은 항상 polite라 오류의 긴급함이 전달되지 않는다.
  그래서 오류만은 우리가 직접 둔 role="alert" 리전(아래 SaveCard 안)에도 같이 실어,
  "하던 일을 끊고서라도 알린다"는 이전 버전의 접근성 수준을 유지한다.
  시각 구분(성공 초록/오류 빨강)은 Toaster의 richColors가 담당한다.
*/

export function SaveCard({ inputs, result, onOpenRecord }: SaveCardProps) {
  const [connection, setConnection] = useState<GasConnection>({ url: "", key: "" });
  const [alertText, setAlertText] = useState("");

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState(false);
  const [records, setRecords] = useState<unknown[][] | null>(null);

  /*
    지난번에 넣어둔 설정(이전 버전과 같은 localStorage 키)을 되살린다.
    서버는 localStorage를 모르므로 첫 화면은 빈 값으로 그리고,
    마운트 직후 딱 한 번 실제 값으로 바꾼다 — 클라이언트 전용 저장소를
    hydration 안전하게 읽는 표준 패턴이라 아래 규칙 예외는 의도된 것이다.
  */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnection(readConnection());
  }, []);

  const updateConnection = (patch: Partial<GasConnection>) => {
    setConnection((prev) => {
      const next = { ...prev, ...patch };
      writeConnection(next);
      return next;
    });
  };

  /** 웹앱 주소·키가 준비됐는지 확인. 없으면 설정을 펼쳐 어디를 채울지 보여준다 */
  const ensureConnection = (): GasConnection | null => {
    if (!connection.url.trim() || !connection.key.trim()) {
      setSettingsOpen(true);
      notify("저장 설정에 웹앱 주소와 키를 먼저 넣어주세요.", true);
      return null;
    }
    return connection;
  };

  const handleSave = async () => {
    if (!result) {
      notify("계산 결과가 있어야 저장할 수 있습니다.", true);
      return;
    }
    const conn = ensureConnection();
    if (!conn) return;

    setSaving(true);
    try {
      await savePlan(conn, {
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
      notify("저장했습니다.", false);
    } catch (error) {
      notify(`저장 실패: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      setSaving(false);
    }
  };

  const handleList = async () => {
    const conn = ensureConnection();
    if (!conn) return;

    setListing(true);
    try {
      setRecords(await fetchPlans(conn));
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

        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1 border-t pt-3 text-xs text-muted-foreground">
            저장 설정 (웹앱 주소 · 키)
            <ChevronDown className={`size-3 transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <div className="space-y-2">
              <Label htmlFor="gas-url">Apps Script 웹앱 URL</Label>
              <Input
                id="gas-url"
                type="url"
                inputMode="url"
                value={connection.url}
                onChange={(event) => updateConnection({ url: event.target.value })}
                placeholder="https://script.google.com/macros/s/.../exec"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gas-key">키</Label>
              <Input
                id="gas-key"
                value={connection.key}
                onChange={(event) => updateConnection({ key: event.target.value })}
                placeholder="Apps Script의 KEY 값과 같아야 합니다"
                autoComplete="off"
                aria-describedby="gas-hint"
              />
              <p id="gas-hint" className="text-[11px] text-muted-foreground">
                이 브라우저에만 기억됩니다. 배포 방법은 README를 참고하세요.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {records !== null && (
          <div aria-live="polite" className="space-y-2">
            {records.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">아직 저장된 계획이 없습니다.</p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground">
                  누르면 탭으로 열립니다. 이미 열어둔 계획은 그 탭으로 이동합니다.
                </p>
                {records.map((row, index) => (
                  /*
                    시트 한 줄 칸 순서(기획서 7.3절):
                    0 날짜 · 1 종목명 · 2 시장 · 3 매수가 · 4 손절가 ·
                    5 분할수 · 6 손익비 · 7 매도가 · 8 예산 · 9 상한가 · 10 메모
                  */
                  <button
                    key={index}
                    type="button"
                    onClick={() => onOpenRecord(row)}
                    title="탭으로 열기"
                    className="w-full rounded-lg border bg-muted/40 p-3 text-left transition-colors hover:border-profit hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-bold">{String(row[1] || "(무명)")}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRecordDate(row[0])}
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
                ))}
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
