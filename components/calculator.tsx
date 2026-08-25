"use client";

/*
  계산기 전체를 묶는 최상위 컴포넌트.

  탭 하나 = 계획 하나다. 로그인하면 저장해 둔 계획들이 자동으로 탭이 되어 열린다.
  같은 탭에서 다시 저장하면 그 계획이 갱신되고(새 계획이 생기지 않는다),
  탭을 닫는 것은 그 계획을 지우는 일이다 — 그래서 한 번 묻고, 지운 뒤에도 되돌릴 수 있다.

  좁은 화면: 탭 → 폼 → 결과 → 규칙 → 저장 세로 흐름.
  820px 이상: 입력(왼쪽 2) : 결과(오른쪽 3) 2단이고, 저장은 그 아래 전체 폭.
*/
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { LadderForm } from "@/components/ladder-form";
import { Results } from "@/components/results";
import { SaveCard } from "@/components/save-card";
import { TabBar } from "@/components/tab-bar";
import { CloseTabDialog } from "@/components/close-tab-dialog";
import { formatPrice, parseNumber } from "@/lib/calc";
import { formatSavedAt, getTabTitle, rowToPlan, type LadderTab, type StoredPlan } from "@/lib/ladder-state";
import { deletePlan, fetchPlans, savePlan } from "@/lib/gas";
import { useLadderTabs } from "@/lib/use-ladder-tabs";

