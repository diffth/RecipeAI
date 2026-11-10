export type Nutrition = {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  sugar: number;
  sodium: number;
  fiber: number;
};

export type MacroRatio = { carbs: number; protein: number; fat: number };

// Computed here instead of trusting the model, so the percentages always add up
// and stay consistent with the gram values shown next to them.
export function macroRatio(n: Pick<Nutrition, "carbs" | "protein" | "fat">): MacroRatio {
  const kcal = { carbs: n.carbs * 4, protein: n.protein * 4, fat: n.fat * 9 };
  const total = kcal.carbs + kcal.protein + kcal.fat;
  if (total <= 0) return { carbs: 0, protein: 0, fat: 0 };
  const carbs = Math.round((kcal.carbs / total) * 100);
  const protein = Math.round((kcal.protein / total) * 100);
  return { carbs, protein, fat: Math.max(0, 100 - carbs - protein) };
}
