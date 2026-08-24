import type { NextConfig } from "next";

/*
  Vercel 배포 설정.
  예전에는 GitHub Pages용 정적 export(output: 'export')였지만,
  이제 서버가 필요하다 — Apps Script 주소·키를 브라우저에 내려보내지 않고
  서버 안에서만 쓰기 위해서다(app/api/plans).
*/
const nextConfig: NextConfig = {};

export default nextConfig;
