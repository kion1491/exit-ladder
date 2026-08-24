/*
  기획서 10장 검증 벡터 + 경계·엣지 케이스.
  이전 버전에서 쓰던 검증 스크립트(체크 73개)의 목록을 vitest로 재현한 것이다.
  이 파일이 통과하면 계산 코어 이식에 회귀가 없다는 뜻이다.
*/
import { describe, it, expect } from "vitest";
import {
  getTickSize, floorToTick, formatPrice, formatMoney, formatSignedPct,
  parseNumber, calcLadder, calcMetrics, judgeCeiling, calcBudget, validateInputs,
  type LadderRow,
} from "./calc";

const E = 10000;
const S = 9400;

const prices = (ladder: LadderRow[], market: "KR" | "US") =>
  ladder.map((row) => formatPrice(row.price, market));

describe("벡터 1 — k=2.0, 3분할", () => {
  const ladder = calcLadder(E, S, 3, 2.0, "KR");
  const m = calcMetrics(E, S, 2.0, ladder);
  it("매도가 10,600 / 11,200 / 11,800", () =>
    expect(prices(ladder, "KR")).toEqual(["10,600", "11,200", "11,800"]));
  it("비중 33/33/34", () =>
    expect(ladder.map((r) => r.weight)).toEqual([33, 33, 34]));
  it("필요 상승률 +18.0%", () =>
    expect(formatSignedPct(m.requiredGainPct)).toBe("+18.0%"));
  it("본전 승률 33%", () => expect(m.breakEvenWinRate).toBe(33));
  it("손절폭 6.0% · 중립", () => {
    expect(m.stopWidthPct.toFixed(1)).toBe("6.0");
    expect(m.stopTone).toBe("neutral");
  });
});

describe("벡터 2~4 — 손익비·분할 변형", () => {
  it("k=2.5 3분할: 10,600 / 11,500 / 12,400", () =>
    expect(prices(calcLadder(E, S, 3, 2.5, "KR"), "KR")).toEqual(["10,600", "11,500", "12,400"]));
  it("k=2.0 2분할: 10,600 / 11,800 (50/50)", () => {
    const ladder = calcLadder(E, S, 2, 2.0, "KR");
    expect(prices(ladder, "KR")).toEqual(["10,600", "11,800"]);
    expect(ladder.map((r) => r.weight)).toEqual([50, 50]);
  });
  it("k=2.0 1분할: 11,200 (100)", () => {
    const ladder = calcLadder(E, S, 1, 2.0, "KR");
    expect(prices(ladder, "KR")).toEqual(["11,200"]);
    expect(ladder.map((r) => r.weight)).toEqual([100]);
  });
});

describe("벡터 5 — 상한 11,500", () => {
  const ladder = calcLadder(E, S, 3, 2.0, "KR");
  const j = judgeCeiling(11500, E, S, ladder)!;
  it("배지 이내/이내/초과", () =>
    expect(j.badges).toEqual(["within", "within", "over"]));
  it("k_max 1.7 (내림)", () => expect(j.kMax).toBe(1.7));
  it("제안 메시지 원문 일치", () =>
    expect(j.message).toBe(
      "최종가가 상한을 넘습니다 — 이 자리에서 가능한 손익비는 1.7까지. 그걸로 부족하면 이 거래는 포기.",
    ));
});

describe("벡터 6 — 예산 1,000,000원", () => {
  const ladder = calcLadder(E, S, 3, 2.0, "KR");
  const b = calcBudget(1000000, E, S, ladder, "KR")!;
  it("총 100주 (33/33/34)", () => {
    expect(b.qty).toBe(100);
    expect(b.shares).toEqual([33, 33, 34]);
  });
  it("매수 1,000,000 / 매도합 1,120,600", () => {
    expect(formatPrice(b.buyAmount, "KR")).toBe("1,000,000");
    expect(formatPrice(b.sellAmount, "KR")).toBe("1,120,600");
  });
  it("수수료 2,910 / 3,181 (반올림 — 내림 금지)", () => {
    expect(b.stopFee).toBe(2910);
    expect(b.takeFee).toBe(3181);
  });
  it("순손익 −62,910 / +117,419", () => {
    expect(formatMoney(b.stopNet)).toBe("−62,910");
    expect(formatMoney(b.takeNet)).toBe("+117,419");
  });
});

describe("벡터 7 — 손절가 > 매수가", () => {
  const v = validateInputs({ entry: E, stop: 10500, ratio: 2.0 });
  it("검증 실패 + 지정 문구", () => {
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("손절가는 매수가보다 낮아야 합니다");
  });
});

