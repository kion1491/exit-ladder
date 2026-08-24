"use client";

/*
  입력 폼 — 기획서 4장 입력 명세 전체.
  계산 버튼이 없다: 값이 바뀌는 즉시 부모(계산기)가 다시 계산한다.
*/
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { parseNumber } from "@/lib/calc";
import type { LadderInputs } from "@/lib/use-ladder";

interface LadderFormProps {
  inputs: LadderInputs;
  setField: <K extends keyof LadderInputs>(key: K, value: LadderInputs[K]) => void;
}

/** 선택 입력 라벨 옆에 붙는 작은 표시 */
function Optional({ children = "선택" }: { children?: string }) {
  return <span className="ml-1 text-[11px] font-normal text-muted-foreground">{children}</span>;
}

export function LadderForm({ inputs, setField }: LadderFormProps) {
  /*
    슬라이더는 1.0~5.0 구간을 '손으로 굴리기' 위한 도구일 뿐이다.
    직접 입력에는 상한을 두지 않는다(발주자 결정) — 말도 안 되는 손익비가
    만드는 말도 안 되는 매도가를 직접 보는 것이 이 도구의 목적이다.
    슬라이더 손잡이만 자기 범위 안에 머문다.
  */
  const parsedRatio = parseNumber(inputs.ratioText);
  const clampToSlider = (value: number) => Math.min(5, Math.max(1, value));
  /*
    입력을 지워 파싱이 안 되는 순간에도 슬라이더는 마지막 자리에 머문다(원본 동작).
    마지막 유효 위치는 이벤트 핸들러에서만 갱신한다 — 렌더 중에 기억을 만지면
    React 규칙(refs during render) 위반이다.
  */
  const [lastSliderValue, setLastSliderValue] = useState(2);
  const sliderValue = isFinite(parsedRatio) ? clampToSlider(parsedRatio) : lastSliderValue;

  return (
    <form noValidate onSubmit={(event) => event.preventDefault()} className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">진입 조건</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">종목명<Optional /></Label>
            <Input
              id="name"
              value={inputs.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="비워두면 (무명)으로 저장"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label id="market-label">시장</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              aria-labelledby="market-label"
              value={inputs.market}
              onValueChange={(value) => {
                // 이미 선택된 버튼을 다시 누르면 빈 값이 온다 — 선택 해제는 없어야 하므로 무시
                if (value === "KR" || value === "US") setField("market", value);
              }}
            >
              <ToggleGroupItem value="KR" className="flex-1">국내 (원)</ToggleGroupItem>
              <ToggleGroupItem value="US" className="flex-1">미국 ($)</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="entry">매수가</Label>
              <Input
                id="entry"
                inputMode="decimal"
                value={inputs.entryText}
                onChange={(event) => setField("entryText", event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stop">손절가</Label>
              <Input
                id="stop"
                inputMode="decimal"
                value={inputs.stopText}
                onChange={(event) => setField("stopText", event.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">사다리 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label id="splits-label">분할 수</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              aria-labelledby="splits-label"
              value={String(inputs.splits)}
              onValueChange={(value) => {
                if (value === "1" || value === "2" || value === "3") {
                  setField("splits", Number(value) as 1 | 2 | 3);
                }
              }}
            >
              <ToggleGroupItem value="1" className="flex-1">1분할</ToggleGroupItem>
              <ToggleGroupItem value="2" className="flex-1">2분할</ToggleGroupItem>
              <ToggleGroupItem value="3" className="flex-1">3분할</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ratio">손익비</Label>
            <div className="flex items-center gap-4">
              <Slider
                min={1}
                max={5}
                step={0.1}
                value={[sliderValue]}
                onValueChange={([value]) => {
                  setLastSliderValue(value);
                  setField("ratioText", value.toFixed(1));
                }}
                aria-label="손익비 슬라이더"
                className="flex-1"
              />
              <Input
                id="ratio"
                inputMode="decimal"
                value={inputs.ratioText}
                onChange={(event) => {
                  const typed = parseNumber(event.target.value);
                  if (isFinite(typed)) setLastSliderValue(clampToSlider(typed));
                  setField("ratioText", event.target.value);
                }}
                autoComplete="off"
                className="w-20 text-center"
                aria-describedby="ratio-hint"
              />
            </div>
            <p id="ratio-hint" className="text-[11px] text-muted-foreground">
              슬라이더는 1.0~5.0 구간만 다룹니다. 그 위 값은 직접 입력하세요.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">선택 입력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 예산은 원화 기준 계산이라 국내 시장에서만 보인다. 값은 지우지 않는다 —
              국내로 되돌아오면 그대로 살아난다 */}
          {inputs.market === "KR" && (
            <div className="space-y-2">
              <Label htmlFor="budget">예산<Optional>선택 · 원</Optional></Label>
              <Input
                id="budget"
                inputMode="decimal"
                value={inputs.budgetText}
                onChange={(event) => setField("budgetText", event.target.value)}
                placeholder="예: 1,000,000"
                autoComplete="off"
                aria-describedby="budget-hint"
              />
              <p id="budget-hint" className="text-[11px] text-muted-foreground">
                채우면 주수와 순손익까지 계산합니다.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ceiling">현실 상한가<Optional /></Label>
            <Input
              id="ceiling"
              inputMode="decimal"
              value={inputs.ceilingText}
              onChange={(event) => setField("ceilingText", event.target.value)}
              placeholder="여기까진 갈 수 있다 싶은 가격"
              autoComplete="off"
              aria-describedby="ceiling-hint"
            />
            <p id="ceiling-hint" className="text-[11px] text-muted-foreground">
              채우면 매도가가 이 선을 넘는지 도구가 먼저 알려줍니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="memo">메모<Optional /></Label>
            <Input
              id="memo"
              value={inputs.memo}
              onChange={(event) => setField("memo", event.target.value)}
              placeholder="저장할 때 함께 기록됩니다"
              autoComplete="off"
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
