/*
  수직 가격 레일의 좌표 계산 — 화면을 모르는 순수 함수.
  이전 버전의 renderRail 로직(가격 비례 배치 + 라벨 겹침 보정)을 그대로 옮겼다.
  컴포넌트는 이 결과를 받아 그리기만 하므로, 좌표 논리는 vitest로 검증한다.
*/
import type { LadderRow } from "@/lib/calc";

/** 라벨끼리 최소한 이만큼은 떨어뜨린다(px) */
const LABEL_MIN_GAP = 34;
/** 겹침 보정으로 라벨이 위로 밀렸을 때 레일 밖으로 넘치는 양을 가늠하는 값 */
const LABEL_HEIGHT = 30;

export type RailTickType = "stop" | "entry" | "sell";

export interface RailTick {
  type: RailTickType;
  /** sell이면 사다리의 인덱스(0부터), 아니면 null */
  ladderIndex: number | null;
  price: number;
  /** 점(dot)의 실제 위치 — 가격에 정직하게 비례 */
  y: number;
  /** 라벨 위치 — 겹치면 위로 밀린다. 점은 그대로 두므로 그림은 정직하다 */
  labelY: number;
}

export interface RailLayout {
  ticks: RailTick[];
  /** 상한선 y (상한 미입력이면 null) */
  ceilingY: number | null;
  /** 맨 위 라벨이 레일을 벗어난 만큼 위쪽에 더 줘야 하는 여백(px) */
  extraTop: number;
}

export function buildRailLayout(params: {
  entry: number;
  stop: number;
  ladder: LadderRow[];
  ceiling: number | null;
  height: number;
}): RailLayout {
  const { entry, stop, ladder, ceiling, height } = params;

  // 표시 범위: 손절가~최종 매도가. 상한선이 있으면 반드시 포함시켜 잘리지 않게 한다
  const prices = [stop, entry, ...ladder.map((row) => row.price)];
  if (ceiling !== null) prices.push(ceiling);

  const lowest = Math.min(...prices);
  const highest = Math.max(...prices);
  let spread = highest - lowest;
  if (spread <= 0) spread = Math.max(1, entry * 0.01); // 0으로 나누는 사고 방지
  const padding = spread * 0.1;
  const min = lowest - padding;
  const max = highest + padding;

  const toY = (price: number) => ((price - min) / (max - min)) * height;

  const ticks: RailTick[] = [
    { type: "stop", ladderIndex: null, price: stop, y: toY(stop), labelY: 0 },
    { type: "entry", ladderIndex: null, price: entry, y: toY(entry), labelY: 0 },
    ...ladder.map((row, index): RailTick => ({
      type: "sell",
      ladderIndex: index,
      price: row.price,
      y: toY(row.price),
      labelY: 0,
    })),
  ];

  // 아래에서 위 순서로 정렬한 뒤, 라벨만 겹치지 않게 위로 밀어낸다
  ticks.sort((a, b) => a.y - b.y);
  ticks.forEach((tick, index) => {
    tick.labelY =
      index === 0 ? tick.y : Math.max(tick.y, ticks[index - 1].labelY + LABEL_MIN_GAP);
  });

  const topMost = ticks[ticks.length - 1].labelY + LABEL_HEIGHT;

  return {
    ticks,
    ceilingY: ceiling !== null ? toY(ceiling) : null,
    extraTop: Math.max(0, topMost - height),
  };
}
