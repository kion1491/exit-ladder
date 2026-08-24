/*
  구글시트 저장 백엔드(Apps Script 웹앱) 클라이언트.
  API 계약은 기획서 7.2절 그대로다 — 이미 배포된 백엔드를 재배포 없이 그대로 쓴다.

  핵심 규칙:
  - POST의 Content-Type은 반드시 text/plain;charset=utf-8.
    application/json이면 브라우저가 본 요청 전에 OPTIONS(preflight)를 던지는데
    Apps Script 웹앱은 그걸 받지 못해 요청이 통째로 실패한다.
  - GAS는 302 리다이렉트로 응답을 넘기므로 redirect: 'follow'.
  - 응답이 이만큼 없으면 포기한다 — 버튼이 '저장 중…'에 영영 묶이지 않게.
*/

const REQUEST_TIMEOUT = 15000;

export interface GasConnection {
  url: string;
  key: string;
}

export interface SavePayload {
  key: string;
  name: string;
  market: string;
  entry: number;
  stop: number;
  splits: number;
  ratio: number;
  sells: string;
  budget: number | "";
  ceiling: number | "";
  memo: string;
}

interface GasResponse {
  ok: boolean;
  error?: string;
  rows?: unknown[][];
}

/** 시간 제한이 걸린 fetch. AbortController는 '이 요청 그만해' 리모컨이다. */
async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("응답이 없습니다. 잠시 후 다시 시도해주세요.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function savePlan(
  connection: GasConnection,
  payload: Omit<SavePayload, "key">,
): Promise<void> {
  const response = await fetchWithTimeout(connection.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ key: connection.key, ...payload }),
    redirect: "follow",
  });
  const result = (await response.json()) as GasResponse;
  if (!result.ok) throw new Error(result.error || "알 수 없는 오류");
}

export async function fetchPlans(connection: GasConnection): Promise<unknown[][]> {
  const url =
    connection.url +
    (connection.url.includes("?") ? "&" : "?") +
    "key=" + encodeURIComponent(connection.key) + "&action=list";
  const response = await fetchWithTimeout(url, { method: "GET", redirect: "follow" });
  const result = (await response.json()) as GasResponse;
  if (!result.ok) throw new Error(result.error || "알 수 없는 오류");
  return result.rows ?? [];
}

/* ── 설정 보관 — 이전 버전과 같은 localStorage 키를 써서 기존 설정이 그대로 살아난다 ── */

const URL_KEY = "ladder.gasUrl";
const KEY_KEY = "ladder.gasKey";

/*
  localStorage는 브라우저 설정(시크릿 모드 등)에 따라 접근만으로 예외를 던질 수 있다.
  저장 설정 하나 때문에 계산기가 멈추면 안 되므로 전부 try/catch로 감싼다.
*/
export function readConnection(): GasConnection {
  try {
    return {
      url: window.localStorage.getItem(URL_KEY) ?? "",
      key: window.localStorage.getItem(KEY_KEY) ?? "",
    };
  } catch {
    return { url: "", key: "" };
  }
}

export function writeConnection(connection: GasConnection): void {
  try {
    window.localStorage.setItem(URL_KEY, connection.url.trim());
    window.localStorage.setItem(KEY_KEY, connection.key.trim());
  } catch {
    // 기억해두지 못할 뿐, 이번 세션에서 쓰는 데는 문제가 없다
  }
}

/**
 * 저장 목록의 날짜를 사람이 읽기 좋게 다듬는다.
 * "2026-08-24T07:18:26.000Z" 같은 기계용 표기(세계 표준시)가 오면
 * 보는 사람의 시간대로 바꾸고, 이미 정리된 문자열이면 손대지 않는다.
 */
export function formatRecordDate(value: unknown): string {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
  const date = new Date(text);
  if (isNaN(date.getTime())) return text;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
