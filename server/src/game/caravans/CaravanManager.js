// القوافل: إطلاق، حركة على المسار، هجوم/نهب، وصول وصرف المكافأة، تدمير. الحالة تُحفظ في PostgreSQL
// وتُستعاد عند إعادة تشغيل الخادم. كل نقل ذهب/بضائع يمر عبر دوال SQL ذرّية.

import { ERR, CITY_IDS } from '../../../../shared/constants.js';
import { BALANCE } from '../../../../shared/data/balance.js';
import { ITEMS } from '../../../../shared/data/items.js';
import { cargoUnits, caravanReward, cargoValueAt } from '../../../../shared/economy.js';
import { routeFor, pointOnRoute, isSafeAt } from '../../../../shared/maps/world.js';
import { dist } from '../combat/combat.js';

const ACTIVE = new Set(['preparing', 'traveling', 'under_attack']);

export class CaravanManager {
  constructor(game) {
    this.game = game;
    this.caravans = new Map(); // id → caravan
    this.byOwner = new Map(); // ownerId → caravan
    this.ledgerSeq = 0;
  }

  async init() {
    const { repo, world, t } = this.game;
    for (const r of await repo.loadActiveCaravans()) {
      const route = routeFor(world, r.origin, r.dest);
      if (!route) {
        this.game.log.error('caravan route missing, failing caravan', { id: r.id });
        await repo.failCaravan(r.id, 'route_missing', null, {}, `caravan_fail:${r.id}`).catch(() => {});
        continue;
      }
      const pos = pointOnRoute(route, r.progress);
      const c = {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        origin: r.origin,
        dest: r.dest,
        route,
        status: r.status === 'under_attack' ? 'traveling' : r.status,
        hp: r.hp,
        maxHp: r.maxHp,
        progress: r.progress,
        x: pos.x,
        y: pos.y,
        cargo: r.cargo ?? {},
        initialUnits: Number(r.initialUnits),
        plunderedUnits: Math.max(0, Number(r.initialUnits) - cargoUnits(r.cargo ?? {})),
        preparingUntil: r.status === 'preparing' ? t + BALANCE.caravanPrepareSec : 0,
        underAttackUntil: 0,
        shieldUntil: 0,
        escorts: new Set(),
        lastAttackerId: 0,
        lastSaveAt: t,
        settling: false,
        destroying: false,
        plunderLock: false,
        retryAt: 0,
      };
      this.#register(c);
    }
    return this.caravans.size;
  }

