"use client";

/*
  저장 기능의 브라우저 쪽 창구.
  예전에는 여기서 구글 Apps Script를 직접 불렀지만, 이제는 우리 서버(/api/plans)만 부른다.
  Apps Script 주소와 키는 서버 환경변수에만 있어서 브라우저로 내려오지 않는다.
  개발자도구를 열어도 볼 수 있는 건 "/api/plans를 불렀다"는 사실뿐이다.
*/

interface ApiResponse {
  ok: boolean;
  error?: string;
  rows?: unknown[][];
  authenticated?: boolean;
}

export interface SavePayload {
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

/** 응답을 읽고, 실패면 서버가 알려준 이유로 예외를 던진다 */
async function readResult(response: Response): Promise<ApiResponse> {
  const result = (await response.json().catch(() => null)) as ApiResponse | null;
  if (!result) throw new Error("서버 응답을 읽지 못했습니다.");
  if (!result.ok) throw new Error(result.error || "알 수 없는 오류");
  return result;
}

export async function savePlan(payload: SavePayload): Promise<void> {
  const response = await fetch("/api/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await readResult(response);
}

export async function fetchPlans(): Promise<unknown[][]> {
  const result = await readResult(await fetch("/api/plans"));
  return result.rows ?? [];
}

/* ── 로그인 ─────────────────────────────────────────────────────── */

export async function checkSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/session");
    const result = (await response.json()) as ApiResponse;
    return Boolean(result.authenticated);
  } catch {
    return false;
  }
}

export async function login(username: string, password: string): Promise<void> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await readResult(response);
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}
