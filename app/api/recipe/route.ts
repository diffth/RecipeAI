import { NextResponse } from "next/server";
import { AnalyzeError } from "@/lib/analyze";
import { generateRecipe } from "@/lib/recipe";

const MAX_TEXT = 200;

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT) : undefined;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 잘못되었습니다 (JSON 필요)." }, { status: 400 });
  }

  const nameKo = text(body?.nameKo);
  if (!nameKo) {
    return NextResponse.json({ error: "nameKo(요리 이름)를 넣어 주세요." }, { status: 400 });
  }

  try {
    const result = await generateRecipe({
      nameKo,
      nameEn: text(body.nameEn),
      servingAssumption: text(body.servingAssumption),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AnalyzeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