describe("벡터 8 — 손절폭 경계", () => {
  it("S=9,850 → 1.5% 노이즈 주의", () => {
    const m = calcMetrics(E, 9850, 2.0, calcLadder(E, 9850, 3, 2.0, "KR"));
    expect(m.stopWidthPct.toFixed(1)).toBe("1.5");
    expect(m.stopTone).toBe("warn");
  });
  it("S=8,900 → 11.0% 타점 늦음", () => {
    const m = calcMetrics(E, 8900, 2.0, calcLadder(E, 8900, 3, 2.0, "KR"));
    expect(m.stopWidthPct.toFixed(1)).toBe("11.0");
    expect(m.stopTone).toBe("danger");
  });
});

describe("벡터 9 — 상한 ≤ 매수가", () => {
  const j = judgeCeiling(9800, E, S, calcLadder(E, S, 3, 2.0, "KR"))!;
  it("들어갈 이유 없음 문구 + danger", () => {
    expect(j.message).toBe("상한가가 매수가 이하 — 이 자리는 들어갈 이유가 없습니다.");
    expect(j.tone).toBe("danger");
  });
});

describe("벡터 10 — US 시장", () => {
  const ladder = calcLadder(100, 94, 3, 2.0, "US");
  it("106.00 / 112.00 / 118.00 (센트 내림, 2자리)", () =>
    expect(prices(ladder, "US")).toEqual(["106.00", "112.00", "118.00"]));
  it("US에서는 예산 기능 미제공", () =>
    expect(calcBudget(1000000, 100, 94, ladder, "US")).toBeNull());
});

describe("k=1.0 겹침 — 에러 아님", () => {
  it("세 가격이 전부 +1R로 같아도 그대로 반환", () => {
    const ladder = calcLadder(E, S, 3, 1.0, "KR");
    expect(prices(ladder, "KR")).toEqual(["10,600", "10,600", "10,600"]);
    expect(validateInputs({ entry: E, stop: S, ratio: 1.0 }).ok).toBe(true);
  });
});

describe("호가단위 구간표 전수", () => {
  const cases: Array<[number, number]> = [
    [1999, 1], [2000, 5], [4999, 5], [5000, 10], [19999, 10], [20000, 50],
    [49999, 50], [50000, 100], [199999, 100], [200000, 500], [499999, 500], [500000, 1000],
  ];
  it.each(cases)("%d원 → 호가 %d원", (price, tick) =>
    expect(getTickSize(price, "KR")).toBe(tick));
  it("내림: 12,347 → 12,340 / US 106.789 → 106.78", () => {
    expect(floorToTick(12347, "KR")).toBe(12340);
    expect(floorToTick(106.789, "US")).toBe(106.78);
  });
});

describe("parseNumber — 관대한 입력", () => {
  it("콤마·통화·공백 허용", () => {
    expect(parseNumber("10,000")).toBe(10000);
    expect(parseNumber("1,000,000")).toBe(1000000);
    expect(parseNumber(" 9400 ")).toBe(9400);
    expect(parseNumber("10,000원")).toBe(10000);
    expect(parseNumber("₩1,000,000")).toBe(1000000);
    expect(parseNumber("2.5")).toBe(2.5);
  });
  it("타이핑 중간 상태 '2.' 허용", () => expect(parseNumber("2.")).toBe(2));
  it("숫자 아님 → NaN", () => {
    for (const bad of ["", "abc", "1.2.3", "-500", "."]) {
      expect(Number.isNaN(parseNumber(bad))).toBe(true);
    }
  });
});

describe("리뷰 반영 엣지 케이스", () => {
  it("호가 내림으로 매도가 ≤ 매수가 → belowEntry 플래그", () => {
    const ladder = calcLadder(100050, 100049, 1, 1.01, "KR");
    expect(ladder[0].price).toBeLessThan(100050);
    expect(ladder[0].belowEntry).toBe(true);
    const normal = calcLadder(E, S, 3, 2.0, "KR");
    expect(normal.map((r) => r.belowEntry)).toEqual([false, false, false]);
  });
  it("judgeCeiling은 분할 수를 사다리에서 읽는다", () => {
    expect(judgeCeiling(11000, E, S, calcLadder(E, S, 1, 2.0, "KR"))!.kMax).toBe(1.6);
    expect(judgeCeiling(11000, E, S, calcLadder(E, S, 3, 2.0, "KR"))!.kMax).toBe(1.3);
  });
  it("예산 부족 시에도 반환 모양 통일", () => {
    const b = calcBudget(5000, E, S, calcLadder(E, S, 3, 2.0, "KR"), "KR")!;
    expect(b.insufficient).toBe(true);
    expect([b.buyAmount, b.stopNet, b.takeNet]).toEqual([0, 0, 0]);
    expect(Array.isArray(b.shares)).toBe(true);
  });
  it("0 근처 음수 부호 표기 통일", () => {
    expect(formatMoney(-0.3)).toBe("+0");
    expect(formatSignedPct(-0.03)).toBe("+0.0%");
    expect(formatSignedPct(-0.06)).toBe("−0.1%");
  });
});

