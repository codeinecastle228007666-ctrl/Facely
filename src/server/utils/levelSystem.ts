export const LEVEL_THRESHOLDS = [
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 50 },
  { level: 3, xpRequired: 150 },
  { level: 4, xpRequired: 300 },
  { level: 5, xpRequired: 500 },
];

export const XP_PER_ANALYSIS = 10;

export function calculateLevel(xp: number): number {
  let currentLevel = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (xp >= threshold.xpRequired) {
      currentLevel = threshold.level;
    } else {
      break;
    }
  }
  return currentLevel;
}

export function getLevelProgress(xp: number): {
  currentLevel: number;
  currentXp: number;
  nextLevelXp: number;
  progress: number;
} {
  const currentLevel = calculateLevel(xp);
  const currentThreshold = LEVEL_THRESHOLDS[currentLevel - 1];
  const nextThreshold = LEVEL_THRESHOLDS[currentLevel];

  if (!nextThreshold) {
    return {
      currentLevel,
      currentXp: xp,
      nextLevelXp: currentThreshold.xpRequired,
      progress: 100,
    };
  }

  const xpInLevel = xp - currentThreshold.xpRequired;
  const xpNeeded = nextThreshold.xpRequired - currentThreshold.xpRequired;
  const progress = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));

  return {
    currentLevel,
    currentXp: xp,
    nextLevelXp: nextThreshold.xpRequired,
    progress,
  };
}

export function didLevelUp(oldXp: number, newXp: number): number | null {
  const oldLevel = calculateLevel(oldXp);
  const newLevel = calculateLevel(newXp);
  return newLevel > oldLevel ? newLevel : null;
}
