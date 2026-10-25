// تعريف المهن. لا تمنح أي مهنة أفضلية مطلقة:
// التاجر: أكثر صحة ودفاعًا + مهارات تحمي القافلة. اللص: أعلى ضرر وأقل صحة + تخفٍّ. الصياد: هجوم بعيد المدى لكنه مقيّد بقواعد الاشتباك.

export const PROFESSIONS = Object.freeze({
  trader: {
    id: 'trader',
    nameAr: 'تاجر',
    descAr: 'يشتري البضائع ويطلق القوافل ويربح عند وصولها بأمان.',
    color: '#d9a441',
    base: { hp: 110, atk: 6, def: 5 },
    growth: { hp: 14, atk: 1.0, def: 0.9 },
    attack: { range: 1.8, cooldown: 1.2, style: 'melee' },
    skills: ['caravan_shield', 'field_repair'],
    weaponClass: 'sword',
    startItems: { rusty_sword: 1, leather_vest: 1, health_potion: 2 },
  },
  thief: {
    id: 'thief',
    nameAr: 'لص',
    descAr: 'يتسلل إلى الطرق، يرصد القوافل وينهب جزءًا من حمولتها.',
    color: '#8a4fd0',
    base: { hp: 85, atk: 11, def: 3 },
    growth: { hp: 10, atk: 1.6, def: 0.5 },
    attack: { range: 1.6, cooldown: 0.8, style: 'melee' },
    skills: ['plunder', 'snare_trap'],
    weaponClass: 'dagger',
    startItems: { dagger: 1, leather_vest: 1, health_potion: 2 },
  },
  hunter: {
    id: 'hunter',
    nameAr: 'صياد',
    descAr: 'يحمي القوافل ويطارد اللصوص المطلوبين مقابل مكافآت.',
    color: '#3f9d5a',
    base: { hp: 100, atk: 10, def: 5 },
    growth: { hp: 12, atk: 1.4, def: 0.8 },
    attack: { range: 6, cooldown: 1.1, style: 'ranged' },
    skills: ['power_shot', 'mark_target'],
    weaponClass: 'bow',
    startItems: { short_bow: 1, leather_vest: 1, health_potion: 2 },
  },
});

export function getProfession(id) {
  return PROFESSIONS[id] ?? null;
}
