/*
  매도 사다리 — 계산 코어.
  이전 단일 index.html의 CALC-CORE 블록을 로직 무변경으로 이식한 것이다.
  화면(DOM)을 전혀 모르는 순수 함수 모음이라, 기획서 10장의 검증 벡터를
  vitest로 그대로 돌릴 수 있다 (lib/calc.test.ts).

  확정 규칙 — 절대 변경 금지:
  - 매도가는 항상 호가단위 '내림' (보수적)
  - 부동소수 보정: KR floor(p/tick + 1e-9)*tick, US floor(p*100 + 1e-6)/100
  - 수수료(왕복 0.3%)는 원 단위 '반올림' 후 차감 (내림 금지 — 벡터 6)
  - k_max는 소수 첫째 자리 '내림'
*/

export type Market = "KR" | "US";

// 왕복 거래비용 0.3% — 매수 때 절반, 매도 때 절반(각 0.15%)씩 물린다
const FEE_ROUND_TRIP = 0.003;
const FEE_ONE_WAY = FEE_ROUND_TRIP / 2;

/**
 * 호가단위(가격이 움직이는 최소 눈금)를 돌려준다.
 * 한국 증시는 가격대가 높아질수록 눈금이 굵어진다 — 계단식 구간표다.
 */
export function getTickSize(price: number, market: Market): number {
  if (market === "US") return 0.01; // 미국은 전 구간 1센트
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

/**
 * 매도가를 호가단위에 맞춰 '내림'한다.
 * 반올림이 아니라 내림인 이유: 실제로 체결될 수 있는 쪽으로 보수적으로 잡기 위함이다.
 * 1e-9 / 1e-6 은 부동소수 오차 보정용.
 */
export function floorToTick(price: number, market: Market): number {
  if (market === "US") return Math.floor(price * 100 + 1e-6) / 100;
  const tick = getTickSize(price, "KR");
  return Math.floor(price / tick + 1e-9) * tick;
}

// 천단위 콤마 삽입 — 실행 환경과 무관하게 같은 결과가 나오도록 직접 구현
function addThousands(digits: number | string): string {
  return String(digits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 가격 표기. KR은 정수 + 천단위 콤마, US는 소수 둘째 자리 고정. */
export function formatPrice(price: number, market: Market): string {
  if (market === "US") {
    const parts = price.toFixed(2).split(".");
    return addThousands(parts[0]) + "." + parts[1];
  }
  return addThousands(Math.round(price));
}

/**
 * 손익 금액 표기. 부호는 '화면에 실제로 찍힐 값' 기준 — 예를 들어 −0.3원이
 * 0원으로 반올림되면 "−0"이 아니라 "+0"으로 나와야 앞뒤가 맞다.
 * (− 는 보기 좋은 U+2212 마이너스 기호)
 */
export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "+";
  return sign + addThousands(Math.abs(rounded));
}

/** 퍼센트 표기 — 소수 첫째 자리까지, 부호 포함. 부호 판정 기준은 formatMoney와 동일. */
export function formatSignedPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded < 0 ? "−" : "+";
  return sign + Math.abs(rounded).toFixed(1) + "%";
}

/**
 * 입력창의 문자열을 숫자로 바꾼다.
 * "10,000원"처럼 콤마·통화 표기가 섞여 있어도(HTS 복사 등) 받아들인다.
 * "2." 같은 타이핑 중간 상태는 허용하고, 숫자가 하나도 없으면 NaN.
 */
export function parseNumber(text: string): number {
  if (typeof text !== "string") return NaN;
  const cleaned = text.replace(/[,\s₩$원]/g, "");
  if (cleaned === "") return NaN;
  if (!/^\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) return NaN;
  return parseFloat(cleaned);
}

export interface LadderRow {
  /** 1차 / 2차 / 3차 */
  step: number;
  /** 호가 내림 전 이론가 */
  raw: number;
  /** 실제 제시할 매도가 */
  price: number;
  /** 비중 % */
  weight: number;
  /** 매수가 대비 상승률 % */
  gainPct: number;
  /**
   * 호가 내림 때문에 매도가가 매수가 이하로 내려간 비정상 상태.
   * 수익이 나야 할 자리가 실은 손실 구간이라는 뜻이라 화면에서 경고로 드러낸다.
   */
  belowEntry: boolean;
}

/**
 * 매도 사다리 역산 — 이 도구의 심장.
 * R(1주당 리스크) = 매수가 − 손절가. 손익비 k를 만족하도록 매도가를 거꾸로 계산한다.
 * 구조는 '균등 비중 + 1차 +1R 고정 + 등간격'으로 확정됐다.
 *   1분할: E + kR                      (100%)
 *   2분할: E + R, E + (2k−1)R          (50 / 50)
 *   3분할: E + R, E + kR, E + (2k−1)R  (33 / 33 / 34)
 * 비중 가중평균이 정확히 E + kR 이 되도록 짜여 있다(내림 전 기준).
 */
export function calcLadder(
  entry: number,
  stop: number,
  splits: number,
  ratio: number,
  market: Market,
): LadderRow[] {
  const risk = entry - stop;
  let rawPrices: number[];
  let weights: number[];

  if (splits === 1) {
    rawPrices = [entry + ratio * risk];
    weights = [100];
  } else if (splits === 2) {
    rawPrices = [entry + risk, entry + (2 * ratio - 1) * risk];
    weights = [50, 50];
  } else {
    rawPrices = [entry + risk, entry + ratio * risk, entry + (2 * ratio - 1) * risk];
    weights = [33, 33, 34];
  }

  return rawPrices.map((raw, index) => {
    const price = floorToTick(raw, market);
    return {
      step: index + 1,
      raw,
      price,
      weight: weights[index],
      gainPct: ((price - entry) / entry) * 100,
      belowEntry: price <= entry,
    };
  });
}

export type Tone = "neutral" | "warn" | "danger";

export interface Metrics {
  stopWidthPct: number;
  stopTone: Tone;
  breakEvenWinRate: number;
  requiredGainPct: number;
  requiredGainTone: Tone;
}

/**
 * 판정 칩에 쓰이는 파생 지표.
 * 도구는 확률을 모른다 — 확률을 사람이 가늠할 재료만 정직하게 내놓는다.
 */
export function calcMetrics(
  entry: number,
  stop: number,
  ratio: number,
  ladder: LadderRow[],
): Metrics {
  const risk = entry - stop;
  const stopWidthPct = (risk / entry) * 100;
  const finalSellPrice = ladder[ladder.length - 1].price;

  // 손절폭이 너무 좁으면 노이즈에 털리고, 너무 넓으면 이미 늦은 자리다
  let stopTone: Tone = "neutral";
  if (stopWidthPct < 2) stopTone = "warn";
  else if (stopWidthPct > 10) stopTone = "danger";

  // 본전 승률 = 1/(1+k). 손익비 2면 33%만 맞혀도 본전이라는 뜻이다
  const breakEvenWinRate = Math.round(100 / (1 + ratio));

  // 필요 상승률은 반드시 '호가 내림 후 최종 매도가' 기준 — 앵커링 방어의 핵심 숫자
  const requiredGainPct = ((finalSellPrice - entry) / entry) * 100;

  return {
    stopWidthPct,
    stopTone,
    breakEvenWinRate,
    requiredGainPct,
    requiredGainTone: requiredGainPct > 30 ? "warn" : "neutral",
  };
}

export type CeilingBadge = "within" | "over";

export interface CeilingVerdict {
  tone: "ok" | "warn" | "danger";
  message: string;
  badges: CeilingBadge[];
  kMax?: number;
}

/**
 * 현실 상한가 판정 — 도구가 먼저 "그거 안 됩니다"를 선언하는 자리.
 * 최종가가 상한을 넘으면 이 상한 안에서 가능한 최대 손익비(k_max)를 역산한다:
 *   1분할   k = (C−E)/R  /  2·3분할  k = ((C−E)/R + 1) / 2, 소수 첫째 자리 내림.
 */
export function judgeCeiling(
  ceiling: number,
  entry: number,
  stop: number,
  ladder: LadderRow[],
): CeilingVerdict | null {
  if (!isFinite(ceiling) || ceiling <= 0) return null; // 선택 입력 — 비어 있으면 판정 없음

  const risk = entry - stop;
  // 분할 수는 사다리 자체에서 읽는다. 따로 받으면 둘이 어긋날 여지가 생긴다
  const splits = ladder.length;

  if (ceiling <= entry) {
    return {
      tone: "danger",
      message: "상한가가 매수가 이하 — 이 자리는 들어갈 이유가 없습니다.",
      badges: ladder.map(() => "over" as const),
    };
  }

  const badges = ladder.map((row): CeilingBadge =>
    row.price <= ceiling ? "within" : "over",
  );
  const finalPrice = ladder[ladder.length - 1].price;

  if (finalPrice <= ceiling) {
    return {
      tone: "ok",
      message: "모든 매도가가 상한 이내 — 계획 성립. 마지막 판단은 당신 몫.",
      badges,
    };
  }

  const kMaxRaw =
    splits === 1 ? (ceiling - entry) / risk : ((ceiling - entry) / risk + 1) / 2;
  const kMax = Math.floor(kMaxRaw * 10 + 1e-9) / 10;

  if (kMax >= 1.0) {
    return {
      tone: "warn",
      message:
        "최종가가 상한을 넘습니다 — 이 자리에서 가능한 손익비는 " +
        kMax.toFixed(1) +
        "까지. 그걸로 부족하면 이 거래는 포기.",
      badges,
      kMax,
    };
  }
  return {
    tone: "danger",
    message: "이 상한으로는 손익비 1.0도 안 나옵니다 — 진입 포기 권장.",
    badges,
    kMax,
  };
}

export interface BudgetResult {
  qty: number;
  shares: number[];
  buyAmount: number;
  sellAmount: number;
  stopFee: number;
  stopNet: number;
  takeFee: number;
  takeNet: number;
  insufficient: boolean;
}

/**
 * 예산을 넣었을 때의 주수·순손익 계산. 매수는 전량 일괄이므로 총수량은 매수가 기준.
 * 매도가 자체에는 수수료를 섞지 않는다 — 수수료는 순손익에만, 원 단위 반올림 후 차감.
 * 예산 기능은 KR 시장 전용이다(발주자 결정).
 */
export function calcBudget(
  budget: number,
  entry: number,
  stop: number,
  ladder: LadderRow[],
  market: Market,
): BudgetResult | null {
  if (market !== "KR") return null;
  if (!isFinite(budget) || budget <= 0) return null;

  const qty = Math.floor(budget / entry);
  if (qty < 1) {
    // 예산이 1주 값에도 못 미침 — 호출부가 금액 필드만 꺼내 써도 안전하도록
    // 정상 결과와 같은 모양을 유지한 채 0으로 채워 돌려준다
    return {
      qty: 0,
      shares: [],
      buyAmount: 0,
      sellAmount: 0,
      stopFee: 0,
      stopNet: 0,
      takeFee: 0,
      takeNet: 0,
      insufficient: true,
    };
  }

  const splits = ladder.length;
  const base = Math.floor(qty / splits);
  const shares: number[] = [];
  for (let i = 0; i < splits - 1; i++) shares.push(base);
  shares.push(qty - base * (splits - 1)); // 나머지는 마지막 차수가 받는다

  const buyAmount = qty * entry;
  let sellAmount = 0;
  for (let j = 0; j < splits; j++) sellAmount += shares[j] * ladder[j].price;

  const stopAmount = qty * stop;
  const stopFee = Math.round((stopAmount + buyAmount) * FEE_ONE_WAY);
  const stopNet = stopAmount - buyAmount - stopFee;

  const takeFee = Math.round((sellAmount + buyAmount) * FEE_ONE_WAY);
  const takeNet = sellAmount - buyAmount - takeFee;

  return {
    qty,
    shares,
    buyAmount,
    sellAmount,
    stopFee,
    stopNet,
    takeFee,
    takeNet,
    insufficient: false,
  };
}

export interface ValidationInput {
  entry: number;
  stop: number;
  ratio: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * 입력 검증. 필수는 매수가·손절가·분할수·손익비 4개뿐이다.
 * 손익비에 상한은 두지 않는다 — 비현실적인 값이 만드는 비현실적인 결과를
 * 사용자가 직접 보는 것이 이 도구의 목적이기 때문이다. 하한만 막는다.
 */
export function validateInputs(input: ValidationInput): ValidationResult {
  const errors: string[] = [];
  const hasEntry = isFinite(input.entry) && input.entry > 0;
  const hasStop = isFinite(input.stop) && input.stop > 0;

  if (!hasEntry) errors.push("매수가를 0보다 큰 숫자로 입력하세요.");
  if (!hasStop) errors.push("손절가를 0보다 큰 숫자로 입력하세요.");
  if (hasEntry && hasStop && input.stop >= input.entry) {
    errors.push("손절가는 매수가보다 낮아야 합니다");
  }
  if (!isFinite(input.ratio) || input.ratio <= 0) {
    errors.push("손익비는 0보다 커야 합니다.");
  }

  return { ok: errors.length === 0, errors };
}
