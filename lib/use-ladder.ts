"use client";

/*
  계산기의 상태와 파생 계산을 한 곳에 모은 훅.
  입력은 전부 '문자열 그대로' 보관한다 — "10,000"이나 "2." 같은 타이핑 중간
  상태를 지우지 않기 위해서다. 숫자 해석과 검증은 파생 계산(useMemo)에서만 한다.
*/
import { useMemo, useState } from "react";
import {
  calcBudget, calcLadder, calcMetrics, judgeCeiling, parseNumber, validateInputs,
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

// 기획서 6장: 초기 로드 시 예시값이 채워져 결과가 바로 보여야 한다
const INITIAL_INPUTS: LadderInputs = {
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

export function useLadder() {
  const [inputs, setInputs] = useState<LadderInputs>(INITIAL_INPUTS);

  const setField = <K extends keyof LadderInputs>(key: K, value: LadderInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  const derived: LadderDerived = useMemo(() => {
    const entry = parseNumber(inputs.entryText);
    const stop = parseNumber(inputs.stopText);
    const ratio = parseNumber(inputs.ratioText);

    const check = validateInputs({ entry, stop, ratio });
    if (!check.ok) return { ok: false, errors: check.errors, result: null };

    const ladder = calcLadder(entry, stop, inputs.splits, ratio, inputs.market);
    return {
      ok: true,
      errors: [],
      result: {
        ladder,
        metrics: calcMetrics(entry, stop, ratio, ladder),
        ceiling: judgeCeiling(parseNumber(inputs.ceilingText), entry, stop, ladder),
        budget: calcBudget(parseNumber(inputs.budgetText), entry, stop, ladder, inputs.market),
        entry,
        stop,
        ratio,
      },
    };
  }, [
    // 종목명·메모는 계산에 쓰이지 않으므로 의존성에서 뺀다.
    // 한글 조합 중 글자마다 재계산이 도는 것을 막는 기존 동작의 React식 표현이다.
    inputs.entryText, inputs.stopText, inputs.splits,
    inputs.ratioText, inputs.budgetText, inputs.ceilingText, inputs.market,
  ]);

  return { inputs, setField, derived };
}
