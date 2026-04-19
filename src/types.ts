export type Gender = 'male' | 'female' | 'other';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

export interface UserProfile {
  userId: string;
  name: string;
  age: number;
  gender: Gender;
  height: number; // in cm
  weight: number; // in kg
  goal: Goal;
  activityLevel: ActivityLevel;
  tdee: number;
  dailyCalorieGoal: number;
  onboardingCompleted: boolean;
  createdAt: any;
  updatedAt: any;
  currentWeight?: number; // Last recorded weight
}

export type WorkoutIntensity = 'light' | 'moderate' | 'intense';

export interface Workout {
  id?: string;
  type: string;
  duration: number; // minutes
  intensity: WorkoutIntensity;
  caloriesBurned: number;
  timestamp: any;
  createdAt: any;
}

export interface StepLog {
  id?: string;
  count: number;
  caloriesBurned: number;
  timestamp: any;
  createdAt: any;
}

export interface Ingredient {
  name: string;
  calories: number;
}

export interface Meal {
  id?: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  ingredients?: Ingredient[];
  servings?: number;
  imageUrl?: string;
  timestamp: any;
  createdAt: any;
}

export interface AnalysisResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  ingredients?: Ingredient[];
  servings?: number;
}
