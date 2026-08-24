import type { NextConfig } from "next";

/*
  GitHub Pages 정적 배포 설정.
  - output 'export': 서버 없이 파일만으로 동작하는 정적 산출물(out/)을 만든다
  - basePath: 배포 주소가 kion1491.github.io/exit-ladder 이므로
    모든 경로 앞에 /exit-ladder 를 붙여야 자원을 제대로 찾는다
  - images.unoptimized: 이미지 최적화 서버가 없는 환경이므로 원본 그대로 쓴다
*/
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/exit-ladder",
  assetPrefix: "/exit-ladder",
  images: { unoptimized: true },
};

export default nextConfig;
