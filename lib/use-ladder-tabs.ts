"use client";

/*
  여러 계산기를 탭으로 다루는 훅.

  탭 하나 = 계획 하나다.
  저장된 계획은 로그인하면 자동으로 탭이 되어 열려 있고,
  같은 탭에서 다시 저장하면 그 계획이 갱신된다(새 계획이 생기지 않는다).
  탭을 닫는 것은 그 계획을 지우는 일이다.

  아직 저장하지 않은 탭만 이 브라우저에 기억해 둔다 —
  저장된 것들의 원본은 서버에 있으므로 굳이 여기 둘 필요가 없다.
*/
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INITIAL_INPUTS, closeTabAt, computeDerived, moveItem,
  type LadderDerived, type LadderInputs, type LadderTab, type StoredPlan,
} from "@/lib/ladder-state";

/** 아직 저장하지 않은 탭만 기억해 둔다 */
const DRAFT_KEY = "ladder.drafts";

/*
  첫 탭의 id는 고정값을 쓴다.
  서버가 미리 그린 화면과 브라우저가 처음 그린 화면이 같아야 하는데,
  무작위 id를 쓰면 둘이 어긋나기 때문이다.
*/
const FIRST_TAB_ID = "tab-1";

let idCounter = 0;
const makeId = () => `tab-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function createTab(inputs?: Partial<LadderInputs>): LadderTab {
  return {
    id: makeId(),
    inputs: { ...INITIAL_INPUTS, ...inputs },
    planId: null,
    savedAt: null,
    createdAt: null,
  };
}

function planToTab(plan: StoredPlan): LadderTab {
  return {
    id: makeId(),
    inputs: plan.inputs,
    planId: plan.id,
    savedAt: plan.savedAt,
    createdAt: plan.createdAt,
  };
}

const isDraft = (tab: LadderTab) => tab.planId === null;

/* ── 저장하지 않은 탭 기억하기 ──────────────────────────────────── */

function readDrafts(): LadderTab[] {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LadderTab[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tab) => tab && typeof tab.id === "string" && tab.inputs)
      .map((tab) => ({
        id: tab.id,
        inputs: { ...INITIAL_INPUTS, ...tab.inputs },
        planId: null,
        savedAt: null,
        createdAt: null,
      }));
  } catch {
    return [];
  }
}

function writeDrafts(tabs: LadderTab[]): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(tabs.filter(isDraft)));
  } catch {
    // 기억해두지 못할 뿐, 이번 세션에서 쓰는 데는 지장이 없다
  }
}

interface TabsState {
  tabs: LadderTab[];
  activeId: string;
}

export function useLadderTabs() {
  const [state, setState] = useState<TabsState>({
    tabs: [{ ...createTab(), id: FIRST_TAB_ID }],
    activeId: FIRST_TAB_ID,
  });
  const [loaded, setLoaded] = useState(false);
  const { tabs, activeId } = state;

  /**
   * 서버의 계획들을 탭으로 펼친다.
   * 저장하지 않고 쓰던 탭은 그대로 두고 뒤에 이어 붙인다.
   */
  const openPlans = useCallback((plans: StoredPlan[]) => {
    setState((prev) => {
      const drafts = prev.tabs.filter(isDraft);
      const opened = plans.map(planToTab);

      // 열 것이 하나도 없으면 빈 화면 대신 새 탭 한 장을 세운다
      const next = [...opened, ...drafts];
      if (next.length === 0) next.push(createTab());

      const stillThere = next.some((tab) => tab.id === prev.activeId);
      return { tabs: next, activeId: stillThere ? prev.activeId : next[0].id };
    });
    setLoaded(true);
  }, []);

  // 쓰던 중이던 탭을 되살린다 (서버 계획은 openPlans로 따로 들어온다)
  useEffect(() => {
    const drafts = readDrafts();
    if (drafts.length === 0) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setState((prev) => ({
      tabs: [...prev.tabs.filter((tab) => tab.id !== FIRST_TAB_ID), ...drafts],
      activeId: prev.activeId === FIRST_TAB_ID ? drafts[0].id : prev.activeId,
    }));
  }, []);

  // 저장하지 않은 탭만, 손이 멈춘 뒤에 기억시킨다
  useEffect(() => {
    const timer = setTimeout(() => writeDrafts(tabs), 400);
    return () => clearTimeout(timer);
  }, [tabs]);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const setActiveId = useCallback((id: string) => {
    setState((prev) => {
      if (prev.activeId === id || !prev.tabs.some((tab) => tab.id === id)) return prev;
      return { ...prev, activeId: id };
    });
  }, []);

  const setField = useCallback(
    <K extends keyof LadderInputs>(key: K, value: LadderInputs[K]) => {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) =>
          tab.id === prev.activeId ? { ...tab, inputs: { ...tab.inputs, [key]: value } } : tab,
        ),
      }));
    },
    [],
  );

  const addTab = useCallback(() => {
    setState((prev) => {
      const tab = createTab();
      return { tabs: [...prev.tabs, tab], activeId: tab.id };
    });
  }, []);

  /** 화면에서 탭을 치운다 (서버에서 지우는 일은 부르는 쪽이 따로 한다) */
  const removeTab = useCallback((targetId: string) => {
    setState((prev) => closeTabAt(prev.tabs, prev.activeId, targetId, makeId));
  }, []);

  const reorderTabs = useCallback((from: number, to: number) => {
    setState((prev) => ({ ...prev, tabs: moveItem(prev.tabs, from, to) }));
  }, []);

  /** 저장에 성공했을 때 — 이제 이 탭은 서버의 계획과 이어진다 */
  const markSaved = useCallback((tabId: string, planId: string, savedAt: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.id === tabId
          ? { ...tab, planId, savedAt, createdAt: tab.createdAt ?? savedAt }
          : tab,
      ),
    }));
  }, []);

  /** 지웠던 계획을 되살린다 (실행 취소) — 원래 자리에 다시 꽂는다 */
  const restorePlan = useCallback((plan: StoredPlan, index: number) => {
    setState((prev) => {
      const tab = planToTab(plan);
      const tabs = prev.tabs.slice();
      tabs.splice(Math.max(0, Math.min(tabs.length, index)), 0, tab);
      return { tabs, activeId: tab.id };
    });
  }, []);

  const derived: LadderDerived = useMemo(
    () => computeDerived(activeTab.inputs),
    [activeTab.inputs],
  );

  return {
    tabs,
    activeId,
    activeTab,
    inputs: activeTab.inputs,
    derived,
    loaded,
    setActiveId,
    setField,
    addTab,
    removeTab,
    reorderTabs,
    markSaved,
    openPlans,
    restorePlan,
  };
}
