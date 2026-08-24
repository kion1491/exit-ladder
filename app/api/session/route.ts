/* 지금 로그인된 상태인지 묻는다 (첫 화면에서 로그인 폼을 띄울지 판단용) */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession, readServerConfig } from "@/lib/server/auth";

export async function GET() {
  try {
    const config = readServerConfig();
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    return NextResponse.json({ ok: true, authenticated: isValidSession(config, token) });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      authenticated: false,
      error: error instanceof Error ? error.message : "서버 설정 오류",
    });
  }
}
