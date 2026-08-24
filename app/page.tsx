export default function Home() {
  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="text-xl font-bold">매도 사다리</h1>
      <p className="text-sm text-muted-foreground">
        손익비를 정하면 매도가를 역산합니다. 도달 가능한지는 당신이 판단하세요.
      </p>
      {/* 입력 폼·결과 화면은 Session 2~3에서 이 자리에 들어온다 */}
    </main>
  );
}
