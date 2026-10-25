// حالة اللاعب في الذاكرة. DB هي مصدر الحقيقة للذهب والعناصر؛ هنا نسخة مخبأة تُحدَّث بعد كل عملية اقتصادية.

import { computeStats, xpToNext, applyXp } from '../../../../shared/progression.js';
import { MAX_SKILL_LEVEL } from '../../../../shared/data/skills.js';
import { PROFESSIONS } from '../../../../shared/data/professions.js';
import { BALANCE } from '../../../../shared/data/balance.js';
import { ITEMS } from '../../../../shared/data/items.js';

export class Player {
  constructor(rec, conn, t) {
    this.id = rec.id;
    this.userId = rec.userId;
    this.name = rec.name;
    this.profession = rec.profession;
    this.level = rec.level;
    this.xp = rec.xp;
    this.hp = rec.hp;
    this.maxHp = rec.maxHp;
    this.skillPoints = rec.skillPoints;
    this.skills = { ...rec.skills };
    this.gold = rec.gold;
    this.repTrade = rec.repTrade;
    this.repBlack = rec.repBlack;
    this.x = rec.x;
    this.y = rec.y;
    this.dir = -1;
    this.seq = 0;
    this.conn = conn;
    this.connected = true;
    this.disconnectedAt = 0;
    this.dead = rec.hp <= 0;
    this.deadUntil = 0;
    this.atkReadyAt = 0;
    this.skillReadyAt = new Map();
    this.potionReadyAt = 0;
    this.hostileUntil = 0;
    this.revealedUntil = 0;
    this.markedUntil = 0;
    this.markedMul = 1;
    this.rootedUntil = 0;
    this.bountyLockedUntil = 0;
    this.busy = false;
    this.lastSaveAt = t;
    this.dirty = false;
    this.items = new Map();
    this.quests = new Map();
    this.setItems(rec.items);
    for (const q of rec.quests ?? []) this.quests.set(q.code, { progress: q.progress, status: q.status });
    this.recompute();
    this.hp = Math.min(this.hp, this.maxHp);
    if (this.dead) this.deadUntil = t + BALANCE.respawnSec;
  }

  setItems(list) {
    this.items = new Map(list.map((i) => [i.itemId, { qty: i.qty, equipped: i.equipped }]));
  }

  get weaponId() {
    for (const [id, v] of this.items) if (v.equipped && ITEMS[id]?.slot === 'weapon') return id;
    return null;
  }
  get armorId() {
    for (const [id, v] of this.items) if (v.equipped && ITEMS[id]?.slot === 'armor') return id;
    return null;
  }

  recompute() {
    const s = computeStats(this.profession, this.level, { weaponId: this.weaponId, armorId: this.armorId });
    this.atk = s.atk;
    this.def = s.def;
    this.maxHp = s.maxHp;
    if (this.hp > this.maxHp) this.hp = this.maxHp;
  }

  get attackDef() {
    return PROFESSIONS[this.profession].attack;
  }

  skillLevel(id) {
    return this.skills[id] ?? 0;
  }

  upgradeSkill(id) {
    if (this.skillLevel(id) < 1) return 'UNKNOWN';
    if (this.skillLevel(id) >= MAX_SKILL_LEVEL) return 'MAX';
    if (this.skillPoints < 1) return 'NO_POINTS';
    this.skills[id] += 1;
    this.skillPoints -= 1;
    this.dirty = true;
    return 'OK';
  }

  /** يضيف خبرة. يعيد عدد المستويات المكتسبة. */
  addXp(amount) {
    const r = applyXp(this.level, this.xp, amount);
    this.xp = r.xp;
    if (r.levelsGained > 0) {
      this.level = r.level;
      this.skillPoints += r.levelsGained;
      this.recompute();
      this.hp = this.maxHp;
    }
    this.dirty = true;
    return r.levelsGained;
  }

  persistRecord() {
    return { id: this.id, x: this.x, y: this.y, level: this.level, xp: this.xp, hp: this.hp, maxHp: this.maxHp, skillPoints: this.skillPoints, skills: this.skills };
  }

  /** حالة ذاتية كاملة تُرسل لصاحبها فقط. */
  selfState(t) {
    const quests = {};
    for (const [code, q] of this.quests) quests[code] = q;
    return {
      id: this.id,
      name: this.name,
      profession: this.profession,
      level: this.level,
      xp: this.xp,
      xpNext: xpToNext(this.level),
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      atk: this.atk,
      def: this.def,
      gold: this.gold,
      repTrade: this.repTrade,
      repBlack: this.repBlack,
      skills: this.skills,
      skillPoints: this.skillPoints,
      quests,
      hostile: this.hostileUntil > t,
      dead: this.dead,
      respawnIn: this.dead ? Math.max(0, Math.ceil(this.deadUntil - t)) : 0,
      cooldowns: Object.fromEntries([...this.skillReadyAt].map(([k, v]) => [k, Math.max(0, +(v - t).toFixed(1))])),
    };
  }

  inventoryState() {
    return [...this.items].map(([itemId, v]) => ({ itemId, qty: v.qty, equipped: v.equipped }));
  }

  /** ما يراه الآخرون عن هذا اللاعب. */
  publicState(t) {
    return {
      id: this.id,
      name: this.name,
      profession: this.profession,
      level: this.level,
      x: +this.x.toFixed(2),
      y: +this.y.toFixed(2),
      dir: this.dir,
      hp: Math.round(this.hp),
      maxHp: this.maxHp,
      dead: this.dead,
      hostile: this.hostileUntil > t,
      wanted: this.repBlack >= BALANCE.wantedRep,
      marked: this.markedUntil > t,
      rooted: this.rootedUntil > t,
    };
  }
}
