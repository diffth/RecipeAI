"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/analyze";
import type { RecipeResult } from "@/lib/recipe";

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
  // Bumped per analysis so the result view (and any name edits/recipe in it) starts fresh.
  const [runId, setRunId] = useState(0);
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
      setRunId((n) => n + 1);
      setState({ kind: "done", result: json });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10 lg:max-w-6xl lg:px-8">
      <h1 className="text-2xl font-bold sm:text-3xl">RecipeAI</h1>
      <p className="mt-1 text-sm text-neutral-500 sm:text-base">
        요리 사진을 올리면 요리 이름과 영양 정보를 알려 드립니다.
      </p>

      {/* Desktop: upload on the left (sticky), results on the right. Mobile: one column. */}
      <div className="lg:mt-8 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8">
        <div className="lg:sticky lg:top-8">
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
            className={`mt-6 flex min-h-48 cursor-pointer sm:min-h-64 lg:mt-0 lg:min-h-80 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
              dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-neutral-300 dark:border-neutral-700"
            }`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={preview} alt="선택한 요리 사진" className="max-h-80 w-full object-contain sm:max-h-96 lg:max-h-[32rem]" />
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
        </div>

        <div>
          {state.kind === "done" ? (
            <ResultView key={runId} r={state.result} />
          ) : (
            <div className="hidden min-h-80 items-center justify-center rounded-2xl border border-neutral-200 p-6 text-center text-neutral-400 lg:flex dark:border-neutral-800">
              {state.kind === "loading" ? "사진을 분석하고 있습니다…" : "분석 결과가 여기에 표시됩니다"}
            </div>
          )}
        </div>
      </div>

      <footer className="mt-10 text-center text-xs text-neutral-500">
        영양 수치는 AI 추정치이며 실제와 다를 수 있습니다 (출처: Gemini 추정)
      </footer>
    </main>
  );
}

const MAX_NAME = 50;

type RecipeDish = { nameKo: string; nameEn?: string; servingAssumption?: string };

