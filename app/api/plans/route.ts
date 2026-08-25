/*
  저장·목록 중계.
  브라우저는 여기까지만 부르고, Apps Script 주소와 키는 서버 안에서만 쓴다.
  덕분에 개발자도구를 열어도 키는 보이지 않는다.
*/
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession, readServerConfig, type ServerConfig } from "@/lib/server/auth";

/** 응답이 없으면 이만큼 기다렸다 포기한다 */
const TIMEOUT = 15000;

async function requireSession(): Promise<
  { config: ServerConfig } | { error: NextResponse }
> {
  let config: ServerConfig;
  try {
    config = readServerConfig();
  } catch (error) {
    return {
      error: NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "서버 설정 오류" },
        { status: 500 },
      ),
    };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSession(config, token)) {
    return { error: NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  return { config };
}

async function callGas(url: string, options: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 저장 목록 */
export async function GET() {
  const gate = await requireSession();
  if ("error" in gate) return gate.error;
  const { config } = gate;

  try {
    const url =
      config.gasUrl +
      (config.gasUrl.includes("?") ? "&" : "?") +
      "key=" + encodeURIComponent(config.gasKey) + "&action=list";
    return NextResponse.json(await callGas(url, { method: "GET" }));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "목록을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}

/**
 * 계획 삭제.
 * Apps Script 웹앱은 GET·POST만 받으므로, 브라우저의 DELETE를 받아
 * 구글 쪽에는 action: 'delete'를 실은 POST로 바꿔 보낸다.
 */
export async function DELETE(request: Request) {
  const gate = await requireSession();
  if ("error" in gate) return gate.error;
  const { config } = gate;

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "지울 계획을 지정하지 않았습니다." }, { status: 400 });
  }

  try {
    const result = await callGas(config.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        key: config.gasKey,
        action: "delete",
        id: body.id,
      }),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "삭제하지 못했습니다." },
      { status: 502 },
    );
  }
}

/** 계획 저장 */
export async function POST(request: Request) {
  const gate = await requireSession();
  if ("error" in gate) return gate.error;
  const { config } = gate;

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "저장할 내용이 없습니다." }, { status: 400 });
  }

  try {
    /*
      Content-Type을 text/plain으로 보내는 규칙은 그대로 지킨다.
      Apps Script 웹앱이 그렇게 받도록 되어 있기 때문이다(기획서 7.2절).
    */
    const result = await callGas(config.gasUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, key: config.gasKey }),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "저장하지 못했습니다." },
      { status: 502 },
    );
  }
}
