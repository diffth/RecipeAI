import { NextResponse } from "next/server";
import { analyzeFoodImage, AnalyzeError } from "@/lib/analyze";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "이미지 업로드 형식이 잘못되었습니다." }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image 필드에 사진을 넣어 주세요." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `지원하지 않는 형식입니다 (${file.type || "알 수 없음"}). JPG·PNG·WEBP·HEIC만 됩니다.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "사진이 너무 큽니다 (최대 8MB)." }, { status: 413 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await analyzeFoodImage(buf, file.type);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AnalyzeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "알 수 없는 오류가 발생했습니다." }, { status: 500 });
  }
}
