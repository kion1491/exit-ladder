"use client";

/*
  계산기 전체를 묶는 최상위 컴포넌트.
  상태는 useLadder 훅에, 입력은 LadderForm에 있고,
  여기서는 둘을 잇고 에러/결과를 배치한다.
  (결과 영역은 Session 3에서 히어로·표·레일 컴포넌트로 교체된다)
*/
import { LadderForm } from "@/components/ladder-form";
import { formatMoney, formatPrice, formatSignedPct } from "@/lib/calc";
import { useLadder } from "@/lib/use-ladder";

export function Calculator() {
  const { inputs, setField, derived } = useLadder();

  return (
    <div className="space-y-3">
      <LadderForm inputs={inputs} setField={setField} />

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
        /* Session 2 임시 출력 — Session 3에서 교체 */
        <pre className="overflow-x-auto rounded-lg border bg-card p-4 text-[13px] leading-relaxed">
          {derived.result.ladder
            .map(
              (row) =>
                `${row.step}차  ${formatPrice(row.price, inputs.market)}  ${row.weight}%  ${formatSignedPct(row.gainPct)}${row.belowEntry ? "  ⚠ 매수가 이하" : ""}`,
            )
            .join("\n")}
          {"\n\n"}
          손절폭 {derived.result.metrics.stopWidthPct.toFixed(1)}% [{derived.result.metrics.stopTone}]
          {"\n"}본전 승률 {derived.result.metrics.breakEvenWinRate}%
          {"\n"}필요 상승률 {formatSignedPct(derived.result.metrics.requiredGainPct)}
          {derived.result.ceiling ? `\n\n[상한] ${derived.result.ceiling.message}` : ""}
          {derived.result.budget && !derived.result.budget.insufficient
            ? `\n\n[예산] 총 ${derived.result.budget.qty}주 (${derived.result.budget.shares.join(" / ")})` +
              `\n손절 시 ${formatMoney(derived.result.budget.stopNet)}원` +
              `\n전량 익절 시 ${formatMoney(derived.result.budget.takeNet)}원`
            : ""}
        </pre>
      )}
    </div>
  );
}
