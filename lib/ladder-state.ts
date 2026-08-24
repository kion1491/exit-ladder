/*
  계산기 한 대의 상태와 파생 계산 — 화면을 모르는 순수 로직.
  탭 하나가 곧 계산기 한 대다. 이 파일은 "계산기 한 대가 어떤 값을 갖고,
  그 값에서 무엇이 계산되는가"만 안다. 탭이 몇 개인지, 어느 게 활성인지는 모른다.
*/
import {
  calcBudget, calcLadder, calcMetrics, formatPrice, judgeCeiling, parseNumber, validateInputs,
  type BudgetResult, type CeilingVerdict, type LadderRow, type Market, type Metrics,
} from "@/lib/calc";

export interface LadderInputs {
  name: string;
  market: Market;
  entryText: string;
  stopText: string;
  splits: 1 | 2 | 3;
  ratioText: string;
  budgetText: string;
  ceilingText: string;
  memo: string;
}

export interface LadderResult {
  ladder: LadderRow[];
  /** 상한 입력값(유효할 때만) — 레일의 상한선 위치 계산에 쓴다 */
  ceilingPrice: number | null;
  metrics: Metrics;
  ceiling: CeilingVerdict | null;
  budget: BudgetResult | null;
  entry: number;
  stop: number;
  ratio: number;
}

export interface LadderDerived {
  ok: boolean;
  errors: string[];
  result: LadderResult | null;
}

/** 탭 하나 = 계산기 한 대 */
export interface LadderTab {
  id: string;
  inputs: LadderInputs;
  /**
   * 저장 목록에서 불러온 탭이면 그 기록의 식별자(날짜+종목명).
   * 같은 계획을 두 번 누르면 새 탭을 또 만들지 않고 기존 탭으로 보내는 데 쓴다.
   */
  sourceKey: string | null;
  /**
   * 이 계획을 시트에 저장한 시각.
   * 불러온 탭이면 그때 저장된 시각, 방금 저장했으면 그 시각이 들어온다.
   * 아직 저장한 적 없는 탭은 null.
   */
  savedAt: string | null;
}

// 기획서 6장: 초기 로드 시 예시값이 채워져 결과가 바로 보여야 한다
export const INITIAL_INPUTS: LadderInputs = {
  name: "",
  market: "KR",
  entryText: "10,000",
  stopText: "9,400",
  splits: 3,
  ratioText: "2.0",
  budgetText: "",
  ceilingText: "",
  memo: "",
};

/** 탭 이름 — 종목명을 적기 전까지는 '새 탭' */
export function getTabTitle(inputs: LadderInputs): string {
  return inputs.name.trim() || "새 탭";
}

/**
 * 입력값에서 결과를 뽑는다.
 * 종목명·메모는 계산에 쓰이지 않는다(저장할 때만 필요).
 */
export function computeDerived(inputs: LadderInputs): LadderDerived {
  const entry = parseNumber(inputs.entryText);
  const stop = parseNumber(inputs.stopText);
  const ratio = parseNumber(inputs.ratioText);

  const check = validateInputs({ entry, stop, ratio });
  if (!check.ok) return { ok: false, errors: check.errors, result: null };

  const ladder = calcLadder(entry, stop, inputs.splits, ratio, inputs.market);
  const ceilingValue = parseNumber(inputs.ceilingText);

  return {
    ok: true,
    errors: [],
    result: {
      ladder,
      ceilingPrice: isFinite(ceilingValue) && ceilingValue > 0 ? ceilingValue : null,
      metrics: calcMetrics(entry, stop, ratio, ladder),
      ceiling: judgeCeiling(ceilingValue, entry, stop, ladder),
      budget: calcBudget(parseNumber(inputs.budgetText), entry, stop, ladder, inputs.market),
      entry,
      stop,
      ratio,
    },
  };
}

/* ── 저장 기록 ↔ 입력값 ─────────────────────────────────────────── */

/**
 * 시트 한 줄을 입력값으로 되돌린다. 칸 순서는 기획서 7.3절:
 * 0 날짜 · 1 종목명 · 2 시장 · 3 매수가 · 4 손절가 ·
 * 5 분할수 · 6 손익비 · 7 매도가 · 8 예산 · 9 상한가 · 10 메모
 *
 * 매도가(7)는 계산 결과라 복원하지 않는다 — 나머지 입력만 되돌리면
 * 같은 매도가가 다시 계산되어 나온다.
 */