function ResultView({ r }: { r: AnalysisResult }) {
  // User-corrected dish name; null means the AI's name is used.
  const [override, setOverride] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!r.isFood) {
    return (
      <div className="mt-6 rounded-2xl bg-amber-50 p-5 lg:mt-0 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        음식 사진이 아닌 것 같습니다. 요리가 잘 보이게 다시 찍어 주세요.
      </div>
    );
  }
  const pct = Math.round(r.dish.confidence * 100);
  const low = r.dish.confidence < LOW_CONFIDENCE;
  const n = r.nutrition;
  const corrected = override !== null;
  const dish: RecipeDish = corrected
    ? // The photo's serving description may name the misrecognized dish, so it isn't sent.
      { nameKo: override }
    : { nameKo: r.dish.nameKo, nameEn: r.dish.nameEn, servingAssumption: r.servingAssumption };

  function startEdit() {
    setDraft(override ?? r.dish.nameKo);
    setEditing(true);
  }

  function save() {
    const v = draft.trim().slice(0, MAX_NAME);
    if (!v) return;
    setOverride(v === r.dish.nameKo ? null : v);
    setEditing(false);
  }

  return (
    <section className="mt-6 space-y-4 lg:mt-0">
      <div className="rounded-2xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-wrap gap-2"
          >
            <input
              autoFocus
              value={draft}
              maxLength={MAX_NAME}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              aria-label="요리 이름"
              placeholder="요리 이름을 입력해 주세요"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-lg font-bold outline-none focus:border-emerald-500 dark:border-neutral-700"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700"
              >
                취소
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xl font-bold">{dish.nameKo}</h2>
              <button
                onClick={startEdit}
                className="text-sm text-neutral-500 underline-offset-2 hover:text-emerald-600 hover:underline"
              >
                ✏️ 이름 고치기
              </button>
            </div>
            {!corrected && <span className="text-sm text-neutral-500">{r.dish.nameEn}</span>}
          </div>
        )}

        {corrected ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
            <span>
              직접 고친 이름입니다 · AI 인식: {r.dish.nameKo} ({pct}%)
            </span>
            <button
              onClick={() => setOverride(null)}
              className="underline underline-offset-2 hover:text-emerald-600"
            >
              되돌리기
            </button>
          </div>
        ) : (
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
        )}

        {r.alternatives.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <span>다른 후보:</span>
            {r.alternatives.map((a) => (
              <button
                key={a.nameKo}
                onClick={() => {
                  setOverride(a.nameKo === r.dish.nameKo ? null : a.nameKo);
                  setEditing(false);
                }}
                aria-pressed={override === a.nameKo}
                className={`rounded-full border px-3 py-1 transition ${
                  override === a.nameKo
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-neutral-300 hover:border-emerald-500 dark:border-neutral-700"
                }`}
              >
                {a.nameKo} ({Math.round(a.confidence * 100)}%)
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
        {corrected && (
          <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            영양 정보는 사진 분석 기준입니다 (AI 인식: {r.dish.nameKo}). 이름을 고쳐도 다시 계산되지 않습니다.
          </div>
        )}
        <div className="text-sm text-neutral-500">{r.servingAssumption}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums sm:text-4xl">
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

      <div className="rounded-2xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
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

      {/* Keyed by name so correcting the dish clears a recipe made for the old name. */}
      <RecipeSection key={dish.nameKo} dish={dish} />
    </section>
  );
}

type RecipeState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; recipe: RecipeResult };

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 10;

function RecipeSection({ dish }: { dish: RecipeDish }) {
  const [state, setState] = useState<RecipeState>({ kind: "idle" });
  // null until the user adjusts it, so the recipe first shows the amounts it was written for
  const [chosenServings, setServings] = useState<number | null>(null);

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dish),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
      setState({ kind: "done", recipe: json });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (state.kind !== "done") {
    return (
      <div className="rounded-2xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
        <button
          onClick={load}
          disabled={state.kind === "loading"}
          className="w-full rounded-xl border border-emerald-600 py-3 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          {state.kind === "loading" ? "레시피를 만들고 있습니다…" : `🍳 ${dish.nameKo} 레시피 보기`}
        </button>
        {state.kind === "error" && (
          <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {state.message}
          </div>
        )}
      </div>
    );
  }

  const rc = state.recipe;
  const servings = chosenServings ?? rc.servings;
  const scale = servings / rc.servings;

  return (
    <div className="rounded-2xl border border-neutral-200 p-4 sm:p-5 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h3 className="text-lg font-bold">{rc.title} 레시피</h3>
        <span className="text-sm text-neutral-500">
          ⏱ 약 {Math.round(rc.timeMinutes)}분 · 난이도 {rc.difficulty}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{rc.summary}</p>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h4 className="font-semibold">재료</h4>
        <div className="flex items-center gap-2 text-sm">
          <button
            aria-label="인분 줄이기"
            onClick={() => setServings(Math.max(MIN_SERVINGS, servings - 1))}
            disabled={servings <= MIN_SERVINGS}
            className="h-8 w-8 rounded-full border border-neutral-300 disabled:opacity-30 dark:border-neutral-700"
          >
            −
          </button>
          <span className="w-12 text-center font-semibold tabular-nums">{servings}인분</span>
          <button
            aria-label="인분 늘리기"
            onClick={() => setServings(Math.min(MAX_SERVINGS, servings + 1))}
            disabled={servings >= MAX_SERVINGS}
            className="h-8 w-8 rounded-full border border-neutral-300 disabled:opacity-30 dark:border-neutral-700"
          >
            +
          </button>
        </div>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2">
        {rc.ingredients.map((ing, i) => (
          <li
            key={i}
            className="flex justify-between gap-2 border-b border-neutral-100 py-1.5 dark:border-neutral-900"
          >
            <span>{ing.name}</span>
            <span className="whitespace-nowrap text-neutral-600 tabular-nums dark:text-neutral-400">
              {ing.quantity == null ? ing.unit : `${formatQty(ing.quantity * scale)} ${ing.unit}`}
            </span>
          </li>
        ))}
      </ul>

      <h4 className="mt-5 font-semibold">조리 순서</h4>
      <ol className="mt-2 space-y-2 text-sm">
        {rc.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>

      {rc.tips.length > 0 && (
        <>
          <h4 className="mt-5 font-semibold">사진처럼 만드는 팁</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {rc.tips.map((t, i) => (
              <li key={i}>💡 {t}</li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 text-xs text-neutral-400">
        AI가 생성한 레시피입니다. 분량과 시간은 참고용입니다 · 모델: {rc.model}
      </div>
    </div>
  );
}

// Kitchen-friendly rounding: whole numbers for big amounts, one decimal for spoons and cups.
function formatQty(v: number) {
  if (v >= 10) return String(Math.round(v));
  return String(Math.round(v * 10) / 10);
}

function Macro({ color, label, g, pct }: { color: string; label: string; g: number; pct: number }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-neutral-500">
        <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
        {label}
      </div>
      {/* pct drops to its own line on narrow phones so the three columns don't overflow */}
      <div className="font-semibold tabular-nums">
        {round1(g)} g <span className="block font-normal text-neutral-500 min-[400px]:inline">{pct}%</span>
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
