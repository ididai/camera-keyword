# Camera Keyword · AI Prompt Generator

AI 이미지/영상 생성을 위한 카메라 키워드 프롬프트 생성기

## 로컬 실행

```bash
npm install
cp .env.example .env.local
# .env.local에 아래 키 입력
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_ANON_KEY
# - VITE_AUTH_REDIRECT_URL (운영 도메인 권장, 예: https://icecam.icedong.com)
# - GEMINI_API_KEY
npm run dev
```

## 배포 (Vercel)

GitHub에 push하면 자동 배포됩니다.

- Build Command: `npm run build`
- Output Directory: `dist`