/*
  손익비 표기.
  0.1 단위로 떨어지면 "2.0"처럼 자릿수를 맞춰 보기 좋게 두고,
  그렇지 않으면 값을 그대로 쓴다 — 직접 입력에는 자릿수 제한이 없어서
  2.35 같은 값이 저장될 수 있는데, 소수 첫째 자리로 깎으면
  복원한 계획의 매도가가 저장 당시와 달라지기 때문이다.
*/
function formatRatio(ratio: number): string {
  const tenths = ratio * 10;
  return Math.round(tenths) === tenths ? ratio.toFixed(1) : String(ratio);
}

export function recordToInputs(row: unknown[]): LadderInputs {
  const market: Market = row[2] === "US" ? "US" : "KR";
  const num = (value: unknown) => {
    const parsed = Number(value);
    return isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const entry = num(row[3]);
  const stop = num(row[4]);
  const ratio = num(row[6]);
  const budget = num(row[8]);
  const ceiling = num(row[9]);
  const splits = Number(row[5]);

  return {
    name: String(row[1] ?? "").replace(/^\(무명\)$/, ""),
    market,
    entryText: entry !== null ? formatPrice(entry, market) : "",
    stopText: stop !== null ? formatPrice(stop, market) : "",
    splits: splits === 1 || splits === 2 ? splits : 3,
    ratioText: ratio !== null ? formatRatio(ratio) : "2.0",
    // 예산은 국내 전용이라 미국 기록이면 비워둔다
    budgetText: market === "KR" && budget !== null ? formatPrice(budget, "KR") : "",
    ceilingText: ceiling !== null ? formatPrice(ceiling, market) : "",
    memo: String(row[10] ?? ""),
  };
}

/** 시트 한 줄에서 저장 시각(첫 칸)만 꺼낸다 */
export function getRecordSavedAt(row: unknown[]): string {
  return String(row[0] ?? "");
}

/**
 * 저장 시각을 사람이 읽는 말로 바꾼다.
 * "2026-08-24T13:59:35.000Z" 같은 기계용 표기(세계 표준시)면 보는 사람의 시간대로 옮기고,
 * 오늘·어제는 날짜 대신 그렇게 부른다. 올해 안이면 연도를 생략한다.
 *
 * now를 인자로 받는 이유: '오늘'이 언제인지에 따라 답이 달라지는 함수라,
 * 기준 시각을 밖에서 주어야 테스트할 수 있다.
 */
export function formatSavedAt(value: unknown, now: Date = new Date()): string {
  const text = String(value ?? "");
  if (!text) return "";

  const date = new Date(text);
  if (isNaN(date.getTime())) return text;   // 날짜로 읽히지 않으면 원문 그대로

  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, now)) return `오늘 ${clock}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `어제 ${clock}`;

  const monthDay = `${date.getMonth() + 1}월 ${date.getDate()}일`;
  return date.getFullYear() === now.getFullYear()
    ? `${monthDay} ${clock}`
    : `${date.getFullYear()}년 ${monthDay} ${clock}`;
}

/** 같은 기록인지 가리는 열쇠 — 날짜와 종목명이 같으면 같은 기록으로 본다 */
export function getRecordKey(row: unknown[]): string {
  return `${String(row[0] ?? "")}|${String(row[1] ?? "")}`;
}

/* ── 탭 목록 조작 ───────────────────────────────────────────────── */

/** 배열에서 항목 하나를 뽑아 다른 자리에 꽂는다 (탭 위치 이동) */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;
  if (from < 0 || from >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  // to는 '뽑아낸 뒤의 배열' 기준 위치로 해석한다
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/**
 * 탭을 닫는다. 마지막 한 장은 닫아도 빈 화면이 되지 않게 새 탭으로 갈아끼운다.
 * 활성 탭을 닫으면 옆 탭으로 넘어간다(오른쪽 우선, 없으면 왼쪽).
 */
export function closeTabAt(
  tabs: LadderTab[],
  activeId: string,
  targetId: string,
  makeId: () => string,
): { tabs: LadderTab[]; activeId: string } {
  const index = tabs.findIndex((tab) => tab.id === targetId);
  if (index === -1) return { tabs, activeId };

  if (tabs.length === 1) {
    const fresh: LadderTab = {
      id: makeId(), inputs: { ...INITIAL_INPUTS }, sourceKey: null, savedAt: null,
    };
    return { tabs: [fresh], activeId: fresh.id };
  }

  const rest = tabs.filter((tab) => tab.id !== targetId);
  if (activeId !== targetId) return { tabs: rest, activeId };

  const neighbor = rest[Math.min(index, rest.length - 1)];
  return { tabs: rest, activeId: neighbor.id };
}
