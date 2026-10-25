-- اختبارات الاقتصاد على مستوى قاعدة البيانات. أي فشل = RAISE EXCEPTION يوقف التشغيل (ON_ERROR_STOP).
\set QUIET on
CREATE OR REPLACE FUNCTION t_assert(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT c THEN RAISE EXCEPTION 'FAIL: %', msg; END IF; RAISE NOTICE 'ok - %', msg; END $$;

INSERT INTO users (username, password_hash) VALUES ('trader1','x'),('thief1','x'),('user3','x');
CREATE TEMP TABLE ids AS SELECT 0::bigint AS t, 0::bigint AS th;

DO $$
DECLARE r jsonb; t bigint; th bigint; cid bigint; g bigint; n int;
BEGIN
  -- إنشاء الشخصيات
  r := create_character((SELECT id FROM users WHERE username='trader1'), 'سالم_تاجر', 'trader', 11.5, 28.5, 100, 110, '{}', '{"rusty_sword":1,"health_potion":2}', 3);
  PERFORM t_assert((r->>'ok')::boolean, 'create trader'); t := (r->>'id')::bigint;
  r := create_character((SELECT id FROM users WHERE username='thief1'), 'ظل_اللص', 'thief', 11.5, 28.5, 100, 85, '{}', '{"dagger":1}', 3);
  th := (r->>'id')::bigint;
  r := create_character((SELECT id FROM users WHERE username='trader1'), 'سالم_تاجر', 'hunter', 1, 1, 0, 100, '{}', '{}', 3);
  PERFORM t_assert(r->>'error' = 'NAME_TAKEN', 'duplicate character name rejected (case-insens. unique)');
  r := create_character((SELECT id FROM users WHERE username='trader1'), 'SALEM_تاجر', 'hunter', 1, 1, 0, 100, '{}', '{}', 1);
  PERFORM t_assert(r->>'error' = 'TOO_MANY_CHARACTERS', 'character limit enforced');
  PERFORM t_assert((SELECT gold FROM characters WHERE id=t)=100, 'starting gold');

  -- الشراء: رصيد كافٍ / غير كافٍ / سالب مستحيل
  r := econ_buy(t, 'wheat', 10, 8, 'buy:1');
  PERFORM t_assert((r->>'ok')::boolean AND (r->>'gold')::bigint = 20, 'buy deducts gold');
  r := econ_buy(t, 'wheat', 10, 8, 'buy:1');
  PERFORM t_assert((r->>'duplicate')::boolean AND (SELECT gold FROM characters WHERE id=t)=20, 'duplicate buy ref is a no-op');
  PERFORM t_assert((SELECT qty FROM character_items WHERE character_id=t AND item_id='wheat')=10, 'duplicate buy did not add items twice');
  r := econ_buy(t, 'gems', 1, 130, 'buy:2');
  PERFORM t_assert(r->>'error'='INSUFFICIENT_GOLD', 'buy with insufficient gold rejected');
  PERFORM t_assert((SELECT gold FROM characters WHERE id=t)=20 AND NOT EXISTS (SELECT 1 FROM character_items WHERE character_id=t AND item_id='gems'), 'rejected buy changed nothing');
  r := econ_buy(t, 'nope', 1, 1, 'buy:3');
  PERFORM t_assert(r->>'error'='UNKNOWN_ITEM', 'unknown item rejected');
  r := econ_buy(t, 'wheat', 1, -5, 'buy:4');
  PERFORM t_assert(r->>'error'='INVALID', 'negative unit price rejected');
  BEGIN UPDATE characters SET gold = -1 WHERE id=t; PERFORM t_assert(false,'negative gold must be impossible');
  EXCEPTION WHEN check_violation THEN PERFORM t_assert(true, 'CHECK constraint blocks negative gold'); END;

  -- البيع
  r := econ_sell(t, 'wheat', 20, 5, 'sell:1');
  PERFORM t_assert(r->>'error'='INSUFFICIENT_ITEMS', 'cannot sell more than owned');
  r := econ_sell(t, 'wheat', 2, 5, 'sell:2');
  PERFORM t_assert((r->>'gold')::bigint = 30, 'sell credits gold');

  -- إطلاق القافلة
  PERFORM econ_grant(t, 500, NULL, 'test_grant', 'grant:1');
  r := econ_buy(t, 'wheat', 16, 8, 'buy:5');
  r := caravan_launch(t, 'dawn_city', 'dusk_city', 40, '{"wheat":24}', 24, 160, 360, 'launch:1');
  PERFORM t_assert((r->>'ok')::boolean, 'launch caravan'); cid := (r->>'caravanId')::bigint;
  g := (r->>'gold')::bigint;
  r := caravan_launch(t, 'dawn_city', 'dusk_city', 40, '{"wheat":24}', 24, 160, 360, 'launch:1');
  PERFORM t_assert((r->>'duplicate')::boolean AND (r->>'caravanId')::bigint = cid AND (SELECT gold FROM characters WHERE id=t)=g, 'duplicate launch is idempotent and charges once');
  PERFORM econ_buy(t, 'wheat', 5, 8, 'buy:6');
  r := caravan_launch(t, 'dawn_city', 'dusk_city', 40, '{"wheat":5}', 24, 160, 40, 'launch:2');
  PERFORM t_assert(r->>'error'='ACTIVE_CARAVAN_EXISTS', 'only one active caravan per trader');
  PERFORM t_assert((SELECT qty FROM character_items WHERE character_id=t AND item_id='wheat')=5, 'rejected launch kept cargo in inventory');
  PERFORM t_assert((SELECT count(*) FROM caravan_cargo WHERE caravan_id=cid)=1 AND (SELECT qty FROM caravan_cargo WHERE caravan_id=cid)=24, 'cargo bound to caravan');

  -- حالات رفض أخرى للإطلاق
  r := caravan_launch(th, 'dawn_city', 'dusk_city', 40, '{"wheat":99}', 24, 160, 1, 'launch:3');
  PERFORM t_assert(r->>'error'='CARGO_TOO_LARGE', 'over-capacity cargo rejected');
  r := caravan_launch(th, 'dawn_city', 'dusk_city', 40, '{"iron_sword":1}', 24, 160, 1, 'launch:4');
  PERFORM t_assert(r->>'error'='UNKNOWN_ITEM', 'only trade goods can be shipped');
  r := caravan_launch(th, 'dawn_city', 'dawn_city', 40, '{"wheat":1}', 24, 160, 1, 'launch:5');
  PERFORM t_assert(r->>'error'='INVALID', 'same-city route rejected');

  -- السرقة
  UPDATE caravans SET status='traveling' WHERE id=cid;
  r := caravan_plunder(cid, th, '{"wheat":3}', 5, 'plunder:1');
  PERFORM t_assert((r->>'ok')::boolean, 'plunder succeeds');
  PERFORM t_assert((SELECT qty FROM caravan_cargo WHERE caravan_id=cid)=21 AND (SELECT qty FROM character_items WHERE character_id=th AND item_id='wheat')=3, 'plunder moves cargo atomically');
  r := caravan_plunder(cid, th, '{"wheat":3}', 5, 'plunder:1');
  PERFORM t_assert((r->>'duplicate')::boolean AND (SELECT qty FROM caravan_cargo WHERE caravan_id=cid)=21, 'duplicate plunder ref is a no-op');
  r := caravan_plunder(cid, th, '{"wheat":500}', 5, 'plunder:2');
  PERFORM t_assert(r->>'error'='INSUFFICIENT_ITEMS', 'cannot plunder more than the cargo');
  r := caravan_plunder(cid, t, '{"wheat":1}', 5, 'plunder:3');
  PERFORM t_assert(r->>'error'='INVALID', 'owner cannot plunder own caravan');

  -- الوصول وصرف المكافأة مرة واحدة
  g := (SELECT gold FROM characters WHERE id=t);
  r := caravan_settle(cid, 400, 10, NULL);
  PERFORM t_assert((r->>'ok')::boolean AND (SELECT gold FROM characters WHERE id=t)=g+400, 'settle pays reward');
  r := caravan_settle(cid, 400, 10, NULL);
  PERFORM t_assert(r->>'error'='CARAVAN_NOT_ACTIVE' AND (SELECT gold FROM characters WHERE id=t)=g+400, 'reward cannot be paid twice');
  r := caravan_plunder(cid, th, '{"wheat":1}', 5, 'plunder:4');
  PERFORM t_assert(r->>'error'='CARAVAN_NOT_ACTIVE', 'cannot plunder an arrived caravan');
  PERFORM t_assert((SELECT count(*) FROM transactions WHERE caravan_id=cid AND kind='caravan_reward')=1, 'single reward transaction logged');
  PERFORM t_assert((SELECT reward_paid FROM caravans WHERE id=cid), 'reward_paid flag set');

  -- بعد الوصول يمكن إطلاق قافلة جديدة
  r := caravan_launch(t, 'dusk_city', 'dawn_city', 40, '{"wheat":5}', 24, 160, 40, 'launch:6');
  PERFORM t_assert((r->>'ok')::boolean, 'new caravan allowed after arrival');
  cid := (r->>'caravanId')::bigint;
  UPDATE caravans SET status='under_attack' WHERE id=cid;
  r := caravan_fail(cid, 'destroyed', th, '{"wheat":2}', 'fail:1');
  PERFORM t_assert((r->>'ok')::boolean AND (r->'given'->>'wheat')::int = 2, 'destroyed caravan hands share to beneficiary');
  r := caravan_fail(cid, 'destroyed', NULL, NULL, 'fail:2');
  PERFORM t_assert(r->>'error'='CARAVAN_NOT_ACTIVE', 'failed caravan cannot fail again');
  r := caravan_settle(cid, 999, 1, NULL);
  PERFORM t_assert(r->>'error'='CARAVAN_NOT_ACTIVE', 'failed caravan cannot be paid');

  -- عقوبة الموت لا تتجاوز الرصيد
  r := econ_penalty(th, 1.0, NULL, 'death', 'death:1');
  PERFORM t_assert((SELECT gold FROM characters WHERE id=th)=0, 'penalty takes at most the balance');
  r := econ_penalty(th, 0.5, NULL, 'death', 'death:2');
  PERFORM t_assert((r->>'taken')::int = 0 AND (SELECT gold FROM characters WHERE id=th)=0, 'penalty on zero balance never goes negative');
  r := econ_charge(th, 10, 'heal', 'heal:1');
  PERFORM t_assert(r->>'error'='INSUFFICIENT_GOLD', 'charge beyond balance rejected');

  -- التجهيز والاستهلاك
  r := item_equip(t, 'rusty_sword', true);
  PERFORM t_assert((r->>'ok')::boolean AND (SELECT equipped FROM character_items WHERE character_id=t AND item_id='rusty_sword'), 'equip weapon');
  r := econ_sell(t, 'rusty_sword', 1, 10, 'sell:eq');
  PERFORM t_assert(r->>'error'='ITEM_EQUIPPED', 'cannot sell an equipped item');
  r := item_consume(t, 'health_potion');
  PERFORM t_assert((r->>'heal')::int = 60 AND (SELECT qty FROM character_items WHERE character_id=t AND item_id='health_potion')=1, 'consume potion');
  r := item_consume(t, 'wheat');
  PERFORM t_assert(r->>'error'='UNKNOWN_ITEM', 'cannot consume non-consumables');

  -- مجموع الذهب = مجموع حركات السجل (لا ذهب يظهر من العدم)
  FOR n IN SELECT id FROM characters LOOP NULL; END LOOP;
  PERFORM t_assert(NOT EXISTS (
    SELECT 1 FROM characters c WHERE c.gold <> COALESCE((SELECT sum(gold_delta) FROM transactions x WHERE x.character_id=c.id),0)
  ), 'ledger reconciles: gold == sum of transaction deltas for every character');
END $$;
