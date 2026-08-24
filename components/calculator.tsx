"use client";

/*
  계산기 전체를 묶는 최상위 컴포넌트.
  좁은 화면: 폼 → 결과 → 규칙 → (저장) 세로 흐름.
  820px 이상: 입력(왼쪽 2) : 결과(오른쪽 3) 2단, 저장은 하단 전체 폭.
  마크업 순서가 곧 화면·스크린리더 순서다 — 트릭 없이 grid 배치만 쓴다.
*/
import { LadderForm } from "@/components/ladder-form";
import { Results } from "@/components/results";
import { SaveCard } from "@/components/save-card";
import { useLadder } from "@/lib/use-ladder";

export function Calculator() {
  const { inputs, setField, derived } = useLadder();

  return (
    <div className="grid gap-3 min-[820px]:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] min-[820px]:items-start min-[820px]:gap-x-8">
      <div>
        <LadderForm inputs={inputs} setField={setField} />
      </div>

      <div className="space-y-3">
        {!derived.ok && (
          <div
            role="alert"
            className="rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger"
          >
            <ul className="list-disc pl-4">
              {derived.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {derived.ok && derived.result && (
          <Results result={derived.result} market={inputs.market} />
        )}

        {/* 계산 결과와 무관하게 항상 붙어 있어야 하는 운용 규칙 */}
        <p className="border-l-2 border-foreground pl-3 text-[13px] font-medium leading-relaxed">
          1차 매도가(+1R) 체결 시 손절을 본전으로. 손절 이동은 위로만. 최종가가
          비현실적이면 이 거래는 하지 않는다.
        </p>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          순손익은 왕복 거래비용 0.3% 반영 · 매도가는 호가단위 내림
        </p>
      </div>

      {/* 저장은 두 컬럼 아래 전체 폭 — 마크업 순서상 결과 뒤라 스크린리더도 결과를 먼저 만난다 */}
      <div className="min-[820px]:col-span-2">
        <SaveCard inputs={inputs} result={derived.result} />
      </div>
    </div>
  );
}
