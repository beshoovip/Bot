// بروتوكول Socket.IO: أسماء الأحداث ومخططات التحقق. كل رسالة من العميل تمر عبر validatePayload.

export const C2S = Object.freeze({
  JOIN: 'join',
  INPUT: 'input',
  ATTACK: 'attack',
  SKILL: 'skill',
  SKILL_UPGRADE: 'skill:upgrade',
  INTERACT: 'interact',
  BUY: 'market:buy',
  SELL: 'market:sell',
  HEAL: 'npc:heal',
  LAUNCH: 'caravan:launch',
  ESCORT: 'caravan:escort',
  PICKUP: 'loot:pickup',
  CHAT: 'chat',
  EQUIP: 'item:equip',
  USE: 'item:use',
  QUEST_CLAIM: 'quest:claim',
  PING: 'ping',
});

export const S2C = Object.freeze({
  JOINED: 'joined',
  SNAPSHOT: 'snapshot',
  EVENT: 'event',
  SELF: 'self',
  INVENTORY: 'inventory',
  NPC: 'npc',
  CHAT: 'chat',
  ERROR: 'err',
  PONG: 'pong',
});

const TARGET_TYPES = ['monster', 'player', 'caravan'];

export const SCHEMAS = Object.freeze({
  [C2S.JOIN]: { characterId: { type: 'int', min: 1, max: 2 ** 53 - 1 } },
  [C2S.INPUT]: { seq: { type: 'int', min: 0, max: 2 ** 31 }, dir: { type: 'int', min: -1, max: 7 } },
  [C2S.ATTACK]: { targetType: { type: 'enum', values: TARGET_TYPES }, targetId: { type: 'int', min: 1, max: 2 ** 53 - 1 } },
  [C2S.SKILL]: {
    skillId: { type: 'id' },
    targetType: { type: 'enum', values: TARGET_TYPES, optional: true },
    targetId: { type: 'int', min: 1, max: 2 ** 53 - 1, optional: true },
    x: { type: 'num', min: 0, max: 1000, optional: true },
    y: { type: 'num', min: 0, max: 1000, optional: true },
  },
  [C2S.SKILL_UPGRADE]: { skillId: { type: 'id' } },
  [C2S.INTERACT]: { npcId: { type: 'id' } },
  [C2S.BUY]: { npcId: { type: 'id' }, itemId: { type: 'id' }, qty: { type: 'int', min: 1, max: 99 }, idem: { type: 'idem' } },
  [C2S.SELL]: { npcId: { type: 'id' }, itemId: { type: 'id' }, qty: { type: 'int', min: 1, max: 999 }, idem: { type: 'idem' } },
  [C2S.HEAL]: { npcId: { type: 'id' }, idem: { type: 'idem' } },
  [C2S.LAUNCH]: {
    npcId: { type: 'id' },
    destCity: { type: 'id' },
    cargo: { type: 'qtymap', maxKeys: 8, maxQty: 99 },
    idem: { type: 'idem' },
  },
  [C2S.ESCORT]: { caravanId: { type: 'int', min: 1, max: 2 ** 53 - 1 } },
  [C2S.PICKUP]: { dropId: { type: 'int', min: 1, max: 2 ** 53 - 1 } },
  [C2S.CHAT]: { text: { type: 'str', min: 1, max: 400 } },
  [C2S.EQUIP]: { itemId: { type: 'id' }, equip: { type: 'bool' } },
  [C2S.USE]: { itemId: { type: 'id' } },
  [C2S.QUEST_CLAIM]: { npcId: { type: 'id' }, code: { type: 'id' } },
  [C2S.PING]: { t: { type: 'num', min: 0, max: 1e15 } },
});

// حد المعدل لكل حدث: { burst, perSec } (دلو رموز لكل اتصال)
export const RATE_LIMITS = Object.freeze({
  [C2S.JOIN]: { burst: 3, perSec: 0.2 },
  [C2S.INPUT]: { burst: 40, perSec: 30 },
  [C2S.ATTACK]: { burst: 6, perSec: 4 },
  [C2S.SKILL]: { burst: 6, perSec: 3 },
  [C2S.SKILL_UPGRADE]: { burst: 4, perSec: 1 },
  [C2S.INTERACT]: { burst: 5, perSec: 2 },
  [C2S.BUY]: { burst: 8, perSec: 3 },
  [C2S.SELL]: { burst: 8, perSec: 3 },
  [C2S.HEAL]: { burst: 3, perSec: 0.5 },
  [C2S.LAUNCH]: { burst: 2, perSec: 0.3 },
  [C2S.ESCORT]: { burst: 3, perSec: 0.5 },
  [C2S.PICKUP]: { burst: 8, perSec: 5 },
  [C2S.CHAT]: { burst: 4, perSec: 0.7 },
  [C2S.EQUIP]: { burst: 6, perSec: 3 },
  [C2S.USE]: { burst: 5, perSec: 2 },
  [C2S.QUEST_CLAIM]: { burst: 3, perSec: 1 },
  [C2S.PING]: { burst: 4, perSec: 1 },
});
