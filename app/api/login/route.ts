/* 로그인 — 아이디·비번이 맞으면 세션 쿠키를 내준다 */
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE, createSessionToken, readServerConfig, sessionCookieOptions, verifyCredentials,
} from "@/lib/server/auth";

export async function POST(request: Request) {
  let config;
  try {
    config = readServerConfig();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "서버 설정 오류" },
      { status: 500 },
    );
  }

  const { username, password } = (await request.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  if (!verifyCredentials(config, username ?? "", password ?? "")) {
    // 아이디가 틀렸는지 비번이 틀렸는지는 알려주지 않는다
    return NextResponse.json({ ok: false, error: "아이디 또는 비밀번호가 맞지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(config), sessionCookieOptions);
  return response;
}
