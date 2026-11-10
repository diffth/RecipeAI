import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { macroRatio, type MacroRatio } from "./nutrition";

// The SDK calls the v1 API, where "-latest" aliases are not served; pin a concrete
// model and override with GEMINI_MODEL.
export const DEFAULT_MODEL = "gemini-3.8-flash";

const num = { type: Type.NUMBER };
const str = { type: Type.STRING };

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    isFood: { type: Type.BOOLEAN },
    dish: {
      type: Type.OBJECT,
      properties: { nameKo: str, nameEn: str, confidence: num },
      required: ["nameKo", "nameEn", "confidence"],
    },
    alternatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { nameKo: str, confidence: num },
        required: ["nameKo", "confidence"],
      },
    },
    servingAssumption: str,
    nutrition: {
      type: Type.OBJECT,
      properties: {
        calories: num,
        carbs: num,
        protein: num,
        fat: num,
        sugar: num,
        sodium: num,
        fiber: num,
      },
      required: ["calories", "carbs", "protein", "fat", "sugar", "sodium", "fiber"],
    },
    assessment: {
      type: Type.OBJECT,
      properties: {
        summary: str,
        highlights: { type: Type.ARRAY, items: str },
        cautions: { type: Type.ARRAY, items: str },
      },
      required: ["summary", "highlights", "cautions"],
    },
  },
  required: ["isFood", "dish", "alternatives", "servingAssumption", "nutrition", "assessment"],
};

const nonNeg = z.number().finite().min(0);
const conf = z.number().min(0).max(1);

const ModelResult = z.object({
  isFood: z.boolean(),
  dish: z.object({ nameKo: z.string(), nameEn: z.string(), confidence: conf }),
  alternatives: z.array(z.object({ nameKo: z.string(), confidence: conf })),
  servingAssumption: z.string(),
  nutrition: z.object({
    calories: nonNeg,
    carbs: nonNeg,
    protein: nonNeg,
    fat: nonNeg,
    sugar: nonNeg,
    sodium: nonNeg,
    fiber: nonNeg,
  }),
  assessment: z.object({
    summary: z.string(),
    highlights: z.array(z.string()),
    cautions: z.array(z.string()),
  }),
});

export type AnalysisResult = z.infer<typeof ModelResult> & {
  macroRatio: MacroRatio;
  model: string;
};

const PROMPT = `너는 음식 사진을 분석하는 영양사다. 사진을 보고 다음을 JSON으로 답하라.

- isFood: 사진의 주 피사체가 먹는 음식(요리)이면 true, 아니면 false. false면 나머지 필드는 빈 문자열/0/빈 배열로 채운다.
- dish: 가장 가능성이 높은 요리 이름. nameKo는 한국어 통용 이름, nameEn은 영어 이름. confidence는 0~1 사이의 실제 확신 정도(애매하면 낮게).
- alternatives: 다른 후보 요리 최대 3개(신뢰도 내림차순). 확실하면 빈 배열.
- servingAssumption: 사진에 보이는 양을 기준으로 가정한 1인분 분량(예: "1인분 약 400g, 밥 1공기 포함").
- nutrition: 그 분량 기준 추정치. calories(kcal), carbs/protein/fat/sugar/fiber(g), sodium(mg).
- assessment: 한국어 영양 평가. summary는 1~2문장, highlights는 장점 1~3개, cautions는 주의점 0~3개. 각 항목은 짧게.

추정치임을 전제로 하되, 일반적인 레시피와 보이는 재료를 근거로 현실적인 값을 내라.`;

export class AnalyzeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function analyzeFoodImage(
  data: Buffer,
  mimeType: string,
): Promise<AnalysisResult> {
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
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: data.toString("base64") } },
            { text: PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.2,
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
    parsed = ModelResult.parse(JSON.parse(text));
  } catch {
    throw new AnalyzeError("Gemini 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.", 502);
  }

  parsed.alternatives = parsed.alternatives
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  return { ...parsed, macroRatio: macroRatio(parsed.nutrition), model };
}