describe("가격 레일 좌표 (buildRailLayout)", async () => {
  const { buildRailLayout } = await import("./rail");
  const ladder = calcLadder(E, S, 3, 2.0, "KR");

  it("점 위치가 가격에 정확히 비례한다", () => {
    const layout = buildRailLayout({ entry: E, stop: S, ladder, ceiling: 11500, height: 300 });
    const byPrice = (p: number) => layout.ticks.find((t) => t.price === p)!.y;
    // 범위: 9,400~11,800 + 10% 여백 → 9,160~12,040 (스팬 2,880)
    expect(byPrice(9400)).toBeCloseTo(25, 1);
    expect(byPrice(10000)).toBeCloseTo(87.5, 1);
    expect(byPrice(11800)).toBeCloseTo(275, 1);
    expect(layout.ceilingY).toBeCloseTo(243.75, 1);
  });

  it("k=1.0 완전 겹침에서도 라벨이 34px 이상 벌어진다", () => {
    const same = calcLadder(E, S, 3, 1.0, "KR"); // 세 가격 전부 10,600
    const layout = buildRailLayout({ entry: E, stop: S, ladder: same, ceiling: null, height: 300 });
    for (let i = 1; i < layout.ticks.length; i++) {
      expect(layout.ticks[i].labelY - layout.ticks[i - 1].labelY).toBeGreaterThanOrEqual(34);
    }
    expect(layout.extraTop).toBeGreaterThan(0); // 밀려난 만큼 위 여백을 요구
  });

  it("높이를 바꾸면 좌표가 비례해 따라온다", () => {
    const a = buildRailLayout({ entry: E, stop: S, ladder, ceiling: null, height: 300 });
    const b = buildRailLayout({ entry: E, stop: S, ladder, ceiling: null, height: 440 });
    const top = (l: typeof a) => l.ticks[l.ticks.length - 1].y;
    expect(b.ticks[0].y / a.ticks[0].y).toBeCloseTo(440 / 300, 5);
    expect(top(b) / top(a)).toBeCloseTo(440 / 300, 5);
  });
});

