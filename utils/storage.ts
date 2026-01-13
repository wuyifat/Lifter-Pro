
import { WorkoutPlan, Tracker } from "../types";

const PLANS_KEY = 'workout_plans_v1';
const TRACKERS_KEY = 'workout_trackers_v1';

export const savePlans = (plans: WorkoutPlan[]) => {
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
};

export const loadPlans = (): WorkoutPlan[] => {
  const data = localStorage.getItem(PLANS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTrackers = (trackers: Tracker[]) => {
  localStorage.setItem(TRACKERS_KEY, JSON.stringify(trackers));
};

export const loadTrackers = (): Tracker[] => {
  const data = localStorage.getItem(TRACKERS_KEY);
  return data ? JSON.parse(data) : [];
};
