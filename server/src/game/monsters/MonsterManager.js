// الوحوش: ظهور، مطاردة، هجوم، عودة إلى نقطة الظهور، وإعادة ظهور. بيانات الأنواع في shared/data/monsters.js.

import { MONSTERS } from '../../../../shared/data/monsters.js';
import { BALANCE } from '../../../../shared/data/balance.js';
import { findWalkableNear, isSafeAt } from '../../../../shared/maps/world.js';
import { stepVector } from '../../../../shared/movement.js';
import { computeDamage, dist } from '../combat/combat.js';

export class MonsterManager {
  constructor(game) {
    this.game = game;
    this.monsters = new Map();
    this.nextId = 1;
  }

  init() {
    const { world, rng } = this.game;
    for (const area of world.monsterSpawns) {
      const def = MONSTERS[area.monster];
      if (!def) throw new Error(`unknown monster ${area.monster} in spawn ${area.id}`);
      for (let i = 0; i < area.count; i++) {
        const p = findWalkableNear(world, area.x, area.y, area.r, rng) ?? { x: area.x, y: area.y };
        const id = this.nextId++;
        this.monsters.set(id, {
          id,
          code: def.code,
          def,
          areaId: area.id,
          area,
          x: p.x,
          y: p.y,
          home: { x: p.x, y: p.y },
          hp: def.maxHp,
          maxHp: def.maxHp,
          state: 'idle',
          targetId: 0,
          atkReadyAt: 0,
          respawnAt: 0,
          dead: false,
          damagers: new Map(),
        });
      }
    }
  }

  get(id) {
    const m = this.monsters.get(id);
    return m && !m.dead ? m : null;
  }

  /** يطبّق ضررًا على وحش. يعيد true إن مات. */
  damage(m, amount, attacker) {
    if (m.dead) return false;
    const dealt = Math.min(amount, m.hp);
    m.hp -= dealt;
    m.damagers.set(attacker.id, (m.damagers.get(attacker.id) ?? 0) + dealt);
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      m.state = 'idle';
      m.targetId = 0;
      m.respawnAt = this.game.t + m.def.respawnSec;
      this.game.onMonsterKilled(m);
      m.damagers.clear();
      return true;
    }
    if (m.state !== 'chase') {
      m.state = 'chase';
      m.targetId = attacker.id;
    }
    return false;
  }

  #moveToward(m, tx, ty, dt) {
    const dx = tx - m.x;
    const dy = ty - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const step = Math.min(d, m.def.speed * dt);
    const r = stepVector(this.game.world, m, (dx / d) * (step / dt), (dy / d) * (step / dt), dt, BALANCE.monsterRadius);
    m.x = r.x;
    m.y = r.y;
  }

  tick(dt) {
    const { game } = this;
    const t = game.t;
    for (const m of this.monsters.values()) {
      if (m.dead) {
        if (t >= m.respawnAt) this.#respawn(m);
        continue;
      }
      const def = m.def;
      if (m.state === 'idle') {
        let best = null;
        let bd = def.aggro;
        for (const p of game.players.values()) {
          if (p.dead || isSafeAt(game.world, p.x)) continue;
          const d = dist(m, p);
          if (d <= bd) {
            bd = d;
            best = p;
          }
        }
        if (best) {
          m.state = 'chase';
          m.targetId = best.id;
        }
      }
      if (m.state === 'chase') {
        const target = game.players.get(m.targetId);
        if (!target || target.dead || isSafeAt(game.world, target.x) || dist(m, m.home) > def.leash) {
          m.state = 'return';
          m.targetId = 0;
        } else if (dist(m, target) <= def.attackRange) {
          if (t >= m.atkReadyAt) {
            m.atkReadyAt = t + def.attackCooldown;
            game.damagePlayer(target, computeDamage(def.atk, target.def, { rng: game.rng }), { type: 'monster', id: m.id, name: def.nameAr });
          }
        } else {
          this.#moveToward(m, target.x, target.y, dt);
        }
      }
      if (m.state === 'return') {
        this.#moveToward(m, m.home.x, m.home.y, dt);
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * BALANCE.monsterHealPerSecWhenReturning * dt);
        if (dist(m, m.home) < 0.4) {
          m.state = 'idle';
          m.hp = m.maxHp;
          m.damagers.clear();
        }
      }
    }
  }

  #respawn(m) {
    const { world, rng } = this.game;
    const p = findWalkableNear(world, m.area.x, m.area.y, m.area.r, rng) ?? { x: m.home.x, y: m.home.y };
    m.x = p.x;
    m.y = p.y;
    m.home = { x: p.x, y: p.y };
    m.hp = m.maxHp;
    m.dead = false;
    m.state = 'idle';
    m.targetId = 0;
    m.damagers.clear();
  }

  publicState(m) {
    return {
      id: m.id,
      code: m.code,
      name: m.def.nameAr,
      level: m.def.level,
      x: +m.x.toFixed(2),
      y: +m.y.toFixed(2),
      hp: Math.round(m.hp),
      maxHp: m.maxHp,
      aggro: m.state === 'chase',
    };
  }
}
