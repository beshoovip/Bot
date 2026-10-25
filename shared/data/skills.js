// المهارات. كل مهارة لها 3 مستويات؛ نقطة مهارة واحدة لكل مستوى شخصية.
// params(level) تعيد قيمًا رقمية للمستوى (1..3).

export const MAX_SKILL_LEVEL = 3;

export const SKILLS = Object.freeze({
  // التاجر
  caravan_shield: {
    id: 'caravan_shield',
    nameAr: 'درع القافلة',
    descAr: 'يضاعف دفاع القافلة ويقلل ما يُنهب منها لفترة قصيرة.',
    profession: 'trader',
    target: 'own_caravan',
    cooldown: (lv) => 28 - 3 * (lv - 1),
    range: 12,
    params: (lv) => ({ durationSec: 8 + 2 * (lv - 1) }),
  },
  field_repair: {
    id: 'field_repair',
    nameAr: 'إصلاح ميداني',
    descAr: 'يرمّم جزءًا من صحة القافلة.',
    profession: 'trader',
    target: 'own_caravan',
    cooldown: (lv) => 40 - 4 * (lv - 1),
    range: 4,
    params: (lv) => ({ healPct: 0.2 + 0.1 * (lv - 1) }),
  },
  // اللص
  plunder: {
    id: 'plunder',
    nameAr: 'نهب',
    descAr: 'يسرق جزءًا من حمولة قافلة قريبة. لا يعمل داخل المدن الآمنة.',
    profession: 'thief',
    target: 'caravan',
    cooldown: (lv) => 10 - 1 * (lv - 1),
    range: 2.6,
    params: (lv) => ({ pctMul: 1 + 0.15 * (lv - 1) }),
  },
  snare_trap: {
    id: 'snare_trap',
    nameAr: 'فخ تعطيل',
    descAr: 'يزرع فخًا يشلّ أول خصم يقترب منه لثوانٍ. حد أقصى فخّان.',
    profession: 'thief',
    target: 'ground',
    cooldown: (lv) => 16 - 2 * (lv - 1),
    range: 3,
    params: (lv) => ({ rootSec: 2.5 + 0.5 * (lv - 1), lifetimeSec: 30, radius: 1.2, maxTraps: 2 }),
  },
  // الصياد
  power_shot: {
    id: 'power_shot',
    nameAr: 'طلقة قوية',
    descAr: 'طلقة بضرر مضاعف على هدف مسموح بمهاجمته.',
    profession: 'hunter',
    target: 'enemy',
    cooldown: (lv) => 6 - 0.5 * (lv - 1),
    range: 7,
    params: (lv) => ({ dmgMul: 1.8 + 0.25 * (lv - 1) }),
  },
  mark_target: {
    id: 'mark_target',
    nameAr: 'تحديد الهدف',
    descAr: 'يكشف لصًّا ويزيد الضرر الواقع عليه مؤقتًا.',
    profession: 'hunter',
    target: 'enemy',
    cooldown: (lv) => 14 - 1 * (lv - 1),
    range: 14,
    params: (lv) => ({ durationSec: 8 + 2 * (lv - 1), dmgTakenMul: 1.2 + 0.05 * (lv - 1) }),
  },
});

export function getSkill(id) {
  return SKILLS[id] ?? null;
}
