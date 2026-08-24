import { Calculator } from "@/components/calculator";

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">매도 사다리</h1>
        <p className="text-sm text-muted-foreground">
          손익비를 정하면 매도가를 역산합니다. 도달 가능한지는 당신이 판단하세요.
        </p>
      </header>
      <Calculator />
    </main>
  );
}
