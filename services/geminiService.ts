
import { GoogleGenAI, Type } from "@google/genai";
import { WorkoutPlan, WorkoutWeek, WorkoutDay } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ImportPayload {
  text?: string;
  file?: {
    data: string;
    mimeType: string;
  };
}

const cloneDay = (day: WorkoutDay): WorkoutDay => ({
  ...day,
  id: crypto.randomUUID(),
  exercises: day.exercises.map(ex => ({ ...ex, id: crypto.randomUUID() }))
});

export const parseWorkoutPlan = async (payload: ImportPayload): Promise<Partial<WorkoutPlan>> => {
  const parts: any[] = [
    {
      text: `Parse the following workout plan and extract the structured data. 
      If a specific number of weeks is mentioned (e.g. "10 Week Program"), use that as durationWeeks. 
      If not specified, default to 4 weeks.
      The output MUST be valid JSON matching the schema provided.`
    }
  ];

  if (payload.text) {
    parts.push({ text: `TEXT CONTENT:\n${payload.text}` });
  }

  if (payload.file) {
    parts.push({
      inlineData: {
        data: payload.file.data,
        mimeType: payload.file.mimeType
      }
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          durationWeeks: { type: Type.INTEGER },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayName: { type: Type.STRING },
                focus: { type: Type.STRING },
                exercises: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      sets: { type: Type.INTEGER },
                      reps: { type: Type.STRING }
                    },
                    required: ["name", "sets", "reps"]
                  }
                }
              },
              required: ["dayName", "focus", "exercises"]
            }
          }
        },
        required: ["name", "durationWeeks", "days"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text);
    const durationWeeks = data.durationWeeks || 4;
    
    // Generate the multi-week blueprint
    const weeks: WorkoutWeek[] = [];
    for (let w = 0; w < durationWeeks; w++) {
      weeks.push({
        days: data.days.map((d: any) => cloneDay(d))
      });
    }

    return {
      id: crypto.randomUUID(),
      name: data.name,
      durationWeeks,
      weeks,
      createdAt: Date.now()
    };
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Could not parse the workout plan. Please ensure the content is clear.");
  }
};
