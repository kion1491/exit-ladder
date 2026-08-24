"use client";

/*
  계산기 전체를 묶는 최상위 컴포넌트.
  탭 하나가 계산기 한 대이고, 화면에는 활성 탭의 내용만 보인다.

  좁은 화면: 탭 → 폼 → 결과 → 규칙 → 저장 세로 흐름.
  820px 이상: 입력(왼쪽 2) : 결과(오른쪽 3) 2단이고, 저장은 그 아래 전체 폭.
  마크업 순서가 곧 화면·스크린리더 순서다 — 트릭 없이 grid 배치만 쓴다.
*/
import { LadderForm } from "@/components/ladder-form";
import { Results } from "@/components/results";
import { SaveCard } from "@/components/save-card";
import { TabBar } from "@/components/tab-bar";
import { Clock } from "lucide-react";
import { formatSavedAt } from "@/lib/ladder-state";
import { useLadderTabs } from "@/lib/use-ladder-tabs";

export function Calculator() {
  const {
    tabs, activeId, inputs, derived, activeSavedAt,
    setActiveId, setField, addTab, closeTab, reorderTabs, openRecord, markSaved,
  } = useLadderTabs();

  return (
    <>
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeTab}
        onAdd={addTab}
        onReorder={reorderTabs}
      />

      {/*
        탭을 바꾸면 이 영역의 내용이 통째로 바뀐다.
        key에 활성 탭 id를 주어, 탭 전환이 '같은 화면의 값 변경'이 아니라
        '다른 화면으로 교체'로 처리되게 한다(입력 커서·스크롤 상태가 섞이지 않는다).
      */}
      <div
        key={activeId}
        id="ladder-panel"
        role="tabpanel"
        aria-labelledby={"tab-" + activeId}
        className="grid gap-3 min-[820px]:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] min-[820px]:items-start min-[820px]:gap-x-8"
      >
        <div className="space-y-2">
          {/* 저장한 적 있는 계획이면 언제 저장한 것인지 알려준다 */}
          {activeSavedAt && (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Clock className="size-3.5" />
              <span>
                <strong className="font-medium text-foreground">
                  {formatSavedAt(activeSavedAt)}
                </strong>
                에 저장한 계획
              </span>
            </p>
          )}
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

      </div>

      {/*
        저장 카드는 탭 바깥에 둔다.
        탭 하나에 속한 것이 아니라 '지금 보는 탭을 저장하고, 저장된 것들을 불러오는'
        공용 도구이기 때문이다. 안에 두면 기록을 하나 열 때마다 탭이 갈리면서
        불러온 목록이 사라져, 여러 개를 연달아 열 수 없다.
      */}
      <div className="mt-3">
        <SaveCard
          inputs={inputs}
          result={derived.result}
          onOpenRecord={openRecord}
          onSaved={markSaved}
        />
      </div>
    </>
  );
}
