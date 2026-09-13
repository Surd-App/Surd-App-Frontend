import type { UserQuestionState } from '../api/types';

export function localDay(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function collectMasteryDates(questionIds: number[], states: Record<number, UserQuestionState>) {
  const dates: number[] = [];
  let undated = 0;
  for (const id of questionIds) {
    const state = states[id];
    if (!state?.is_mastered) continue;
    const timestamp = state.mastered_at ? Date.parse(state.mastered_at) : NaN;
    if (Number.isFinite(timestamp)) dates.push(timestamp);
    else undated++;
  }
  return { dates, undated };
}

export function buildMasteryHeatmap(dates: number[], range: 'recent' | number, now = new Date()) {
  const end = range === 'recent' ? new Date(localDay(now.getTime())) : new Date(range, 11, 31);
  const start = range === 'recent' ? new Date(end) : new Date(range, 0, 1);
  // A rolling window of 365 local calendar days, including today.
  if (range === 'recent') start.setDate(start.getDate() - 364);
  const counts = new Map<number, number>();
  for (const timestamp of dates) {
    const day = localDay(timestamp);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const data: { timestamp: number; value: number }[] = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    const timestamp = day.getTime();
    data.push({ timestamp, value: counts.get(timestamp) ?? 0 });
  }
  return data;
}
