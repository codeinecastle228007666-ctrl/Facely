export const XP_PER_ANALYSIS = 10;
export const XP_PER_WEEKLY_STREAK = 5;
export const XP_PER_REFERRAL = 20;
export const XP_PER_PURCHASE = 15;

export function getXpForLevel(level: number): number {
  return (level - 1) * (level - 1) * 10;
}

export function calculateLevel(xp: number): number {
  let level = 1;
  while (getXpForLevel(level + 1) <= xp) {
    level++;
    if (level >= 50) break;
  }
  return Math.min(level, 50);
}

export function getLevelProgress(xp: number): {
  currentLevel: number;
  currentXp: number;
  nextLevelXp: number;
  progress: number;
} {
  const currentLevel = calculateLevel(xp);
  const currentThreshold = getXpForLevel(currentLevel);
  const nextThreshold = getXpForLevel(currentLevel + 1);

  if (currentLevel >= 50) {
    // 2026-06-28 — at level cap, `currentXp` (which can be > currentThreshold
    // because users keep earning XP past cap) was paired with the cap
    // threshold as `nextLevelXp`, creating an inversion `nextLevelXp <
    // currentXp` that some UI components treat as a negative progress.
    // Clamp `nextLevelXp` to be ≥ currentXp so contract "nextTarget ≥
    // current" holds under all measurement lag.
    return {
      currentLevel,
      currentXp: xp,
      nextLevelXp: Math.max(currentThreshold, xp),
      progress: 100,
    };
  }

  const xpInLevel = xp - currentThreshold;
  const xpNeeded = nextThreshold - currentThreshold;
  const progress = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));

  return { currentLevel, currentXp: xp, nextLevelXp: nextThreshold, progress };
}

export function didLevelUp(oldXp: number, newXp: number): number | null {
  const oldLevel = calculateLevel(oldXp);
  const newLevel = calculateLevel(newXp);
  return newLevel > oldLevel ? newLevel : null;
}

export interface LevelPerks {
  frame: string;
  badge: string;
  bonus: { freeAnalysis: boolean; referralPercentBoost: number };
}

export function getLevelPerks(level: number): LevelPerks {
  let frame: string;
  if (level <= 9) frame = "bronze";
  else if (level <= 19) frame = "silver";
  else if (level <= 29) frame = "gold";
  else if (level <= 39) frame = "platinum";
  else frame = "diamond";

  let badge: string;
  if (level <= 4) badge = "Новичок";
  else if (level <= 9) badge = "Исследователь";
  else if (level <= 14) badge = "Энтузиаст";
  else if (level <= 19) badge = "Знаток";
  else if (level <= 24) badge = "Эксперт";
  else if (level <= 29) badge = "Мастер";
  else if (level <= 34) badge = "Грандмастер";
  else if (level <= 39) badge = "Элита";
  else if (level <= 44) badge = "Легенда";
  else badge = "Миф";

  const bonusEvery5 = Math.floor(level / 5);
  const bonus: LevelPerks["bonus"] = {
    freeAnalysis: bonusEvery5 > 0,
    referralPercentBoost: 0.1 * (level / 5),
  };

  return { frame, badge, bonus };
}
