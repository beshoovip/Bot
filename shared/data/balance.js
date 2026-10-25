// كل أرقام التوازن في مكان واحد (قابلة للضبط دون المساس بالأنظمة).

export const BALANCE = Object.freeze({
  // الحركة
  playerSpeed: 4.2, // بلاطة/ثانية
  caravanSpeed: 1.2, // أبطأ بوضوح من اللاعب
  caravanUnderAttackSpeedMul: 0.5,

  // القوافل
  caravanFee: 40,
  caravanCapacity: 24, // إجمالي الوحدات
  caravanMaxHp: 160,
  caravanDef: 3,
  caravanPrepareSec: 6,
  arrivalBonusPct: 0.15,
  arrivalRepTrade: 10,
  arrivalXpBase: 30,
  arrivalXpPerValue: 0.05,
  underAttackSec: 8,
  escortRange: 16,
  escortRewardPct: 0.1,
  escortMin: 20,
  escortRep: 6,
  escortXp: 40,
  escortMaxPerCaravan: 3,

  // السرقة
  plunderPct: 0.12,
  plunderRange: 2.6,
  plunderRepBlack: 5,
  plunderXp: 25,
  maxPlunderFraction: 0.6, // أقصى نسبة من حمولة القافلة الابتدائية يمكن نهبها (يمنع تفريغها بالكامل)
  shieldPlunderMul: 0.5,
  caravanDestroyedThiefShare: 0.5,

  // علاقة المهن
  hostileFlagSec: 60,
  wantedRep: 20,
  bountyBase: 30,
  bountyPerLevel: 8,
  bountyRep: 5,
  bountyXpBase: 40,
  bountyXpPerLevel: 5,
  pvpLootCap: 300,

  // الموت
  respawnSec: 5,
  respawnHpPct: 0.5,
  deathGoldPct: 0.05,
  thiefDeathBlackRepLoss: 10,

  // الرؤية
  thiefStealthRadius: 8, // لا يراه الآخرون إلا ضمن هذا النطاق
  hunterDetectRadius: 14,
  thiefScoutRadius: 26, // نطاق اكتشاف القوافل للص
  revealAfterActionSec: 10,

  // التفاعل
  interactRange: 3.2,
  pickupRange: 2.2,
  dropTtl: 90,
  dropOwnerLockSec: 12,

  // الشبكة والحفظ
  disconnectGraceSec: 12,
  autosaveSec: 12,
  caravanSaveSec: 5,

  // الدردشة
  chatMaxLen: 200,

  // الاقتصاد
  startingGold: 100,
  sellSpread: 0.8, // سعر البيع = 80% من سعر الشراء؛ يجب أن يبقى أقل من (1 - أقصى خصم تاجر) لمنع المراجحة
  thiefSellMul: 0.8, // السوق السوداء
  equipSellMul: 0.5,
  healCostPerLevel: 3,
  maxCharactersPerUser: 3,
  maxLevel: 30,

  // الوحوش
  monsterRespawnSec: 25,
  monsterRadius: 0.45,
  monsterHealPerSecWhenReturning: 0.25, // نسبة من الصحة القصوى
});
