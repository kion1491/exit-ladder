"use client";

/*
  결과 화면 전체 — 판단 중심 구성.
  맨 위에 '사람이 판단할 단 하나의 숫자'(최종 매도가)를 크게 놓고,
  실제 주문에 옮겨 적을 계획 표, 판정 칩, 보조 시각화인 가격 레일 순으로 흐른다.
*/
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { buildRailLayout } from "@/lib/rail";
import {
  formatMoney, formatPrice, formatSignedPct,
  type Market, type Tone,
} from "@/lib/calc";
import type { LadderResult } from "@/lib/use-ladder";

interface ResultsProps {
  result: LadderResult;
  market: Market;
}

/* ── 최종가 히어로 ─────────────────────────────────────────────── */

function HeroPrice({ result, market }: ResultsProps) {
  const finalRow = result.ladder[result.ladder.length - 1];
  const warnGain = result.metrics.requiredGainTone !== "neutral";

  return (
    <Card>
      <CardContent className="py-6 text-center">
        <p className="text-xs text-muted-foreground">
          손익비 {result.ratio.toFixed(1)}이 성립하려면 여기까지 가야 합니다
        </p>
        <strong className="mt-2 block text-[clamp(32px,9vw,44px)] font-bold leading-tight tracking-tight text-profit">
          {formatPrice(finalRow.price, market)}
          {market === "KR" ? "원" : ""}
        </strong>
        <span className={`block text-sm font-bold ${warnGain ? "text-warn" : "text-profit"}`}>
          매수가 대비 {formatSignedPct(result.metrics.requiredGainPct)} 필요
        </span>
        <p className="mt-4 border-t pt-4 text-[13px] leading-relaxed">
          차트와 펀더멘털로 볼 때 현실적인 가격입니까? 아니라면 이 거래는 하지 않는다.
        </p>
      </CardContent>
    </Card>
  );
}

/* ── 매도 계획 표 ─────────────────────────────────────────────── */

function rowBadge(result: LadderResult, index: number) {
  const row = result.ladder[index];
  if (row.belowEntry) {
    return <Badge className="ml-2 bg-danger-soft text-danger">매수가 이하</Badge>;
  }
  if (result.ceiling) {
    return result.ceiling.badges[index] === "within" ? (
      <Badge variant="secondary" className="ml-2">이내</Badge>
    ) : (
      <Badge className="ml-2 bg-warn-soft text-warn">초과</Badge>
    );
  }
  return null;
}

