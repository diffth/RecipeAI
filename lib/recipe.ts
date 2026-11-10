import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { AnalyzeError, DEFAULT_MODEL } from "./analyze";

// Recipes are generated for this many servings; the UI rescales from here.
export const BASE_SERVINGS = 2;

const num = { type: Type.NUMBER };
const str = { type: Type.STRING };

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    title: str,
    summary: str,
    timeMinutes: num,
    difficulty: { type: Type.STRING, enum: ["쉬움", "보통", "어려움"] },
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: str,
          quantity: { type: Type.NUMBER, nullable: true },
          unit: str,
        },
        required: ["name", "quantity", "unit"],
      },
    },
    steps: { type: Type.ARRAY, items: str },
    tips: { type: Type.ARRAY, items: str },
  },
  required: ["title", "summary", "timeMinutes", "difficulty", "ingredients", "steps", "tips"],
};

const Recipe = z.object({
  title: z.string(),
  summary: z.string(),
  timeMinutes: z.number().finite().min(0),
  difficulty: z.enum(["쉬움", "보통", "어려움"]),
  ingredients: z
    .array(
      z.object({
        name: z.string(),
        // null for "to taste" amounts that can't be scaled
        quantity: z.number().finite().min(0).nullable(),
        unit: z.string(),
      }),
    )
    .min(1),
  steps: z.array(z.string()).min(1),
  tips: z.array(z.string()),
});

export type RecipeResult = z.infer<typeof Recipe> & { servings: number; model: string };

export type RecipeRequest = { nameKo: string; nameEn?: string; servingAssumption?: string };

function buildPrompt(req: RecipeRequest) {
  const name = req.nameEn ? `${req.nameKo} (${req.nameEn})` : req.nameKo;
  const look = req.servingAssumption ? `\n사진 속 요리의 모습: ${req.servingAssumption}` : "";
  return `너는 가정 요리 전문가다. "${name}"의 집에서 만들 수 있는 레시피를 ${BASE_SERVINGS}인분 기준으로 JSON으로 답하라.${look}

- title: 요리 이름(한국어).
- summary: 어떤 요리인지 한 문장.
- timeMinutes: 준비부터 완성까지 예상 시간(분).
- difficulty: "쉬움", "보통", "어려움" 중 하나.
- ingredients: 재료 목록. quantity는 ${BASE_SERVINGS}인분 기준 숫자, unit은 단위(g, ml, 개, 큰술, 작은술, 컵, 공기 등). "약간", "적당량"처럼 수치가 없으면 quantity는 null, unit에 "약간"처럼 쓴다.
- steps: 조리 순서. 한 단계에 한 동작, 불 세기와 시간을 구체적으로. 양념장 재료까지 steps에 나오는 모든 재료는 ingredients에 있어야 한다. 인분을 바꿔도 맞도록 steps에는 재료 분량 숫자를 쓰지 말고("고추장 2큰술" 대신 "고추장") 재료 이름만 쓴다.
- tips: 사진 속 요리처럼 맛과 모양을 내는 팁 1~3개.

한국 가정에서 구하기 쉬운 재료와 계량 단위를 쓴다.`;
}

export async function generateRecipe(req: RecipeRequest): Promise<RecipeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AnalyzeError(
      "GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 키를 넣고 서버를 다시 시작해 주세요.",
      500,
    );
  }
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: buildPrompt(req) }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.4,
      },
    });
    text = res.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AnalyzeError(`Gemini 호출 실패 (${model}): ${msg}`, 502);
  }

  if (!text) throw new AnalyzeError("Gemini 응답이 비어 있습니다.", 502);

  let parsed;
  try {
    parsed = Recipe.parse(JSON.parse(text));
  } catch {
    throw new AnalyzeError("레시피 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
  }

  return { ...parsed, servings: BASE_SERVINGS, model };
}