describe("탭 상태 (ladder-state)", async () => {
  const {
    moveItem, closeTabAt, recordToInputs, getRecordKey, getTabTitle,
    INITIAL_INPUTS, computeDerived,
  } = await import("./ladder-state");

  const makeTabs = (...ids: string[]) =>
    ids.map((id) => ({ id, inputs: { ...INITIAL_INPUTS }, sourceKey: null }));

  describe("탭 위치 이동", () => {
    it("앞으로·뒤로 옮긴다", () => {
      const items = ["a", "b", "c", "d"];
      expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
      expect(moveItem(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
    });
    it("제자리·범위 밖이면 원본 그대로", () => {
      const items = ["a", "b"];
      expect(moveItem(items, 1, 1)).toBe(items);
      expect(moveItem(items, 5, 0)).toBe(items);
    });
    it("원본 배열을 건드리지 않는다", () => {
      const items = ["a", "b", "c"];
      moveItem(items, 0, 2);
      expect(items).toEqual(["a", "b", "c"]);
    });
  });

  describe("탭 닫기", () => {
    const makeId = () => "fresh";
    it("활성이 아닌 탭을 닫으면 활성은 그대로", () => {
      const r = closeTabAt(makeTabs("a", "b", "c"), "a", "c", makeId);
      expect(r.tabs.map((t) => t.id)).toEqual(["a", "b"]);
      expect(r.activeId).toBe("a");
    });
    it("활성 탭을 닫으면 오른쪽 탭으로 넘어간다", () => {
      const r = closeTabAt(makeTabs("a", "b", "c"), "b", "b", makeId);
      expect(r.tabs.map((t) => t.id)).toEqual(["a", "c"]);
      expect(r.activeId).toBe("c");
    });
    it("맨 끝 활성 탭을 닫으면 왼쪽으로 넘어간다", () => {
      const r = closeTabAt(makeTabs("a", "b"), "b", "b", makeId);
      expect(r.activeId).toBe("a");
    });
    it("마지막 한 장을 닫으면 빈 화면 대신 새 탭이 선다", () => {
      const r = closeTabAt(makeTabs("a"), "a", "a", makeId);
      expect(r.tabs).toHaveLength(1);
      expect(r.tabs[0].id).toBe("fresh");
      expect(r.activeId).toBe("fresh");
      expect(r.tabs[0].inputs).toEqual(INITIAL_INPUTS);
    });
    it("없는 탭을 닫으라고 하면 아무 일도 없다", () => {
      const tabs = makeTabs("a", "b");
      const r = closeTabAt(tabs, "a", "zzz", makeId);
      expect(r.tabs).toBe(tabs);
    });
  });

  describe("탭 이름", () => {
    it("종목명이 없으면 '새 탭'", () =>
      expect(getTabTitle({ ...INITIAL_INPUTS, name: "  " })).toBe("새 탭"));
    it("종목명을 넣으면 그게 탭 이름", () =>
      expect(getTabTitle({ ...INITIAL_INPUTS, name: "삼성전자" })).toBe("삼성전자"));
  });

  describe("저장 기록 → 입력값 복원", () => {
    // 날짜·종목명·시장·매수가·손절가·분할수·손익비·매도가·예산·상한가·메모
    const krRow = ["2026-08-24 16:20", "삼성전자", "KR", 10000, 9400, 3, 2,
                   "10,600 / 11,200 / 11,800", 1000000, 11500, "메모다"];

    it("입력값이 그대로 되살아난다", () => {
      expect(recordToInputs(krRow)).toEqual({
        name: "삼성전자", market: "KR",
        entryText: "10,000", stopText: "9,400", splits: 3, ratioText: "2.0",
        budgetText: "1,000,000", ceilingText: "11,500", memo: "메모다",
      });
    });

    it("복원한 입력이 원래 매도가를 그대로 다시 만든다", () => {
      const derived = computeDerived(recordToInputs(krRow));
      expect(derived.ok).toBe(true);
      const prices = derived.result!.ladder.map((row) => row.price);
      expect(prices).toEqual([10600, 11200, 11800]);
    });

    it("미국 기록은 센트 표기로 되살고 예산은 비운다", () => {
      const usRow = ["2026-08-24 19:08", "AAPL", "US", 100, 94, 3, 2, "...", 1000000, "", ""];
      const inputs = recordToInputs(usRow);
      expect(inputs.market).toBe("US");
      expect(inputs.entryText).toBe("100.00");
      expect(inputs.budgetText).toBe("");   // 예산은 국내 전용
      expect(inputs.ceilingText).toBe("");
    });

    it("소수 둘째 자리 손익비도 깎이지 않고 그대로 복원된다", () => {
      // 2.35를 저장했는데 2.4로 복원되면 매도가가 저장 당시와 달라진다
      const row = ["2026-08-24 12:00", "정밀도", "KR", 10000, 9400, 3, 2.35,
                   "10,600 / 11,410 / 12,220", "", "", ""];
      expect(recordToInputs(row).ratioText).toBe("2.35");

      const derived = computeDerived(recordToInputs(row));
      const prices = derived.result!.ladder.map((r) => r.price);
      // 저장 당시와 같은 매도가가 다시 나온다 (E=10,000 R=600, k=2.35)
      expect(prices).toEqual([10600, 11410, 12220]);
    });

    it("0.1 단위 손익비는 보기 좋게 자릿수를 맞춘다", () => {
      const make = (ratio: number) =>
        recordToInputs(["d", "n", "KR", 10000, 9400, 3, ratio, "", "", "", ""]).ratioText;
      expect(make(2)).toBe("2.0");
      expect(make(2.5)).toBe("2.5");
      expect(make(3)).toBe("3.0");
    });

    it("(무명)으로 저장된 기록은 이름 없는 새 탭이 된다", () => {
      const inputs = recordToInputs(["2026-08-24 12:00", "(무명)", "KR", 10000, 9400, 3, 2, "", "", "", ""]);
      expect(inputs.name).toBe("");
      expect(getTabTitle(inputs)).toBe("새 탭");
    });

    it("같은 기록은 같은 열쇠, 다른 기록은 다른 열쇠", () => {
      expect(getRecordKey(krRow)).toBe(getRecordKey([...krRow]));
      expect(getRecordKey(krRow)).not.toBe(getRecordKey(["2026-08-24 16:21", "삼성전자"]));
    });
  });
});