function PlanTable({ result, market }: ResultsProps) {
  const hasShares = result.budget !== null && !result.budget.insufficient;
  const lastIndex = result.ladder.length - 1;

  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>차수</TableHead>
              <TableHead className="text-right">매도가</TableHead>
              <TableHead className="text-right">비중</TableHead>
              {hasShares && <TableHead className="text-right">주수</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.ladder.map((row, index) => {
              const isFinal = index === lastIndex;
              const finalCls = isFinal ? "font-bold text-profit" : "";
              return (
                <TableRow key={row.step}>
                  <TableCell className={`text-muted-foreground ${finalCls}`}>
                    {row.step}차{isFinal ? " · 최종" : ""}
                  </TableCell>
                  <TableCell className={`text-right font-bold ${isFinal ? "text-profit" : ""}`}>
                    {formatPrice(row.price, market)}
                    {rowBadge(result, index)}
                  </TableCell>
                  <TableCell className={`text-right ${finalCls || "text-muted-foreground"}`}>
                    {row.weight}%
                  </TableCell>
                  {hasShares && (
                    <TableCell className={`text-right ${finalCls || "text-muted-foreground"}`}>
                      {result.budget!.shares[index].toLocaleString()}주
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="mt-3 flex justify-between border-t pt-3 text-[13px]">
          <span>
            <span className="text-[11px] text-muted-foreground">매수 </span>
            <strong>{formatPrice(result.entry, market)}</strong>
          </span>
          <span>
            <span className="text-[11px] text-muted-foreground">손절 </span>
            <strong className="text-loss">
              {formatPrice(result.stop, market)} (
              {formatSignedPct(((result.stop - result.entry) / result.entry) * 100)})
            </strong>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── 판정 칩 ─────────────────────────────────────────────────── */

const toneChip: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
};

function MetricChips({ result }: { result: LadderResult }) {
  const { metrics } = result;
  const stopNote =
    metrics.stopTone === "warn" ? "노이즈 주의" : metrics.stopTone === "danger" ? "타점 늦음" : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className={toneChip[metrics.stopTone]}>
        손절폭 <strong>{metrics.stopWidthPct.toFixed(1)}%</strong>
        {stopNote && <strong>{stopNote}</strong>}
      </Badge>
      <Badge className={toneChip.neutral}>
        본전 승률 <strong>{metrics.breakEvenWinRate}%</strong>
      </Badge>
      <Badge className={toneChip[metrics.requiredGainTone]}>
        필요 상승률 <strong>{formatSignedPct(metrics.requiredGainPct)}</strong>
      </Badge>
    </div>
  );
}

/* ── 상한 판정 메시지 ─────────────────────────────────────────── */

const verdictTone = {
  ok: "border-profit bg-profit-soft text-profit",       // 상한 이내 = 좋은 소식 → 한국 관습대로 빨강
  warn: "border-warn bg-warn-soft text-warn",
  danger: "border-danger bg-danger-soft text-danger",
} as const;

function CeilingVerdict({ result }: { result: LadderResult }) {
  if (!result.ceiling) return null;
  return (
    <div className={`rounded-lg border p-3 text-[13px] leading-relaxed ${verdictTone[result.ceiling.tone]}`}>
      {result.ceiling.message}
    </div>
  );
}

/* ── 수직 가격 레일 (시그니처 보조 시각화) ──────────────────────── */

const dotCls: Record<string, string> = {
  stop: "bg-loss",
  entry: "border-2 border-foreground bg-card",
  sell: "bg-profit",
};

function PriceRail({ result, market }: ResultsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(300);

  /*
    레일 높이의 주인은 CSS다(모바일 300px / 넓은 화면 440px — 클래스 참조).
    화면 폭이 바뀌어 높이가 달라지면 ResizeObserver가 알려주고,
    좌표 계산이 새 높이 기준으로 다시 돈다. 눈금이 어긋날 수 없는 구조다.
  */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      const measured = track.offsetHeight;
      if (measured > 0) setHeight(measured);
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const ceilingPrice = result.ceiling ? parseCeiling(result) : null;
  const layout = buildRailLayout({
    entry: result.entry,
    stop: result.stop,
    ladder: result.ladder,
    ceiling: ceilingPrice,
    height,
  });

  const hasShares = result.budget !== null && !result.budget.insufficient;
  const move = "transition-[bottom] duration-200 motion-reduce:transition-none";

  return (
    <Card>
      <CardContent>
        <div
          ref={trackRef}
          className="relative ml-1 h-[300px] min-[820px]:h-[440px]"
          style={{ marginTop: layout.extraTop }}
        >
          {/* 세로 축 */}
          <span className="absolute inset-y-0 left-0 w-0.5 rounded bg-border" />

          {/* 현실 상한 — 주황 점선 */}
          {layout.ceilingY !== null && (
            <div
              className={`absolute inset-x-0 border-t border-dashed border-ceiling ${move}`}
              style={{ bottom: layout.ceilingY }}
            >
              <span className="absolute bottom-0.5 right-0 bg-card pl-1 text-[10px] font-bold text-ceiling">
                상한 {formatPrice(ceilingPrice!, market)}
              </span>
            </div>
          )}

          {layout.ticks.map((tick) => {
            const row = tick.ladderIndex !== null ? result.ladder[tick.ladderIndex] : null;
            const shifted = tick.labelY - tick.y;
            const meta =
              tick.type === "stop"
                ? `손절 · ${formatSignedPct(((tick.price - result.entry) / result.entry) * 100)}`
                : tick.type === "entry"
                  ? "매수"
                  : [
                      `${row!.step}차`,
                      `${row!.weight}%`,
                      ...(hasShares ? [`${result.budget!.shares[tick.ladderIndex!]}주`] : []),
                      formatSignedPct(row!.gainPct),
                    ].join(" · ");

            return (
              <div key={`${tick.type}-${tick.ladderIndex ?? "x"}`}>
                <span
                  className={`absolute -left-1 h-2.5 w-2.5 rounded-full ${dotCls[tick.type]} ${move}`}
                  style={{ bottom: tick.y, marginBottom: -5 }}
                />
                {/* 라벨이 밀려 올라갔으면 점과 잇는 가는 선을 긋는다 */}
                {shifted > 2 && (
                  <span
                    className="absolute left-0 w-px bg-border"
                    style={{ bottom: tick.y, height: shifted }}
                  />
                )}
                <div
                  className={`absolute left-5 right-0 flex flex-wrap items-baseline gap-1.5 ${move}`}
                  style={{ bottom: tick.labelY, marginBottom: -9 }}
                >
                  <span
                    className={`text-[15px] font-bold leading-tight ${
                      tick.type === "sell" ? "text-profit" : tick.type === "stop" ? "text-loss" : ""
                    }`}
                  >
                    {formatPrice(tick.price, market)}
                  </span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{meta}</span>
                  {tick.type === "sell" && rowBadge(result, tick.ladderIndex!)}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** 상한 입력값 복원: verdict가 있으면 배지 계산에 쓰인 원래 상한가가 필요하다 */
function parseCeiling(result: LadderResult): number | null {
  // judgeCeiling이 null이 아니면 유효한 상한가가 있었다는 뜻 —
  // 상한선 y 계산을 위해 배지 경계로부터가 아니라 입력에서 직접 받는 편이 정확하다.
  // LadderResult에 ceilingPrice를 실어 나른다 (use-ladder에서 세팅).
  return result.ceilingPrice ?? null;
}

/* ── 예산 블록 ───────────────────────────────────────────────── */

function BudgetBlock({ result }: { result: LadderResult }) {
  const budget = result.budget;
  if (!budget) return null;

  if (budget.insufficient) {
    return (
      <Card>
        <CardContent className="text-[13px] text-muted-foreground">
          예산이 1주 값에 못 미칩니다.
        </CardContent>
      </Card>
    );
  }

  const rows: Array<[string, string, string]> = [
    ["총 수량", `${budget.qty.toLocaleString()}주 (${budget.shares.join(" · ")})`, ""],
    ["매수 금액", `${formatPrice(budget.buyAmount, "KR")}원`, ""],
    ["손절 시", `${formatMoney(budget.stopNet)}원`, "text-loss"],
    ["전량 익절 시", `${formatMoney(budget.takeNet)}원`, "text-profit"],
  ];

  return (
    <Card>
      <CardContent>
        <h2 className="mb-2 text-sm font-bold text-muted-foreground">예산 기준</h2>
        <dl>
          {rows.map(([label, value, cls]) => (
            <div
              key={label}
              className="flex items-baseline justify-between border-t py-1.5 text-[13px] first:border-t-0"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={`font-bold ${cls}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/* ── 스크린리더 요약 ─────────────────────────────────────────── */

function LiveSummary({ result, market }: ResultsProps) {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    슬라이더를 굴리는 동안 매 값을 읽어주면 말이 끊이지 않는다.
    손이 멈춘 뒤(500ms) 한 번만 요약해 알려준다.
    상한 판정("이 거래는 포기" 등)은 가장 중요한 경고라 반드시 포함한다.
  */
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      let summary =
        "매도가 " +
        result.ladder.map((row) => formatPrice(row.price, market)).join(", ") +
        ". 필요 상승률 " +
        formatSignedPct(result.metrics.requiredGainPct) +
        ".";
      if (result.ceiling) summary += " " + result.ceiling.message;
      setText(summary);
    }, 500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [result, market]);

  return (
    <p aria-live="polite" className="sr-only">
      {text}
    </p>
  );
}

/* ── 조합 ────────────────────────────────────────────────────── */

export function Results({ result, market }: ResultsProps) {
  return (
    <div className="space-y-3">
      <h2 className="sr-only">계산 결과</h2>
      <HeroPrice result={result} market={market} />
      <PlanTable result={result} market={market} />
      <MetricChips result={result} />
      <CeilingVerdict result={result} />
      <PriceRail result={result} market={market} />
      <BudgetBlock result={result} />
      <LiveSummary result={result} market={market} />
    </div>
  );
}

