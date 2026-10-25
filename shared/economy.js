// أسعار السوق (دوال نقية يستخدمها الخادم للحساب الفعلي والعميل للعرض فقط).

import { BALANCE } from './data/balance.js';
import { ITEMS } from './data/items.js';
import { traderDiscount } from './progression.js';

// سعر شراء البضاعة من السوق في كل مدينة (قابل للضبط). مدينة الفجر زراعية، مدينة الغروب ميناء.
// القمح والأحجار أرخص في الفجر؛ القماش والحديد والتوابل والحرير أرخص في الغروب.
export const CITY_GOOD_PRICES = Object.freeze({
  dawn_city: Object.freeze({ wheat: 8, cloth: 24, iron_ore: 40, spices: 52, silk: 90, gems: 130 }),
  dusk_city: Object.freeze({ wheat: 15, cloth: 14, iron_ore: 24, spices: 30, silk: 55, gems: 200 }),
});

// أنواع المتاجر وما تتعامل به
export const SHOP_RULES = Object.freeze({
  market: { sells: ['good'], buys: ['good', 'trophy'] },
  smith: { sells: ['weapon', 'armor'], buys: ['weapon', 'armor'] },
  healer: { sells: ['consumable'], buys: ['consumable'] },
});

function discounted(price, professionId, level) {
  const d = traderDiscount(professionId, level);
  return Math.max(1, Math.floor(price * (1 - d)));
}

/** سعر الوحدة الذي يدفعه اللاعب عند الشراء، أو null إن لم تُبَع هنا. */
export function buyPrice({ cityId, shopType, itemId, professionId, level }) {
  const item = ITEMS[itemId];
  const rules = SHOP_RULES[shopType];
  if (!item || !rules || !rules.sells.includes(item.kind)) return null;
  if (item.kind === 'good') {
    const base = CITY_GOOD_PRICES[cityId]?.[itemId];
    if (base == null) return null;
    return discounted(base, professionId, level);
  }
  return discounted(item.basePrice, professionId, level);
}

/** سعر الوحدة الذي يتقاضاه اللاعب عند البيع، أو null إن لم يُشترَ هنا. */
export function sellPrice({ cityId, shopType, itemId, professionId }) {
  const item = ITEMS[itemId];
  const rules = SHOP_RULES[shopType];
  if (!item || !rules || !rules.buys.includes(item.kind)) return null;
  let price;
  if (item.kind === 'good') {
    const base = CITY_GOOD_PRICES[cityId]?.[itemId];
    if (base == null) return null;
    price = Math.floor(base * BALANCE.sellSpread);
    if (professionId === 'thief') price = Math.floor(price * BALANCE.thiefSellMul);
  } else if (item.kind === 'trophy') {
    price = Math.floor(item.basePrice * BALANCE.sellSpread);
  } else {
    price = Math.floor(item.basePrice * BALANCE.equipSellMul);
  }
  return Math.max(1, price);
}

/** قيمة حمولة القافلة عند الوجهة (تُباع تلقائيًا بسعر التاجر العادي بلا خصم). */
export function cargoValueAt(cityId, cargo) {
  let total = 0;
  for (const [itemId, qty] of Object.entries(cargo)) {
    const base = CITY_GOOD_PRICES[cityId]?.[itemId];
    if (base == null) continue;
    total += Math.floor(base * BALANCE.sellSpread) * qty;
  }
  return total;
}

export function caravanReward(destCityId, cargo) {
  const value = cargoValueAt(destCityId, cargo);
  const bonus = Math.floor(value * BALANCE.arrivalBonusPct);
  return { value, bonus, total: value + bonus };
}

export function cargoUnits(cargo) {
  let n = 0;
  for (const q of Object.values(cargo)) n += q;
  return n;
}

/** تكلفة الشفاء عند الكاهن. */
export function healCost(level) {
  return BALANCE.healCostPerLevel * level;
}
