# Camera Keyword · AI Prompt Generator

AI 이미지/영상 생성을 위한 카메라 키워드 프롬프트 생성기

## 로컬 실행

```bash
npm install
cp .env.example .env
# .env에 아래 키 입력
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_AUTH_REDIRECT_URL (운영 도메인 권장, 예: https://icecam.icedong.com)
# - GEMINI_API_KEY
npm run dev
```

`npm run dev`는 웹(Vite) + 로컬 API(`vercel dev`)를 함께 실행합니다.

## 품질 게이트

```bash
npm run check          # lint + typecheck + unit + build
npm run test:e2e:smoke # Playwright smoke (360x800)
```

GitHub Actions `quality-gate` 워크플로우에서 동일 순서로 검증합니다.

## 배포 (Vercel)

GitHub에 push하면 자동 배포됩니다.

- Build Command: `npm run build`
- Output Directory: `dist`
