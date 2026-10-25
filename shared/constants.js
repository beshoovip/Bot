// ثوابت مشتركة بين العميل والخادم. لا تعتمد على أي واجهات خاصة بالمتصفح أو Node.

export const TICK_RATE = 20; // تحديثات المحاكاة في الثانية
export const TICK_DT = 1 / TICK_RATE;
export const SNAPSHOT_EVERY_TICKS = 2; // 10 لقطات/ثانية
export const TILE_W = 64; // عرض البلاطة المائلة بالبكسل
export const TILE_H = 32; // ارتفاع البلاطة المائلة بالبكسل
export const ENTITY_RADIUS = 0.3; // نصف قطر التصادم بوحدة البلاطة
export const INTEREST_RADIUS = 38; // نطاق إرسال الكيانات للاعب (بلاطات)

// 8 اتجاهات على الشاشة: شرق، جنوب شرق، جنوب، جنوب غرب، غرب، شمال غرب، شمال، شمال شرق
// (المحور y للأسفل). الفهرس -1 يعني التوقف.
export const DIRS = Object.freeze([
  { sx: 1, sy: 0 },
  { sx: 1, sy: 1 },
  { sx: 0, sy: 1 },
  { sx: -1, sy: 1 },
  { sx: -1, sy: 0 },
  { sx: -1, sy: -1 },
  { sx: 0, sy: -1 },
  { sx: 1, sy: -1 },
]);

export const GROUND = Object.freeze({ GRASS: 0, ROAD: 1, CITY: 2, WATER: 3, SAND: 4, DARK: 5, BRIDGE: 6 });
export const OBSTACLE = Object.freeze({ NONE: 0, TREE: 1, ROCK: 2, BUILDING: 3, WALL: 4 });

export const PROFESSION_IDS = Object.freeze(['trader', 'thief', 'hunter']);
export const CITY_IDS = Object.freeze(['dawn_city', 'dusk_city']);

// رموز الأخطاء المشتركة (تُعاد من الخادم كما هي وتُترجم في العميل)
export const ERR = Object.freeze({
  INVALID: 'INVALID',
  RATE_LIMIT: 'RATE_LIMIT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  DEAD: 'DEAD',
  COOLDOWN: 'COOLDOWN',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  SAFE_ZONE: 'SAFE_ZONE',
  INNOCENT_TARGET: 'INNOCENT_TARGET',
  FRIENDLY: 'FRIENDLY',
  WRONG_PROFESSION: 'WRONG_PROFESSION',
  LEVEL_TOO_LOW: 'LEVEL_TOO_LOW',
  INSUFFICIENT_GOLD: 'INSUFFICIENT_GOLD',
  INSUFFICIENT_ITEMS: 'INSUFFICIENT_ITEMS',
  INVENTORY_FULL: 'INVENTORY_FULL',
  UNKNOWN_ITEM: 'UNKNOWN_ITEM',
  ACTIVE_CARAVAN_EXISTS: 'ACTIVE_CARAVAN_EXISTS',
  CARAVAN_NOT_ACTIVE: 'CARAVAN_NOT_ACTIVE',
  CARGO_EMPTY: 'CARGO_EMPTY',
  CARGO_TOO_LARGE: 'CARGO_TOO_LARGE',
  BUSY: 'BUSY',
  NOT_NEAR_NPC: 'NOT_NEAR_NPC',
  NOT_SOLD_HERE: 'NOT_SOLD_HERE',
  ITEM_EQUIPPED: 'ITEM_EQUIPPED',
  NO_SKILL_POINTS: 'NO_SKILL_POINTS',
  MAX_SKILL_LEVEL: 'MAX_SKILL_LEVEL',
  QUEST_NOT_DONE: 'QUEST_NOT_DONE',
  NAME_TAKEN: 'NAME_TAKEN',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  BAD_CREDENTIALS: 'BAD_CREDENTIALS',
  TOO_MANY_CHARACTERS: 'TOO_MANY_CHARACTERS',
  DUPLICATE: 'DUPLICATE',
  ROOTED: 'ROOTED',
  TRAP_LIMIT: 'TRAP_LIMIT',
  NOT_IN_WORLD: 'NOT_IN_WORLD',
});
