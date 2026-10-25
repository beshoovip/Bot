// معاملات NPC: شراء/بيع/شفاء/تجهيز/استخدام/مهام. كل الأسعار تُحسب هنا من shared/economy.js،
// وكل تغيير في الذهب أو العناصر يمر عبر دوال SQL ذرّية (repo). العميل لا يرسل أي سعر.

import { ERR, CITY_IDS } from '../../../../shared/constants.js';
import { BALANCE } from '../../../../shared/data/balance.js';
import { ITEMS } from '../../../../shared/data/items.js';
import { QUESTS } from '../../../../shared/data/quests.js';
import { buyPrice, sellPrice, healCost, CITY_GOOD_PRICES } from '../../../../shared/economy.js';
import { canEquip } from '../../../../shared/progression.js';
import { npcById } from '../../../../shared/maps/world.js';
import { dist } from '../combat/combat.js';

export function requireNpc(game, player, npcId, types) {
  const npc = npcById(game.world, npcId);
  if (!npc || (types && !types.includes(npc.type))) return { error: ERR.NOT_FOUND };
  if (player.dead) return { error: ERR.DEAD };
  if (dist(player, npc) > BALANCE.interactRange) return { error: ERR.NOT_NEAR_NPC };
  return { npc };
}

/** حمولة المعلومات التي تُرسل عند التفاعل مع NPC. */
export function npcInfo(game, player, npc) {
  const base = { npcId: npc.id, type: npc.type, name: npc.nameAr, cityId: npc.cityId };
  const price = (shopType, itemId) => buyPrice({ cityId: npc.cityId, shopType, itemId, professionId: player.profession, level: player.level });
  const sell = (shopType, itemId) => sellPrice({ cityId: npc.cityId, shopType, itemId, professionId: player.profession });
  const owned = [...player.items].map(([itemId, v]) => ({ itemId, qty: v.qty, equipped: v.equipped }));
  switch (npc.type) {
    case 'market': {
      const goods = Object.keys(CITY_GOOD_PRICES[npc.cityId]).map((itemId) => ({ itemId, buy: price('market', itemId), sell: sell('market', itemId) }));
      const sellable = owned.filter((o) => sell('market', o.itemId) != null).map((o) => ({ itemId: o.itemId, qty: o.qty, sell: sell('market', o.itemId) }));
      return { ...base, goods, sellable };
    }
    case 'smith': {
      const stock = Object.values(ITEMS).filter((i) => i.kind === 'weapon' || i.kind === 'armor');
      const goods = stock.map((i) => ({ itemId: i.id, buy: price('smith', i.id), minLevel: i.minLevel, usable: canEquip(player.profession, player.level, i).ok }));
      const sellable = owned.filter((o) => sell('smith', o.itemId) != null && !o.equipped).map((o) => ({ itemId: o.itemId, qty: o.qty, sell: sell('smith', o.itemId) }));
      return { ...base, goods, sellable };
    }
    case 'healer': {
      const potions = Object.values(ITEMS).filter((i) => i.kind === 'consumable').map((i) => ({ itemId: i.id, buy: price('healer', i.id) }));
      return { ...base, healCost: healCost(player.level), goods: potions, sellable: [] };
    }
    case 'quests': {
      const list = Object.values(QUESTS)
        .filter((q) => (q.profession == null || q.profession === player.profession) && player.level >= q.minLevel)
        .map((q) => ({ code: q.code, title: q.titleAr, desc: q.descAr, target: q.target, rewardGold: q.rewardGold, rewardXp: q.rewardXp, ...(player.quests.get(q.code) ?? { progress: 0, status: 'available' }) }));
      return { ...base, quests: list };
    }
    case 'caravan':
      return {
        ...base,
        fee: BALANCE.caravanFee,
        capacity: BALANCE.caravanCapacity,
        destinations: CITY_IDS.filter((c) => c !== npc.cityId),
        canLaunch: player.profession === 'trader',
        goods: Object.keys(CITY_GOOD_PRICES[npc.cityId]),
        prices: CITY_GOOD_PRICES,
      };
    default:
      return base;
  }
}

export async function buy(game, player, { npcId, itemId, qty, idem }) {
  const r = requireNpc(game, player, npcId, ['market', 'smith', 'healer']);
  if (r.error) return { ok: false, error: r.error };
  const item = ITEMS[itemId];
  if (!item) return { ok: false, error: ERR.UNKNOWN_ITEM };
  const unit = buyPrice({ cityId: r.npc.cityId, shopType: r.npc.type, itemId, professionId: player.profession, level: player.level });
  if (unit == null) return { ok: false, error: ERR.NOT_SOLD_HERE };
  if (item.minLevel > player.level) return { ok: false, error: ERR.LEVEL_TOO_LOW };
  if (player.busy) return { ok: false, error: ERR.BUSY };
  player.busy = true;
  try {
    const res = await game.repo.buy(player.id, itemId, qty, unit, `buy:${player.id}:${idem}`);
    if (!res.ok) return { ok: false, error: res.error };
    await game.refreshPlayer(player);
    return { ok: true, duplicate: !!res.duplicate, unit, spent: res.spent ?? 0, gold: player.gold };
  } finally {
    player.busy = false;
  }
}

