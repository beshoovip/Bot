// تعريف العناصر. الأنواع: weapon, armor, consumable, good (بضاعة تجارية), trophy (غنيمة تُباع فقط).
// أضف عنصرًا جديدًا هنا ثم شغّل: npm run gen:seed

export const ITEMS = Object.freeze({
  // أسلحة
  rusty_sword: { id: 'rusty_sword', kind: 'weapon', slot: 'weapon', nameAr: 'سيف صدئ', nameEn: 'Rusty Sword', atk: 2, basePrice: 20, minLevel: 1, weaponClass: 'sword' },
  iron_sword: { id: 'iron_sword', kind: 'weapon', slot: 'weapon', nameAr: 'سيف حديدي', nameEn: 'Iron Sword', atk: 6, basePrice: 140, minLevel: 4, weaponClass: 'sword' },
  steel_sword: { id: 'steel_sword', kind: 'weapon', slot: 'weapon', nameAr: 'سيف فولاذي', nameEn: 'Steel Sword', atk: 12, basePrice: 420, minLevel: 9, weaponClass: 'sword' },
  dagger: { id: 'dagger', kind: 'weapon', slot: 'weapon', nameAr: 'خنجر', nameEn: 'Dagger', atk: 3, basePrice: 30, minLevel: 1, weaponClass: 'dagger' },
  shadow_dagger: { id: 'shadow_dagger', kind: 'weapon', slot: 'weapon', nameAr: 'خنجر الظل', nameEn: 'Shadow Dagger', atk: 8, basePrice: 190, minLevel: 5, weaponClass: 'dagger' },
  assassin_blade: { id: 'assassin_blade', kind: 'weapon', slot: 'weapon', nameAr: 'نصل القاتل', nameEn: 'Assassin Blade', atk: 14, basePrice: 500, minLevel: 10, weaponClass: 'dagger' },
  short_bow: { id: 'short_bow', kind: 'weapon', slot: 'weapon', nameAr: 'قوس قصير', nameEn: 'Short Bow', atk: 3, basePrice: 30, minLevel: 1, weaponClass: 'bow' },
  hunter_bow: { id: 'hunter_bow', kind: 'weapon', slot: 'weapon', nameAr: 'قوس الصياد', nameEn: 'Hunter Bow', atk: 8, basePrice: 190, minLevel: 5, weaponClass: 'bow' },
  elm_longbow: { id: 'elm_longbow', kind: 'weapon', slot: 'weapon', nameAr: 'قوس الدردار الطويل', nameEn: 'Elm Longbow', atk: 14, basePrice: 480, minLevel: 10, weaponClass: 'bow' },
  // دروع
  leather_vest: { id: 'leather_vest', kind: 'armor', slot: 'armor', nameAr: 'صدرية جلدية', nameEn: 'Leather Vest', def: 3, basePrice: 50, minLevel: 1 },
  chain_vest: { id: 'chain_vest', kind: 'armor', slot: 'armor', nameAr: 'درع حلقي', nameEn: 'Chain Vest', def: 7, basePrice: 210, minLevel: 6 },
  plate_vest: { id: 'plate_vest', kind: 'armor', slot: 'armor', nameAr: 'درع صفائحي', nameEn: 'Plate Vest', def: 12, basePrice: 520, minLevel: 11 },
  // مستهلكات
  health_potion: { id: 'health_potion', kind: 'consumable', nameAr: 'جرعة شفاء', nameEn: 'Health Potion', heal: 60, basePrice: 25, minLevel: 1 },
  big_health_potion: { id: 'big_health_potion', kind: 'consumable', nameAr: 'جرعة شفاء كبرى', nameEn: 'Large Health Potion', heal: 150, basePrice: 70, minLevel: 1 },
  // بضائع تجارية (الأسعار الفعلية لكل مدينة في economy.js)
  wheat: { id: 'wheat', kind: 'good', nameAr: 'قمح', nameEn: 'Wheat', basePrice: 10, minLevel: 1 },
  cloth: { id: 'cloth', kind: 'good', nameAr: 'قماش', nameEn: 'Cloth', basePrice: 20, minLevel: 1 },
  iron_ore: { id: 'iron_ore', kind: 'good', nameAr: 'خام الحديد', nameEn: 'Iron Ore', basePrice: 30, minLevel: 1 },
  spices: { id: 'spices', kind: 'good', nameAr: 'توابل', nameEn: 'Spices', basePrice: 40, minLevel: 1 },
  silk: { id: 'silk', kind: 'good', nameAr: 'حرير', nameEn: 'Silk', basePrice: 70, minLevel: 1 },
  gems: { id: 'gems', kind: 'good', nameAr: 'أحجار كريمة', nameEn: 'Gems', basePrice: 150, minLevel: 1 },
  // غنائم
  pelt: { id: 'pelt', kind: 'trophy', nameAr: 'جلد حيوان', nameEn: 'Pelt', basePrice: 12, minLevel: 1 },
  ancient_coin: { id: 'ancient_coin', kind: 'trophy', nameAr: 'عملة قديمة', nameEn: 'Ancient Coin', basePrice: 60, minLevel: 1 },
});

export const GOOD_IDS = Object.freeze(Object.values(ITEMS).filter((i) => i.kind === 'good').map((i) => i.id));

export function getItem(id) {
  return Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : null;
}
