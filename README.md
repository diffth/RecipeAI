# RecipeAI (MVP)

요리 사진을 올리면 **요리 이름(신뢰도 포함)** 과 **1인분 영양 평가(칼로리·탄단지·당류·식이섬유·나트륨)** 를 보여 주는 Next.js 웹앱입니다. 인식과 영양 추정은 Gemini API가 하며, 영양 수치는 **AI 추정치**입니다.

## 실행 방법

1. 의존성 설치

   ```bash
   npm install
   ```

2. API 키 설정 — `.env.example`을 `.env.local`로 복사하고 `GEMINI_API_KEY`를 채웁니다 (키 발급: https://aistudio.google.com/apikey).

   ```bash
   copy .env.example .env.local
   ```

3. 개발 서버 실행 후 http://localhost:3000 접속

   ```bash
   npm run dev
   ```

   같은 와이파이의 휴대폰에서 카메라로 찍어 보려면 `npm run dev -- -H 0.0.0.0`으로 띄우고 `http://<PC의 IP>:3000`으로 접속합니다.

## 구조

| 파일 | 역할 |
| --- | --- |
| `app/page.tsx` | 업로드(선택·드래그·모바일 카메라)·미리보기·결과 화면 |
| `app/api/analyze/route.ts` | `POST /api/analyze` (multipart `image`), 형식·크기(8MB) 검증 |
| `lib/analyze.ts` | Gemini 호출(structured output), zod 검증 |
| `lib/nutrition.ts` | 탄단지 칼로리 비율 계산(4/4/9 kcal) |

`GEMINI_MODEL`을 비우면 `gemini-flash-latest` 별칭을 씁니다.

## 다음 단계 (범위 밖)

레시피 생성, 기록 저장·로그인, 식약처 식품영양성분 DB 연동, 배포.
