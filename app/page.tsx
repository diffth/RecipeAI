"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/analyze";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: AnalysisResult };

const LOW_CONFIDENCE = 0.6;

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Release the last blob URL when the page unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pick(f: File | undefined | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setState({ kind: "idle" });
  }

  async function analyze() {
    if (!file) return;
    setState({ kind: "loading" });
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/analyze", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
      setState({ kind: "done", result: json });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-bold">RecipeAI</h1>
      <p className="mt-1 text-sm text-neutral-500">
        요리 사진을 올리면 요리 이름과 영양 정보를 알려 드립니다.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        className={`mt-6 flex min-h-56 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-neutral-300 dark:border-neutral-700"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="선택한 요리 사진" className="max-h-96 w-full object-contain" />
        ) : (
          <div className="p-6 text-center text-neutral-500">
            <div className="text-4xl">📷</div>
            <div className="mt-2">사진을 찍거나 선택해 주세요</div>
            <div className="text-xs">드래그해서 놓아도 됩니다 · JPG/PNG/WEBP/HEIC, 최대 8MB</div>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />

      <button
        onClick={analyze}
        disabled={!file || state.kind === "loading"}
        className="mt-4 w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.kind === "loading" ? "분석 중…" : "분석하기"}
      </button>

      {state.kind === "error" && (
        <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {state.message}
        </div>
      )}

      {state.kind === "done" && <ResultView r={state.result} />}

      <footer className="mt-10 text-center text-xs text-neutral-500">
        영양 수치는 AI 추정치이며 실제와 다를 수 있습니다 (출처: Gemini 추정)
      </footer>
    </main>
  );
}

function ResultView({ r }: { r: AnalysisResult }) {
  if (!r.isFood) {
    return (
      <div className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        음식 사진이 아닌 것 같습니다. 요리가 잘 보이게 다시 찍어 주세요.
      </div>
    );
  }
  const pct = Math.round(r.dish.confidence * 100);
  const low = r.dish.confidence < LOW_CONFIDENCE;
  const n = r.nutrition;

  return (
    <section className="mt-6 space-y-4">
      <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">{r.dish.nameKo}</h2>
          <span className="text-sm text-neutral-500">{r.dish.nameEn}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className={`h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="whitespace-nowrap tabular-nums">
            신뢰도 {pct}%{low && " · 확실하지 않음"}
          </span>
        </div>
        {r.alternatives.length > 0 && (
          <div className="mt-3 text-sm text-neutral-500">
            다른 후보:{" "}
            {r.alternatives
              .map((a) => `${a.nameKo} (${Math.round(a.confidence * 100)}%)`)
              .join(", ")}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <div className="text-sm text-neutral-500">{r.servingAssumption}</div>
        <div className="mt-1 text-4xl font-bold tabular-nums">
          {Math.round(n.calories)} <span className="text-lg font-medium">kcal</span>
        </div>

        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div className="bg-sky-500" style={{ width: `${r.macroRatio.carbs}%` }} />
          <div className="bg-rose-500" style={{ width: `${r.macroRatio.protein}%` }} />
          <div className="bg-amber-500" style={{ width: `${r.macroRatio.fat}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <Macro color="bg-sky-500" label="탄수화물" g={n.carbs} pct={r.macroRatio.carbs} />
          <Macro color="bg-rose-500" label="단백질" g={n.protein} pct={r.macroRatio.protein} />
          <Macro color="bg-amber-500" label="지방" g={n.fat} pct={r.macroRatio.fat} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
          <Stat label="당류" value={`${round1(n.sugar)} g`} />
          <Stat label="식이섬유" value={`${round1(n.fiber)} g`} />
          <Stat label="나트륨" value={`${Math.round(n.sodium)} mg`} />
        </dl>
      </div>

      <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
        <h3 className="font-semibold">영양 평가</h3>
        <p className="mt-2 text-sm">{r.assessment.summary}</p>
        {r.assessment.highlights.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {r.assessment.highlights.map((h, i) => (
              <li key={i}>👍 {h}</li>
            ))}
          </ul>
        )}
        {r.assessment.cautions.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {r.assessment.cautions.map((c, i) => (
              <li key={i}>⚠️ {c}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-xs text-neutral-400">모델: {r.model}</div>
      </div>
    </section>
  );
}

function Macro({ color, label, g, pct }: { color: string; label: string; g: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-neutral-500">
        <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
        {label}
      </div>
      <div className="font-semibold tabular-nums">
        {round1(g)} g <span className="font-normal text-neutral-500">{pct}%</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
