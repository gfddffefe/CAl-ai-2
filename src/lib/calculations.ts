import { Gender, ActivityLevel, Goal } from '../types';

export function calculateBMR(weight: number, height: number, age: number, gender: Gender): number {
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  };
  return Math.round(bmr * multipliers[activityLevel]);
}

export function calculateDailyGoal(tdee: number, goal: Goal): number {
  const adjustments: Record<Goal, number> = {
    lose: -500,
    maintain: 0,
    gain: 500,
  };
  return Math.round(tdee + adjustments[goal]);
}

export function calculateStepCalories(steps: number, weight?: number): number {
  // Base formula: 0.04 calories per step
  // Adjust based on weight if available: (steps * 0.04) * (weight / 70)
  const baseBurn = steps * 0.04;
  if (weight) {
    return Math.round(baseBurn * (weight / 70));
  }
  return Math.round(baseBurn);
}
