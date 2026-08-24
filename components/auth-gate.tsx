"use client";

/*
  로그인 문지기.
  로그인 전에는 계산기 대신 로그인 폼을 보여준다.

  비밀은 전부 서버에 있다 — 브라우저는 "지금 로그인된 상태인가"만 물어보고,
  실제 Apps Script 주소·키는 구경도 하지 못한다.
*/
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSession, login } from "@/lib/gas";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  // null = 아직 확인 중 (로그인 폼이 잠깐 번쩍이지 않도록)
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    checkSession().then((ok) => {
      if (alive) setAuthed(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
      setAuthed(true);
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (authed === null) {
    return <p className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (authed) return <>{children}</>;

  return (
    <Card className="mx-auto mt-8 max-w-sm">
      <CardHeader>
        <CardTitle className="text-base">로그인</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">아이디</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">비밀번호</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "확인 중…" : "로그인"}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            한 번 로그인하면 30일간 유지됩니다. 저장 설정(웹앱 주소·키)은 서버에
            보관되어 있어 기기를 바꿔도 다시 넣을 필요가 없습니다.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
