// بيانات العالم فقط (بلا أي كود رسم). تُترجم إلى شبكة بلاطات عبر compileWorld().
// الإحداثيات بوحدة البلاطة. القالب الأيسر (مدينة الفجر) يُعكس تلقائيًا لبناء مدينة الغروب.
// لتوسعة العالم: أضف منطقة/وحشًا/طريقًا هنا ولا تلمس كود العرض.

export const WORLD_DEF = {
  width: 96,
  height: 48,
  seed: 20261022,

  // مناطق بأعمدة كاملة الارتفاع
  zones: [
    { id: 'dawn_city', nameAr: 'مدينة الفجر', x0: 0, x1: 21, safe: true, danger: 0, levels: [1, 1], ground: 'CITY', treeDensity: 0 },
    { id: 'wind_plains', nameAr: 'سهول الرياح', x0: 22, x1: 39, safe: false, danger: 1, levels: [1, 4], ground: 'GRASS', treeDensity: 0.05 },
    { id: 'wolf_valley', nameAr: 'وادي الذئاب', x0: 40, x1: 57, safe: false, danger: 2, levels: [3, 8], ground: 'DARK', treeDensity: 0.1 },
    { id: 'shadow_pass', nameAr: 'ممر الظلال', x0: 58, x1: 73, safe: false, danger: 3, levels: [7, 12], ground: 'DARK', treeDensity: 0.15 },
    { id: 'dusk_city', nameAr: 'مدينة الغروب', x0: 74, x1: 95, safe: true, danger: 0, levels: [1, 1], ground: 'CITY', treeDensity: 0 },
  ],

  // نهر عمودي وجسور تتشكل تلقائيًا حيث تقطعه الطرق
  river: { waterX: [52, 53], sandX: [51, 54] },
  ponds: [
    { x: 30, y: 6, r: 3 },
    { x: 46, y: 34, r: 3 },
    { x: 66, y: 33, r: 3.5 },
    { x: 63, y: 7, r: 2.5 },
  ],

  // طرق عامة (خطوط وسطية بإحداثيات متصلة، radius = نصف العرض)
  roads: [
    { id: 'main', radius: 1.0, points: [[1, 25], [21, 25], [28, 25], [34, 28], [44, 28], [50, 24], [56, 24], [62, 22], [68, 25], [74, 25], [94, 25]] },
    { id: 'north', radius: 0.7, points: [[1, 12.5], [21, 12.5], [30, 12.5], [38, 9.5], [52, 9.5], [66, 12.5], [74, 12.5], [94, 12.5]] },
    { id: 'south', radius: 0.7, points: [[1, 38.5], [21, 38.5], [34, 38.5], [46, 41.5], [62, 41.5], [74, 38.5], [94, 38.5]] },
  ],

  // قالب المدينة الأيسر (إحداثيات محلية). بوابات الجدار الشرقي بالصفوف.
  cityTemplate: {
    wallInnerX: 21, // العمود الداخلي (الشرقي في المدينة اليسرى)
    wallOuterX: 0,
    wallRows: [0, 47],
    gates: [[11, 13], [23, 26], [37, 39]],
    roads: [
      { radius: 0.7, points: [[11.5, 1], [11.5, 47]] },
      { radius: 0.7, points: [[15.5, 15], [15.5, 33]] },
      { radius: 0.7, points: [[7.5, 15], [7.5, 33]] },
    ],
    buildings: [
      { id: 'market_hall', x: 13, y: 12, w: 5, h: 3 },
      { id: 'smithy', x: 5, y: 12, w: 5, h: 3 },
      { id: 'temple', x: 5, y: 33, w: 5, h: 3 },
      { id: 'quest_hall', x: 13, y: 33, w: 5, h: 3 },
      { id: 'station_shed', x: 17, y: 18, w: 3, h: 2 },
    ],
    props: [
      { x: 9, y: 22, type: 'rock' },
      { x: 13, y: 22, type: 'rock' },
      { x: 9, y: 28, type: 'rock' },
      { x: 13, y: 28, type: 'rock' },
    ],
    npcs: [
      { key: 'market', type: 'market', x: 15, y: 16 },
      { key: 'smith', type: 'smith', x: 7, y: 16 },
      { key: 'healer', type: 'healer', x: 7, y: 32 },
      { key: 'quests', type: 'quests', x: 15, y: 32 },
      { key: 'caravan', type: 'caravan', x: 19, y: 22 },
    ],
    station: { x: 19.5, y: 25 },
    spawn: { x: 11.5, y: 28.5 },
  },

  cities: {
    dawn_city: {
      mirror: false,
      key: 'dawn',
      names: { market: 'سالم — تاجر السوق', smith: 'هاشم — الحداد', healer: 'الكاهنة ليلى', quests: 'القائد منذر', caravan: 'مشرف القوافل رشيد' },
    },
    dusk_city: {
      mirror: true,
      key: 'dusk',
      names: { market: 'بدر — تاجر الميناء', smith: 'جابر — الحداد', healer: 'الكاهنة سلمى', quests: 'القائد فيصل', caravan: 'مشرف القوافل نادر' },
    },
  },

  // مسار القافلة من مدينة الفجر إلى الغروب (يتبع الطريق الرئيسي). العكس يُشتق تلقائيًا.
  routes: [
    {
      from: 'dawn_city',
      to: 'dusk_city',
      points: [[19.5, 25], [21, 25], [28, 25], [34, 28], [44, 28], [50, 24], [56, 24], [62, 22], [68, 25], [74, 25], [76.5, 25]],
    },
  ],

  // مناطق ظهور الوحوش
  monsterSpawns: [
    { id: 'plains_wolves_n', monster: 'wolf', x: 28, y: 10, r: 6, count: 4 },
    { id: 'plains_wolves_s', monster: 'wolf', x: 30, y: 38, r: 6, count: 4 },
    { id: 'plains_boars', monster: 'boar', x: 35, y: 33, r: 4, count: 3 },
    { id: 'valley_boars', monster: 'boar', x: 44, y: 15, r: 6, count: 4 },
    { id: 'valley_scorpions', monster: 'dust_scorpion', x: 47, y: 37, r: 6, count: 5 },
    { id: 'valley_wolves', monster: 'wolf', x: 56, y: 18, r: 5, count: 4 },
    { id: 'pass_skeletons', monster: 'skeleton_warrior', x: 64, y: 14, r: 6, count: 5 },
    { id: 'pass_stalkers', monster: 'shadow_stalker', x: 68, y: 37, r: 6, count: 4 },
    { id: 'pass_golem', monster: 'stone_golem', x: 66, y: 22, r: 3, count: 1 },
  ],

  // أماكن مناسبة لكمائن اللصوص (غابة أكثف قرب الطريق)
  ambush: [
    { id: 'ambush_hollow', nameAr: 'التجويف المظلم', x: 33, y: 31, r: 5 },
    { id: 'ambush_crossing', nameAr: 'معبر النهر', x: 48, y: 20, r: 4 },
    { id: 'ambush_ravine', nameAr: 'الوادي الضيق', x: 64, y: 28, r: 5 },
  ],
};
