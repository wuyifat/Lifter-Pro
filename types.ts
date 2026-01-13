
export interface Exercise {
  id: string;
  name: string;
  category?: string;
  sets: number;
  reps: string; // e.g., "10, 8, 8, 6" or "12"
}

export interface WorkoutDay {
  id: string;
  dayName: string; // e.g., "Monday"
  focus: string;   // e.g., "Chest & Triceps"
  exercises: Exercise[];
}

export interface WorkoutWeek {
  days: WorkoutDay[];
}

export interface WorkoutPlan {
  id: string;
  name: string;
  durationWeeks: number;
  weeks: WorkoutWeek[]; // Blueprint for new repetitions
  createdAt: number;
}

export interface SetLog {
  weight: string;
  reps?: string; // Optional override if different from target
}

export interface ExerciseLog {
  sets: SetLog[];
}

export interface TrackerRepetition {
  id: string;
  startedAt: number;
  name?: string; 
  weeks: WorkoutWeek[]; // Per-repetition copy of the plan structure
  logs: Record<string, Record<string, Record<string, ExerciseLog>>>; // weekIndex -> dayId -> exerciseId -> log
}

export interface Tracker {
  id: string;
  planId: string;
  repetitions: TrackerRepetition[];
  currentRepetitionIndex: number;
}

export type AppView = 'plans' | 'import' | 'workout' | 'plan_details';
