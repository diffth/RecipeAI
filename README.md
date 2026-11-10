# RecipeAI (MVP)

요리 사진을 올리면 **요리 이름(신뢰도 포함)** 과 **1인분 영양 평가(칼로리·탄단지·당류·식이섬유·나트륨)** 를 보여 주고, 버튼을 누르면 **레시피(재료·인분 조절·조리 순서·팁)** 까지 알려 주는 Next.js 웹앱입니다. 인식·영양 추정·레시피 생성은 Gemini API가 하며, 수치와 레시피는 **AI 추정·생성 결과**입니다.

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
| `app/api/recipe/route.ts` | `POST /api/recipe` (JSON `nameKo` 등), 레시피 요청 |
| `lib/recipe.ts` | Gemini 레시피 생성(2인분 기준), zod 검증 |

`GEMINI_MODEL`을 비우면 `gemini-3.8-flash`를 씁니다. SDK가 `v1` API를 쓰기 때문에 `gemini-flash-latest` 같은 `-latest` 별칭은 동작하지 않습니다.

## 다음 단계 (범위 밖)

기록 저장·로그인, 식약처 식품영양성분 DB 연동, 배포.
