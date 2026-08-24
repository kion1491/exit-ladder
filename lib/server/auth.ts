/*
  로그인·세션 — 서버에서만 도는 코드다.
  이 파일이 다루는 값(비밀번호, 서명 열쇠, Apps Script 주소·키)은
  절대 브라우저로 내려가지 않는다. 그게 이 구조의 존재 이유다.

  세션은 직접 서명한 토큰 한 장으로 처리한다.
  토큰 = 내용 + '.' + 내용을 서명 열쇠로 잠근 값.
  내용을 위조하면 서명이 맞지 않아 바로 들통난다.
*/
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_DAYS = 30;
export const SESSION_COOKIE = "ladder_session";

export interface ServerConfig {
  gasUrl: string;
  gasKey: string;
  username: string;
  password: string;
  secret: string;
}

/** 환경변수를 읽는다. 하나라도 비면 무엇이 빠졌는지 알려준다. */
export function readServerConfig(): ServerConfig {
  const config = {
    gasUrl: process.env.GAS_URL ?? "",
    gasKey: process.env.GAS_KEY ?? "",
    username: process.env.APP_USERNAME ?? "",
    password: process.env.APP_PASSWORD ?? "",
    secret: process.env.SESSION_SECRET ?? "",
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`서버 설정이 비어 있습니다: ${missing.join(", ")}`);
  }
  return config;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 길이가 달라도 안전하게, 시간차로 정답을 유추당하지 않도록 비교한다 */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export function verifyCredentials(
  config: ServerConfig,
  username: string,
  password: string,
): boolean {
  // 둘 다 확인해야 한다 — 하나라도 먼저 빠져나가면 어느 쪽이 틀렸는지 알려주는 셈이 된다
  const idOk = safeEqual(username, config.username);
  const pwOk = safeEqual(password, config.password);
  return idOk && pwOk;
}

export function createSessionToken(config: ServerConfig): string {
  const payload = base64url(
    JSON.stringify({ exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000 }),
  );
  return `${payload}.${sign(payload, config.secret)}`;
}

export function isValidSession(config: ServerConfig, token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload, config.secret))) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,          // 자바스크립트가 읽을 수 없다 = 개발자도구로도 못 꺼낸다
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