export async function sell(game, player, { npcId, itemId, qty, idem }) {
  const r = requireNpc(game, player, npcId, ['market', 'smith', 'healer']);
  if (r.error) return { ok: false, error: r.error };
  const unit = sellPrice({ cityId: r.npc.cityId, shopType: r.npc.type, itemId, professionId: player.profession });
  if (unit == null) return { ok: false, error: ITEMS[itemId] ? ERR.NOT_SOLD_HERE : ERR.UNKNOWN_ITEM };
  if (player.busy) return { ok: false, error: ERR.BUSY };
  player.busy = true;
  try {
    const res = await game.repo.sell(player.id, itemId, qty, unit, `sell:${player.id}:${idem}`);
    if (!res.ok) return { ok: false, error: res.error };
    await game.refreshPlayer(player);
    return { ok: true, duplicate: !!res.duplicate, unit, earned: res.earned ?? 0, gold: player.gold };
  } finally {
    player.busy = false;
  }
}

export async function heal(game, player, { npcId, idem }) {
  const r = requireNpc(game, player, npcId, ['healer']);
  if (r.error) return { ok: false, error: r.error };
  if (player.hp >= player.maxHp) return { ok: false, error: ERR.INVALID };
  if (player.busy) return { ok: false, error: ERR.BUSY };
  player.busy = true;
  try {
    const res = await game.repo.charge(player.id, healCost(player.level), 'heal', `heal:${player.id}:${idem}`);
    if (!res.ok) return { ok: false, error: res.error };
    if (!res.duplicate) player.hp = player.maxHp;
    await game.refreshPlayer(player);
    return { ok: true, duplicate: !!res.duplicate, gold: player.gold, hp: player.hp };
  } finally {
    player.busy = false;
  }
}

export async function equip(game, player, { itemId, equip: on }) {
  if (player.dead) return { ok: false, error: ERR.DEAD };
  const item = ITEMS[itemId];
  if (!player.items.has(itemId)) return { ok: false, error: ERR.INSUFFICIENT_ITEMS };
  if (on) {
    const c = canEquip(player.profession, player.level, item);
    if (!c.ok) return { ok: false, error: c.error };
  } else if (item?.slot == null) {
    return { ok: false, error: ERR.UNKNOWN_ITEM };
  }
  const res = await game.repo.equip(player.id, itemId, on);
  if (!res.ok) return { ok: false, error: res.error };
  await game.refreshPlayer(player);
  return { ok: true };
}

export async function useItem(game, player, { itemId }) {
  if (player.dead) return { ok: false, error: ERR.DEAD };
  const item = ITEMS[itemId];
  if (!item || item.kind !== 'consumable') return { ok: false, error: ERR.UNKNOWN_ITEM };
  if (game.t < player.potionReadyAt) return { ok: false, error: ERR.COOLDOWN };
  if (player.hp >= player.maxHp) return { ok: false, error: ERR.INVALID };
  if (player.busy) return { ok: false, error: ERR.BUSY };
  player.busy = true;
  try {
    const res = await game.repo.consume(player.id, itemId);
    if (!res.ok) return { ok: false, error: res.error };
    player.potionReadyAt = game.t + 5;
    player.hp = Math.min(player.maxHp, player.hp + item.heal);
    await game.refreshPlayer(player);
    return { ok: true, hp: player.hp };
  } finally {
    player.busy = false;
  }
}

export async function claimQuest(game, player, { npcId, code }) {
  const r = requireNpc(game, player, npcId, ['quests']);
  if (r.error) return { ok: false, error: r.error };
  const q = QUESTS[code];
  if (!q) return { ok: false, error: ERR.NOT_FOUND };
  if (player.quests.get(code)?.status !== 'completed') return { ok: false, error: ERR.QUEST_NOT_DONE };
  if (player.busy) return { ok: false, error: ERR.BUSY };
  player.busy = true;
  try {
    // الصرف idempotent بمفتاح ref ثابت لكل (شخصية، مهمة): لا يمكن قبضه مرتين حتى مع سباق الطلبات
    const g = await game.repo.grant(player.id, q.rewardGold, {}, 'quest_reward', `quest:${player.id}:${code}`);
    if (!g.ok) return { ok: false, error: g.error };
    const claimed = await game.repo.claimQuest(player.id, code);
    player.quests.set(code, { progress: q.target, status: 'claimed' });
    if (claimed && !g.duplicate) await game.grantXpToId(player.id, q.rewardXp);
    await game.refreshPlayer(player);
    return { ok: true, duplicate: !!g.duplicate, gold: player.gold };
  } finally {
    player.busy = false;
  }
}
