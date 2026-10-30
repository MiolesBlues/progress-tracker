export type TrainingTemplateSummary = {
  template_key: string;
  version: number;
  title_ru: string;
  title_en: string;
  description_ru: string;
  description_en: string;
  days_per_week: number;
  developmental_days_per_week: number;
  experience_levels: string[];
  recommended_by_default: boolean;
  requires_daily_opt_in: boolean;
};

// Display metadata is exposed only when the matching backend catalog entry exists.
// The complete, validated payload remains in docs/training-library and is seeded atomically.
export const trainingTemplateSummaries: TrainingTemplateSummary[] = [
  {
    template_key: "strength_1d_v1",
    version: 1,
    title_ru: "Один день — всё тело",
    title_en: "One day — full body",
    description_ru:
      "Умеренный компромисс для одной тренировки в неделю; не пытается уместить многодневный объём в один день.",
    description_en:
      "A moderate one-day compromise that does not cram a multi-day volume into one session.",
    days_per_week: 1,
    developmental_days_per_week: 1,
    experience_levels: ["beginner", "intermediate"],
    recommended_by_default: false,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_2d_v1",
    version: 1,
    title_ru: "Два дня — всё тело A/B",
    title_en: "Two days — full body A/B",
    description_ru: "Два распределённых контакта основных мышц за неделю.",
    description_en: "Two distributed weekly contacts for the main muscle groups.",
    days_per_week: 2,
    developmental_days_per_week: 2,
    experience_levels: ["beginner", "intermediate"],
    recommended_by_default: true,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_3d_v1",
    version: 1,
    title_ru: "Три дня — всё тело A/B/C",
    title_en: "Three days — full body A/B/C",
    description_ru: "Основные группы получают 2–3 распределённых контакта.",
    description_en: "Main muscle groups receive two to three distributed contacts.",
    days_per_week: 3,
    developmental_days_per_week: 3,
    experience_levels: ["beginner", "intermediate"],
    recommended_by_default: true,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_4d_v1",
    version: 1,
    title_ru: "Четыре дня — верх/низ A/B",
    title_en: "Four days — upper/lower A/B",
    description_ru: "Две тренировки верха и две низа с двумя контактами основных групп.",
    description_en: "Two upper and two lower sessions with two weekly contacts for major groups.",
    days_per_week: 4,
    developmental_days_per_week: 4,
    experience_levels: ["intermediate"],
    recommended_by_default: true,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_5d_v1",
    version: 1,
    title_ru: "Пять дней — верх/низ + жим/тяга/ноги",
    title_en: "Five days — upper/lower plus push/pull/legs",
    description_ru: "Пять занятий распределяют недельный объём и оставляют два дня отдыха.",
    description_en: "Five sessions distribute weekly volume and leave two rest days.",
    days_per_week: 5,
    developmental_days_per_week: 5,
    experience_levels: ["intermediate", "advanced"],
    recommended_by_default: false,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_6d_v1",
    version: 1,
    title_ru: "Шесть дней — жим/тяга/ноги A/B",
    title_en: "Six days — push/pull/legs A/B",
    description_ru: "Шесть относительно коротких занятий и один полный день отдыха.",
    description_en: "Six relatively short sessions and one full rest day.",
    days_per_week: 6,
    developmental_days_per_week: 6,
    experience_levels: ["intermediate", "advanced"],
    recommended_by_default: false,
    requires_daily_opt_in: false,
  },
  {
    template_key: "strength_7d_v1",
    version: 1,
    title_ru: "Семь посещений — 6 основных + 1 лёгкая силовая практика",
    title_en: "Seven visits — 6 main sessions + 1 light strength practice",
    description_ru:
      "Шесть развивающих занятий и один облегчённый день, а не семь тяжёлых тренировок.",
    description_en:
      "Six developmental sessions and one light day, rather than seven hard workouts.",
    days_per_week: 7,
    developmental_days_per_week: 6,
    experience_levels: ["intermediate", "advanced"],
    recommended_by_default: false,
    requires_daily_opt_in: true,
  },
];

export function templatesForDays(days: number) {
  return trainingTemplateSummaries.filter((template) => template.days_per_week === days);
}