export function Calculator() {
  const {
    tabs, activeId, activeTab, inputs, derived, loaded,
    setActiveId, setField, addTab, removeTab, reorderTabs,
    markSaved, openPlans, restorePlan,
  } = useLadderTabs();

  const [saving, setSaving] = useState(false);
  // 닫으려는(=지우려는) 탭. 확인을 기다리는 동안 여기 담긴다
  const [closing, setClosing] = useState<LadderTab | null>(null);

  /* ── 저장해 둔 계획 불러오기 ─────────────────────────────────── */

  const loadedOnce = useRef(false);
  const loadPlans = useCallback(async () => {
    try {
      const rows = await fetchPlans();
      const plans = rows.map(rowToPlan).filter((plan): plan is StoredPlan => plan !== null);
      openPlans(plans);
    } catch (error) {
      toast.error(
        `저장한 계획을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      );
      openPlans([]);   // 못 불러와도 계산기는 쓸 수 있어야 한다
    }
  }, [openPlans]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void loadPlans();
  }, [loadPlans]);

  /* ── 저장 ────────────────────────────────────────────────────── */

  /** 지금 탭의 내용을 서버에 보낼 형태로 만든다 */
  const buildPayload = (tab: LadderTab) => {
    const result = derived.result;
    return {
      id: tab.planId,
      createdAt: tab.createdAt,
      name: tab.inputs.name.trim() || "(무명)",
      market: tab.inputs.market,
      entry: result?.entry ?? parseNumber(tab.inputs.entryText),
      stop: result?.stop ?? parseNumber(tab.inputs.stopText),
      splits: tab.inputs.splits,
      ratio: result?.ratio ?? parseNumber(tab.inputs.ratioText),
      sells: result
        ? result.ladder.map((row) => formatPrice(row.price, tab.inputs.market)).join(" / ")
        : "",
      // 예산은 국내 시장 전용 — 미국 계획에 엉뚱한 값이 딸려가지 않게 한다
      budget: tab.inputs.market === "KR" ? toNumberOrBlank(tab.inputs.budgetText) : "",
      ceiling: toNumberOrBlank(tab.inputs.ceilingText),
      memo: tab.inputs.memo.trim(),
    };
  };

  const handleSave = async () => {
    if (!derived.result) {
      toast.error("계산 결과가 있어야 저장할 수 있습니다.");
      return;
    }
    setSaving(true);
    try {
      const isNew = activeTab.planId === null;
      const saved = await savePlan(buildPayload(activeTab));
      markSaved(activeTab.id, saved.id, saved.savedAt);
      toast.success(
        `${isNew ? "저장했습니다" : "갱신했습니다"} · ${formatSavedAt(saved.savedAt)}`,
      );
    } catch (error) {
      toast.error(`저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ── 탭 닫기 = 계획 지우기 ───────────────────────────────────── */

  const requestClose = (tabId: string) => {
    const target = tabs.find((tab) => tab.id === tabId);
    if (!target) return;
    // 저장한 적 없는 탭은 지울 것도 없으니 그냥 닫는다
    if (target.planId === null) {
      removeTab(tabId);
      return;
    }
    setClosing(target);
  };

  const confirmClose = async () => {
    const target = closing;
    if (!target?.planId) return;
    setClosing(null);

    const index = tabs.findIndex((tab) => tab.id === target.id);
    const title = getTabTitle(target.inputs);

    try {
      await deletePlan(target.planId);
      removeTab(target.id);

      /*
        지운 뒤에도 되돌릴 수 있게 한다.
        되살리기는 '원래 번호를 그대로 쓰는 저장'이라, 지우기 전과 똑같은 계획이 돌아온다.
      */
      toast.success(`${title} 계획을 지웠습니다.`, {
        action: {
          label: "실행 취소",
          onClick: () => void undoDelete(target, index),
        },
        duration: 8000,
      });
    } catch (error) {
      toast.error(`삭제 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const undoDelete = async (target: LadderTab, index: number) => {
    try {
      const saved = await savePlan({
        ...buildPayloadFrom(target),
        id: target.planId,
        createdAt: target.createdAt,
      });
      restorePlan(
        {
          id: saved.id,
          inputs: target.inputs,
          savedAt: saved.savedAt,
          createdAt: target.createdAt ?? saved.savedAt,
        },
        index,
      );
      toast.success(`${getTabTitle(target.inputs)} 계획을 되살렸습니다.`);
    } catch (error) {
      toast.error(`되살리지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /*
    되살릴 때는 그 탭의 입력으로 페이로드를 만든다.
    (지금 화면에 보이는 탭이 아니라 지워진 탭 기준이어야 한다)
  */
  const buildPayloadFrom = (tab: LadderTab) => {
    const entry = parseNumber(tab.inputs.entryText);
    const stop = parseNumber(tab.inputs.stopText);
    const ratio = parseNumber(tab.inputs.ratioText);
    return {
      id: tab.planId,
      createdAt: tab.createdAt,
      name: tab.inputs.name.trim() || "(무명)",
      market: tab.inputs.market,
      entry,
      stop,
      splits: tab.inputs.splits,
      ratio,
      sells: "",
      budget: tab.inputs.market === "KR" ? toNumberOrBlank(tab.inputs.budgetText) : "",
      ceiling: toNumberOrBlank(tab.inputs.ceilingText),
      memo: tab.inputs.memo.trim(),
    };
  };

  return (
    <>
      <TabBar
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={requestClose}
        onAdd={addTab}
        onReorder={reorderTabs}
      />

      {!loaded && (
        <p className="py-2 text-[12px] text-muted-foreground">저장한 계획을 불러오는 중…</p>
      )}

      <div
        key={activeId}
        id="ladder-panel"
        role="tabpanel"
        aria-labelledby={"tab-" + activeId}
        className="grid gap-3 min-[820px]:grid-cols-[minmax(300px,2fr)_minmax(0,3fr)] min-[820px]:items-start min-[820px]:gap-x-8"
      >
        <div className="space-y-2">
          {activeTab.savedAt && (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Clock className="size-3.5" />
              <span>
                <strong className="font-medium text-foreground">
                  {formatSavedAt(activeTab.savedAt)}
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

      <div className="mt-3">
        <SaveCard
          isSaved={activeTab.planId !== null}
          saving={saving}
          onSave={handleSave}
          onRefresh={loadPlans}
        />
      </div>

      <CloseTabDialog
        title={closing ? getTabTitle(closing.inputs) : ""}
        open={closing !== null}
        onCancel={() => setClosing(null)}
        onConfirm={confirmClose}
      />
    </>
  );
}

/** 입력창의 글자를 저장할 숫자로 (유효하지 않으면 빈 값) */
function toNumberOrBlank(text: string): number | "" {
  const value = parseNumber(text);
  return isFinite(value) && value > 0 ? value : "";
}
