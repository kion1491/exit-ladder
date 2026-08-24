"use client";

/*
  여러 계산기를 탭으로 다루는 훅.
  탭 하나가 계산기 한 대이고, 활성 탭의 입력만 화면에 보인다.
  계산·복원·이동 규칙은 전부 lib/ladder-state.ts의 순수 함수에 있고,
  여기서는 그것들을 React 상태에 이어 붙이고 브라우저에 기억시키는 일만 한다.
*/
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  INITIAL_INPUTS, closeTabAt, computeDerived, getRecordKey, getRecordSavedAt, moveItem,
  recordToInputs, type LadderDerived, type LadderInputs, type LadderTab,
} from "@/lib/ladder-state";

const STORAGE_KEY = "ladder.tabs";

/*
  첫 탭의 id는 고정값을 쓴다.
  서버가 미리 그린 화면과 브라우저가 처음 그린 화면이 같아야 하는데,
  무작위 id를 쓰면 둘이 어긋나기 때문이다.
*/
const FIRST_TAB_ID = "tab-1";

let idCounter = 0;
const makeId = () => `tab-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

const createTab = (
  inputs?: Partial<LadderInputs>,
  sourceKey: string | null = null,
  savedAt: string | null = null,
): LadderTab => ({
  id: makeId(),
  inputs: { ...INITIAL_INPUTS, ...inputs },
  sourceKey,
  savedAt,
});

interface StoredState {
  tabs: LadderTab[];
  activeId: string;
}

/** 브라우저에 기억해 둔 탭을 읽는다. 손상됐거나 접근이 막히면 조용히 포기한다. */
function readStored(): StoredState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed?.tabs) || parsed.tabs.length === 0) return null;

    // 저장된 모양이 지금 형식과 맞는 것만 살린다
    const tabs = parsed.tabs
      .filter((tab) => tab && typeof tab.id === "string" && tab.inputs)
      .map((tab) => ({
        id: tab.id,
        inputs: { ...INITIAL_INPUTS, ...tab.inputs },
        sourceKey: typeof tab.sourceKey === "string" ? tab.sourceKey : null,
        savedAt: typeof tab.savedAt === "string" ? tab.savedAt : null,
      }));
    if (tabs.length === 0) return null;

    const activeId = tabs.some((tab) => tab.id === parsed.activeId) ? parsed.activeId : tabs[0].id;
    return { tabs, activeId };
  } catch {
    return null;
  }
}

function writeStored(state: StoredState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 기억해두지 못할 뿐, 이번 세션에서 쓰는 데는 지장이 없다
  }
}

export function useLadderTabs() {
  /*
    탭 목록과 '지금 어느 탭인지'는 항상 함께 움직인다.
    (탭을 닫으면 활성도 옮겨가고, 탭을 열면 그 탭이 활성이 된다)
    따로 두면 상태를 바꾸는 함수 안에서 다른 상태를 또 건드리게 되는데,
    그건 React가 보장해주지 않는 방식이라 한 덩어리로 묶었다.
  */
  const [state, setState] = useState<StoredState>({
    tabs: [{ id: FIRST_TAB_ID, inputs: { ...INITIAL_INPUTS }, sourceKey: null, savedAt: null }],
    activeId: FIRST_TAB_ID,
  });
  const { tabs, activeId } = state;
  const [restored, setRestored] = useState(false);

  // 지난번에 열어둔 탭을 되살린다 (서버는 localStorage를 모르므로 마운트 후 한 번)
  useEffect(() => {
    const stored = readStored();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (stored) setState(stored);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setActiveId = useCallback((id: string) => {
    setState((prev) => {
      // 없는 탭으로는 옮기지 않는다 (활성 탭은 늘 목록 안에 있어야 한다)
      if (prev.activeId === id || !prev.tabs.some((tab) => tab.id === id)) return prev;
      return { ...prev, activeId: id };
    });
  }, []);

  /*
    복원이 끝난 뒤부터 변경을 기억시킨다 (복원 전에 쓰면 기본값이 덮어쓴다).
    타이핑 한 글자마다 전체 탭을 직렬화하면 낭비라, 손이 멈춘 뒤에 한 번만 쓴다.
  */
  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => writeStored(state), 400);
    return () => clearTimeout(timer);
  }, [state, restored]);

  /*
    같은 사이트를 브라우저 탭 두 개로 열어둔 경우.
    다른 쪽에서 탭을 바꾸면 이쪽도 따라가야, 나중에 쓴 쪽이 상대의 작업을
    조용히 덮어쓰는 일이 없다. (내가 편집 중이면 끼어들지 않는다)
  */
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const stored = readStored();
      if (stored) setState(stored);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

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

  const closeTab = useCallback((targetId: string) => {
    setState((prev) => closeTabAt(prev.tabs, prev.activeId, targetId, makeId));
  }, []);

  /** 탭을 from 자리에서 to 자리로 옮긴다 */
  const reorderTabs = useCallback((from: number, to: number) => {
    setState((prev) => ({ ...prev, tabs: moveItem(prev.tabs, from, to) }));
  }, []);

  /**
   * 저장 목록의 기록 하나를 탭으로 연다.
   * 이미 열어둔 기록이면 새로 만들지 않고 그 탭으로 보낸다.
   */
  const openRecord = useCallback((row: unknown[]) => {
    const key = getRecordKey(row);
    setState((prev) => {
      const existing = prev.tabs.find((tab) => tab.sourceKey === key);
      if (existing) return { ...prev, activeId: existing.id };
      const tab = createTab(recordToInputs(row), key, getRecordSavedAt(row));
      return { tabs: [...prev.tabs, tab], activeId: tab.id };
    });
  }, []);

  /** 방금 저장한 계획에 저장 시각을 새긴다 */
  const markSaved = useCallback((savedAt: string) => {
    setState((prev) => ({
      ...prev,
      tabs: prev.tabs.map((tab) =>
        tab.id === prev.activeId ? { ...tab, savedAt } : tab,
      ),
    }));
  }, []);

  const derived: LadderDerived = useMemo(
    () => computeDerived(activeTab.inputs),
    [activeTab.inputs],
  );

  return {
    tabs,
    activeId,
    inputs: activeTab.inputs,
    derived,
    setActiveId,
    setField,
    addTab,
    closeTab,
    reorderTabs,
    openRecord,
    markSaved,
    activeSavedAt: activeTab.savedAt,
  };
}