  #register(c) {
    this.caravans.set(c.id, c);
    this.byOwner.set(c.ownerId, c);
  }
  #unregister(c) {
    this.caravans.delete(c.id);
    if (this.byOwner.get(c.ownerId) === c) this.byOwner.delete(c.ownerId);
  }

  get(id) {
    const c = this.caravans.get(id);
    return c && ACTIVE.has(c.status) ? c : null;
  }
  ofOwner(ownerId) {
    return this.byOwner.get(ownerId) ?? null;
  }

  effectiveDef(c) {
    return BALANCE.caravanDef * (c.shieldUntil > this.game.t ? 2 : 1);
  }

  // ===== إطلاق =====
  async launch(player, npc, destCity, cargo, idem) {
    const { world, repo, t } = this.game;
    if (player.profession !== 'trader') return { ok: false, error: ERR.WRONG_PROFESSION };
    if (!CITY_IDS.includes(destCity) || destCity === npc.cityId) return { ok: false, error: ERR.INVALID };
    const route = routeFor(world, npc.cityId, destCity);
    if (!route) return { ok: false, error: ERR.INVALID };
    if (this.byOwner.has(player.id)) return { ok: false, error: ERR.ACTIVE_CARAVAN_EXISTS };
    for (const [id, q] of Object.entries(cargo)) {
      if (ITEMS[id]?.kind !== 'good') return { ok: false, error: ERR.UNKNOWN_ITEM };
      if ((player.items.get(id)?.qty ?? 0) < q) return { ok: false, error: ERR.INSUFFICIENT_ITEMS };
    }
    if (cargoUnits(cargo) > BALANCE.caravanCapacity) return { ok: false, error: ERR.CARGO_TOO_LARGE };
    if (player.gold < BALANCE.caravanFee) return { ok: false, error: ERR.INSUFFICIENT_GOLD };

    const r = await repo.launchCaravan({
      ownerId: player.id,
      origin: npc.cityId,
      dest: destCity,
      fee: BALANCE.caravanFee,
      cargo,
      capacity: BALANCE.caravanCapacity,
      maxHp: BALANCE.caravanMaxHp,
      initialValue: cargoValueAt(destCity, cargo),
      ref: `launch:${player.id}:${idem}`,
    });
    if (!r.ok) return { ok: false, error: r.error };
    let c = this.caravans.get(r.caravanId);
    if (!r.duplicate || !c) {
      const start = route.points[0];
      c = {
        id: r.caravanId,
        ownerId: player.id,
        ownerName: player.name,
        origin: npc.cityId,
        dest: destCity,
        route,
        status: 'preparing',
        hp: BALANCE.caravanMaxHp,
        maxHp: BALANCE.caravanMaxHp,
        progress: 0,
        x: start[0],
        y: start[1],
        cargo: { ...cargo },
        initialUnits: cargoUnits(cargo),
        plunderedUnits: 0,
        preparingUntil: t + BALANCE.caravanPrepareSec,
        underAttackUntil: 0,
        shieldUntil: 0,
        escorts: new Set(),
        lastAttackerId: 0,
        lastSaveAt: t,
        settling: false,
        destroying: false,
        plunderLock: false,
        retryAt: 0,
      };
      if (!r.duplicate) this.#register(c);
    }
    await this.game.refreshPlayer(player);
    this.game.emitNear(c.x, c.y, { type: 'caravan', code: 'launched', caravanId: c.id, owner: player.name });
    return { ok: true, caravanId: c.id, duplicate: !!r.duplicate };
  }

  // ===== تحديث =====
  tick(dt) {
    const { t } = this.game;
    for (const c of [...this.caravans.values()]) {
      if (c.settling || c.destroying) continue;
      if (c.status === 'preparing') {
        if (t >= c.preparingUntil) {
          c.status = 'traveling';
          this.#save(c, true);
          this.game.emitNear(c.x, c.y, { type: 'caravan', code: 'departed', caravanId: c.id, owner: c.ownerName });
        }
        continue;
      }
      if (c.status === 'under_attack' && t >= c.underAttackUntil) c.status = 'traveling';
      const speed = BALANCE.caravanSpeed * (c.status === 'under_attack' ? BALANCE.caravanUnderAttackSpeedMul : 1);
      c.progress = Math.min(c.route.length, c.progress + speed * dt);
      const p = pointOnRoute(c.route, c.progress);
      c.x = p.x;
      c.y = p.y;
      if (c.progress >= c.route.length) {
        this.game.track(this.#arrive(c), 'caravan arrive');
        continue;
      }
      if (t - c.lastSaveAt >= BALANCE.caravanSaveSec) this.#save(c, false);
    }
  }

  #save(c, force) {
    c.lastSaveAt = this.game.t;
    this.game.repo.saveCaravanState(c).catch((e) => this.game.log.error('caravan save failed', e));
    return force;
  }

  async #arrive(c) {
    if (c.retryAt > this.game.t) return;
    c.settling = true;
    const { repo, log } = this.game;
    try {
      const value = caravanReward(c.dest, c.cargo);
      const units = cargoUnits(c.cargo);
      const rep = units > 0 ? BALANCE.arrivalRepTrade : 0;
      const r = await repo.settleCaravan(c.id, value.total, rep, `caravan_reward:${c.id}`);
      if (!r.ok && r.error !== ERR.CARAVAN_NOT_ACTIVE) throw new Error(r.error);
      c.status = 'arrived';
      this.#unregister(c);
      if (r.ok) {
        const owner = this.game.players.get(c.ownerId);
        const xp = Math.floor(BALANCE.arrivalXpBase + value.total * BALANCE.arrivalXpPerValue);
        await this.game.grantXpToId(c.ownerId, xp);
        if (owner) {
          await this.game.refreshPlayer(owner);
          this.game.questEvent(owner, 'deliver', 1);
          this.game.emitTo(owner.id, { type: 'caravan', code: 'arrived', caravanId: c.id, reward: value.total, xp });
        }
        this.game.emitNear(c.x, c.y, { type: 'caravan', code: 'arrived_public', caravanId: c.id, owner: c.ownerName });
        await this.#payEscorts(c, value.total);
      }
    } catch (e) {
      c.settling = false;
      c.retryAt = this.game.t + 5;
      log.error('caravan settle failed', { id: c.id, err: e.message });
    }
  }

  async #payEscorts(c, total) {
    const { repo, players, log } = this.game;
    for (const hid of c.escorts) {
      const h = players.get(hid);
      if (!h || h.dead || dist(h, c) > BALANCE.escortRange) continue;
      try {
        const gold = Math.max(BALANCE.escortMin, Math.floor(total * BALANCE.escortRewardPct));
        const r = await repo.grant(hid, gold, {}, 'escort_reward', `escort:${c.id}:${hid}`);
        if (!r.ok || r.duplicate) continue;
        const rep = await repo.addRep(hid, 'trade', BALANCE.escortRep);
        h.repTrade = rep.repTrade;
        await this.game.refreshPlayer(h);
        await this.game.grantXpToId(hid, BALANCE.escortXp);
        this.game.questEvent(h, 'escort', 1);
        this.game.emitTo(hid, { type: 'caravan', code: 'escort_reward', caravanId: c.id, reward: gold });
      } catch (e) {
        log.error('escort reward failed', { caravanId: c.id, hunter: hid, err: e.message });
      }
    }
  }

  // ===== هجوم مباشر =====
  damage(c, amount, thief) {
    if (c.destroying) return false;
    const { t } = this.game;
    c.hp = Math.max(0, c.hp - amount);
    c.status = 'under_attack';
    c.underAttackUntil = t + BALANCE.underAttackSec;
    c.lastAttackerId = thief.id;
    this.game.emitTo(c.ownerId, { type: 'caravan', code: 'under_attack', caravanId: c.id, hp: c.hp });
    if (c.hp <= 0) {
      this.game.track(this.#destroy(c, thief), 'caravan destroy');
      return true;
    }
    this.#save(c, true);
    return false;
  }

  async #destroy(c, thief) {
    c.destroying = true;
    const { repo, log } = this.game;
    try {
      const items = {};
      for (const [id, q] of Object.entries(c.cargo)) {
        const share = Math.floor(q * BALANCE.caravanDestroyedThiefShare);
        if (share > 0) items[id] = share;
      }
      const r = await repo.failCaravan(c.id, 'destroyed', thief?.id ?? null, items, `caravan_fail:${c.id}`);
      if (!r.ok && r.error !== ERR.CARAVAN_NOT_ACTIVE) throw new Error(r.error);
      c.status = 'failed';
      this.#unregister(c);
      this.game.emitTo(c.ownerId, { type: 'caravan', code: 'destroyed', caravanId: c.id });
      this.game.emitNear(c.x, c.y, { type: 'caravan', code: 'destroyed_public', caravanId: c.id, owner: c.ownerName });
      if (thief) {
        await this.game.refreshPlayer(thief);
        await this.game.grantXpToId(thief.id, BALANCE.plunderXp * 2);
        const rep = await repo.addRep(thief.id, 'black', BALANCE.plunderRepBlack * 2);
        thief.repBlack = rep.repBlack;
        this.game.markHostile(thief);
      }
      const owner = this.game.players.get(c.ownerId);
      if (owner) await this.game.refreshPlayer(owner);
    } catch (e) {
      c.destroying = false;
      log.error('caravan destroy failed', { id: c.id, err: e.message });
    }
  }

  // ===== نهب =====
  async plunder(thief, c, levelMul) {
    const { t, repo } = this.game;
    if (c.plunderLock) return { ok: false, error: ERR.BUSY };
    if (isSafeAt(this.game.world, c.x) || isSafeAt(this.game.world, thief.x)) return { ok: false, error: ERR.SAFE_ZONE };
    const cap = Math.floor(c.initialUnits * BALANCE.maxPlunderFraction) - c.plunderedUnits;
    if (cap <= 0) return { ok: false, error: ERR.CARGO_EMPTY };
    const pct = BALANCE.plunderPct * levelMul * (c.shieldUntil > t ? BALANCE.shieldPlunderMul : 1);
    let items = {};
    let total = 0;
    for (const [id, q] of Object.entries(c.cargo)) {
      const take = Math.floor(q * pct);
      if (take > 0) {
        items[id] = take;
        total += take;
      }
    }
    if (total === 0) {
      const biggest = Object.entries(c.cargo).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1])[0];
      if (!biggest) return { ok: false, error: ERR.CARGO_EMPTY };
      items = { [biggest[0]]: 1 };
      total = 1;
    }
    if (total > cap) {
      // قصّ إلى الحد الأقصى المسموح بنهبه من القافلة
      let left = cap;
      const trimmed = {};
      for (const [id, q] of Object.entries(items)) {
        const k = Math.min(q, left);
        if (k > 0) trimmed[id] = k;
        left -= k;
      }
      items = trimmed;
      total = cap;
    }
    c.plunderLock = true;
    try {
      const ref = `plunder:${this.game.bootId}:${++this.ledgerSeq}`;
      const r = await repo.plunderCaravan(c.id, thief.id, items, BALANCE.plunderRepBlack, ref);
      if (!r.ok) return { ok: false, error: r.error };
      for (const [id, q] of Object.entries(items)) {
        c.cargo[id] -= q;
        if (c.cargo[id] <= 0) delete c.cargo[id];
      }
      c.plunderedUnits += total;
      c.status = 'under_attack';
      c.underAttackUntil = t + BALANCE.underAttackSec;
      c.lastAttackerId = thief.id;
      thief.repBlack = r.repBlack;
      this.game.markHostile(thief);
      await this.game.refreshPlayer(thief);
      await this.game.grantXpToId(thief.id, BALANCE.plunderXp);
      this.game.questEvent(thief, 'plunder', 1);
      this.game.emitTo(c.ownerId, { type: 'caravan', code: 'plundered', caravanId: c.id, items, thief: thief.name });
      this.#save(c, true);
      return { ok: true, items, units: total };
    } finally {
      c.plunderLock = false;
    }
  }

  // ===== مهارات التاجر =====
  shield(c, durationSec) {
    c.shieldUntil = this.game.t + durationSec;
  }
  repair(c, pct) {
    c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * pct));
    this.#save(c, true);
  }

  // ===== حفظ عند الإغلاق =====
  async saveAll() {
    await Promise.all([...this.caravans.values()].map((c) => this.game.repo.saveCaravanState(c).catch((e) => this.game.log.error('caravan save failed', e))));
  }

  /** العرض: التفاصيل الحساسة للمالك وللصوص القريبين فقط. */
  publicState(c, viewer, t) {
    const detail = viewer && (viewer.id === c.ownerId || (viewer.profession === 'thief' && dist(viewer, c) <= BALANCE.thiefScoutRadius));
    return {
      id: c.id,
      ownerId: c.ownerId,
      owner: c.ownerName,
      x: +c.x.toFixed(2),
      y: +c.y.toFixed(2),
      hp: Math.round(c.hp),
      maxHp: c.maxHp,
      status: c.status,
      dest: c.dest,
      progress: +(c.progress / c.route.length).toFixed(3),
      remaining: +Math.max(0, c.route.length - c.progress).toFixed(1),
      shield: c.shieldUntil > t,
      cargo: detail ? c.cargo : undefined,
      units: detail ? cargoUnits(c.cargo) : undefined,
      value: detail ? caravanReward(c.dest, c.cargo).total : undefined,
    };
  }
}
