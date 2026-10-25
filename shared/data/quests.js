// المهام. objective: 'kill:<monsterCode>' | 'deliver' | 'escort' | 'plunder' | 'bounty'
// profession: null = للجميع.

export const QUESTS = Object.freeze({
  q_wolves: { code: 'q_wolves', titleAr: 'تنظيف السهول', descAr: 'اقضِ على 5 ذئاب في سهول الرياح.', profession: null, objective: 'kill:wolf', target: 5, rewardGold: 80, rewardXp: 120, minLevel: 1 },
  q_boars: { code: 'q_boars', titleAr: 'خطر الخنازير', descAr: 'اقضِ على 5 خنازير برية.', profession: null, objective: 'kill:boar', target: 5, rewardGold: 150, rewardXp: 220, minLevel: 3 },
  q_scorpions: { code: 'q_scorpions', titleAr: 'لدغة الغبار', descAr: 'اقضِ على 6 عقارب غبار.', profession: null, objective: 'kill:dust_scorpion', target: 6, rewardGold: 260, rewardXp: 400, minLevel: 5 },
  q_skeletons: { code: 'q_skeletons', titleAr: 'حراس الممر', descAr: 'حطّم 5 هياكل محاربة في ممر الظلال.', profession: null, objective: 'kill:skeleton_warrior', target: 5, rewardGold: 500, rewardXp: 900, minLevel: 8 },
  q_first_delivery: { code: 'q_first_delivery', titleAr: 'أول رحلة', descAr: 'أوصل قافلة واحدة بأمان.', profession: 'trader', objective: 'deliver', target: 1, rewardGold: 200, rewardXp: 250, minLevel: 1 },
  q_caravan_master: { code: 'q_caravan_master', titleAr: 'سيد القوافل', descAr: 'أوصل 5 قوافل بأمان.', profession: 'trader', objective: 'deliver', target: 5, rewardGold: 1000, rewardXp: 1500, minLevel: 4 },
  q_escort: { code: 'q_escort', titleAr: 'حارس الطريق', descAr: 'رافق قافلة حتى وصولها بأمان.', profession: 'hunter', objective: 'escort', target: 1, rewardGold: 200, rewardXp: 250, minLevel: 1 },
  q_bounty: { code: 'q_bounty', titleAr: 'صيد المطلوبين', descAr: 'اقضِ على لصّين مطلوبين.', profession: 'hunter', objective: 'bounty', target: 2, rewardGold: 300, rewardXp: 400, minLevel: 2 },
  q_first_plunder: { code: 'q_first_plunder', titleAr: 'يد خفيفة', descAr: 'انهب قوافل 3 مرات.', profession: 'thief', objective: 'plunder', target: 3, rewardGold: 200, rewardXp: 250, minLevel: 1 },
  q_master_thief: { code: 'q_master_thief', titleAr: 'سيد الظلال', descAr: 'انهب قوافل 15 مرة.', profession: 'thief', objective: 'plunder', target: 15, rewardGold: 1200, rewardXp: 1800, minLevel: 4 },
});

export function getQuest(code) {
  return Object.prototype.hasOwnProperty.call(QUESTS, code) ? QUESTS[code] : null;
}
