// العلاقات بين المهن: من يستطيع مهاجمة من. لا مهنة بأفضلية مطلقة:
//  - اللص يستطيع مهاجمة غير اللصوص خارج المدن، لكنه يصبح «معاديًا» (علامة مؤقتة) فيحق للجميع الرد عليه.
//  - الصياد لا يهاجم إلا لصًّا معاديًا أو مطلوبًا (سمعة سوداء عالية) → لا مكافآت من الأبرياء.
//  - التاجر يدافع فقط عن نفسه ضد المعتدي المعادي.
//  - لا قتال بين اللاعبين ولا نهب في المدن الآمنة.

import { ERR } from '../../../../shared/constants.js';
import { BALANCE } from '../../../../shared/data/balance.js';
import { isSafeAt } from '../../../../shared/maps/world.js';

export const isHostile = (p, t) => p.hostileUntil > t;
export const isWanted = (p) => p.repBlack >= BALANCE.wantedRep;

/**
 * @returns {{ok:true, aggression:boolean}|{ok:false, error:string}}
 * aggression=true يعني أن المهاجم لص يبدأ العدوان فتُوضع عليه علامة العداء.
 */
export function canAttackPlayer(att, tgt, t, world) {
  if (att.dead) return { ok: false, error: ERR.DEAD };
  if (tgt.dead || att.id === tgt.id) return { ok: false, error: ERR.INVALID };
  if (isSafeAt(world, att.x) || isSafeAt(world, tgt.x)) return { ok: false, error: ERR.SAFE_ZONE };
  const tgtHostile = isHostile(tgt, t);
  switch (att.profession) {
    case 'hunter':
      if (tgt.profession === 'thief' && (tgtHostile || isWanted(tgt))) return { ok: true, aggression: false };
      return { ok: false, error: ERR.INNOCENT_TARGET };
    case 'trader':
      if (tgtHostile) return { ok: true, aggression: false };
      return { ok: false, error: ERR.INNOCENT_TARGET };
    case 'thief':
      if (tgt.profession === 'thief') return { ok: false, error: ERR.FRIENDLY };
      return { ok: true, aggression: !tgtHostile };
    default:
      return { ok: false, error: ERR.INVALID };
  }
}

/** مهاجمة قافلة بالضرر المباشر: للصوص فقط، خارج المدن، والقافلة نشطة. */
export function canAttackCaravan(att, caravan, world) {
  if (att.dead) return { ok: false, error: ERR.DEAD };
  if (att.profession !== 'thief') return { ok: false, error: ERR.WRONG_PROFESSION };
  if (caravan.status !== 'traveling' && caravan.status !== 'under_attack') return { ok: false, error: ERR.CARAVAN_NOT_ACTIVE };
  if (att.id === caravan.ownerId) return { ok: false, error: ERR.INVALID };
  if (isSafeAt(world, att.x) || isSafeAt(world, caravan.x)) return { ok: false, error: ERR.SAFE_ZONE };
  return { ok: true, aggression: true };
}

/** المكافأة عند قتل لاعب: تعيد نوع المكافأة المستحقة للقاتل. */
export function pvpKillReward(killer, victim, t, wasValidBounty) {
  if (killer.profession === 'hunter' && victim.profession === 'thief' && wasValidBounty && !(victim.bountyLockedUntil > t)) {
    return {
      kind: 'bounty',
      gold: BALANCE.bountyBase + victim.level * BALANCE.bountyPerLevel,
      xp: BALANCE.bountyXpBase + victim.level * BALANCE.bountyXpPerLevel,
      repField: 'trade',
      rep: BALANCE.bountyRep,
    };
  }
  if (killer.profession === 'trader' && victim.profession === 'thief' && wasValidBounty) {
    return { kind: 'defense', gold: 0, xp: 10 + victim.level * 2, repField: null, rep: 0 };
  }
  if (killer.profession === 'thief') {
    return { kind: 'ambush', gold: 0, xp: 5 + victim.level, repField: 'black', rep: 3 };
  }
  return { kind: 'none', gold: 0, xp: 0, repField: null, rep: 0 };
}
