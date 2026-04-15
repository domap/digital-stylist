import type { RecommendedDisplayMode } from "@/api/types";

/** Max follow-up chip uses per chat session (avoids endless refine loops). */
export const RECOMMENDATION_FOLLOW_UP_CAP = 3;

export type DayPlanFollowUpCopy = {
  title: string;
  subtitle: string;
  prompts: [string, string, string];
};

export const dayPlanFollowUps: DayPlanFollowUpCopy = {
  title: "Want to tweak your outfit plan?",
  subtitle: "Optional next steps for this day-by-day plan.",
  prompts: [
    "Suggest comfortable shoes for each day that still match the dress code.",
    "Add a bag and one jewelry idea per day with a short why.",
    "Swap one day’s look for something slightly dressier—same overall vibe.",
  ],
};

export type CardsFollowUpCopy = {
  title: string;
  subtitle: string;
  prompts: [string, string, string];
};

export function cardsFollowUpCopy(mode: RecommendedDisplayMode | undefined): CardsFollowUpCopy {
  if (mode === "full_outfit") {
    return {
      title: "Complete the look?",
      subtitle: "Ideas that go with this full outfit—pick one to explore.",
      prompts: [
        "Suggest shoes and a bag that match this outfit’s formality.",
        "Add jewelry or a belt that pulls the look together.",
        "Offer one swap if I want a slightly dressier or more relaxed version.",
      ],
    };
  }
  return {
    title: "Like these picks?",
    subtitle: "Tell Ann how to adjust this set—pick one direction.",
    prompts: [
      "Add accessories (bag + jewelry) that work with these pieces.",
      "Suggest shoes for comfort and the right occasion.",
      "Swap one item for a more elevated option in the same style.",
    ],
  };
}
