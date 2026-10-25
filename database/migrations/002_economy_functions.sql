-- 002_economy_functions.sql — العمليات المالية والسرقة والمكافآت كدوال ذرّية.
-- كل دالة: تقفل صفوف الأطراف FOR UPDATE بترتيب ثابت (قافلة ثم شخصية)، تتحقق، تنفذ، تسجل،
-- وتعيد jsonb {ok, ...}. أي خطأ منطقي (RAISE) يتراجع عن كل ما فعلته الدالة (EXCEPTION block).
-- ref: مفتاح تكرار؛ إعادة استدعاء بنفس المفتاح تعيد duplicate=true دون تنفيذ ثانٍ.

CREATE OR REPLACE FUNCTION _lock_char(p_char bigint) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE v_gold bigint;
BEGIN
  SELECT gold INTO v_gold FROM characters WHERE id = p_char FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN v_gold;
END $$;

CREATE OR REPLACE FUNCTION _add_item(p_char bigint, p_item text, p_qty integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_cap integer; v_used integer;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM items WHERE id = p_item) THEN RAISE EXCEPTION 'UNKNOWN_ITEM'; END IF;
  UPDATE character_items SET qty = qty + p_qty, updated_at = now()
   WHERE character_id = p_char AND item_id = p_item AND qty + p_qty <= 9999;
  IF FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM character_items WHERE character_id = p_char AND item_id = p_item) THEN
    RAISE EXCEPTION 'INVENTORY_FULL';
  END IF;
  SELECT capacity INTO v_cap FROM inventories WHERE character_id = p_char;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT count(*) INTO v_used FROM character_items WHERE character_id = p_char;
  IF v_used >= v_cap THEN RAISE EXCEPTION 'INVENTORY_FULL'; END IF;
  INSERT INTO character_items (character_id, item_id, qty) VALUES (p_char, p_item, p_qty);
END $$;

CREATE OR REPLACE FUNCTION _remove_item(p_char bigint, p_item text, p_qty integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_qty integer; v_eq boolean;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
  SELECT qty, equipped INTO v_qty, v_eq FROM character_items
   WHERE character_id = p_char AND item_id = p_item FOR UPDATE;
  IF NOT FOUND OR v_qty < p_qty THEN RAISE EXCEPTION 'INSUFFICIENT_ITEMS'; END IF;
  IF v_qty = p_qty THEN
    IF v_eq THEN RAISE EXCEPTION 'ITEM_EQUIPPED'; END IF;
    DELETE FROM character_items WHERE character_id = p_char AND item_id = p_item;
  ELSE
    UPDATE character_items SET qty = qty - p_qty, updated_at = now()
     WHERE character_id = p_char AND item_id = p_item;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION _log_tx(
  p_char bigint, p_kind text, p_gold_delta bigint, p_balance bigint,
  p_item text, p_qty integer, p_caravan bigint, p_ref text, p_detail jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO transactions (character_id, kind, gold_delta, balance_after, item_id, qty, caravan_id, ref_key, detail)
  VALUES (p_char, p_kind, p_gold_delta, p_balance, p_item, p_qty, p_caravan, p_ref, COALESCE(p_detail, '{}'::jsonb));
END $$;

-- ===== شراء =====
CREATE OR REPLACE FUNCTION econ_buy(p_char bigint, p_item text, p_qty integer, p_unit integer, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_total bigint; v_new bigint;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 999 OR p_unit IS NULL OR p_unit < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gold', v_gold);
  END IF;
  v_total := p_qty::bigint * p_unit;
  IF v_gold < v_total THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
  PERFORM _add_item(p_char, p_item, p_qty);
  UPDATE characters SET gold = gold - v_total WHERE id = p_char RETURNING gold INTO v_new;
  PERFORM _log_tx(p_char, 'buy', -v_total, v_new, p_item, p_qty, NULL, p_ref, jsonb_build_object('unit', p_unit));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gold', v_new, 'spent', v_total);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== بيع =====
CREATE OR REPLACE FUNCTION econ_sell(p_char bigint, p_item text, p_qty integer, p_unit integer, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_total bigint; v_new bigint;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 OR p_qty > 9999 OR p_unit IS NULL OR p_unit < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gold', v_gold);
  END IF;
  PERFORM _remove_item(p_char, p_item, p_qty);
  v_total := p_qty::bigint * p_unit;
  UPDATE characters SET gold = gold + v_total WHERE id = p_char RETURNING gold INTO v_new;
  PERFORM _log_tx(p_char, 'sell', v_total, v_new, p_item, p_qty, NULL, p_ref, jsonb_build_object('unit', p_unit));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gold', v_new, 'earned', v_total);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== منح ذهب/عناصر (غنائم، مكافآت مهام، مكافآت صيد) =====
CREATE OR REPLACE FUNCTION econ_grant(p_char bigint, p_gold bigint, p_items jsonb, p_kind text, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_new bigint; r record; v_items jsonb := COALESCE(p_items, '{}'::jsonb);
BEGIN
  IF p_gold IS NULL OR p_gold < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF jsonb_typeof(v_items) <> 'object' THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF p_gold = 0 AND v_items = '{}'::jsonb THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gold', v_gold);
  END IF;
  FOR r IN SELECT key, value FROM jsonb_each_text(v_items) LOOP
    PERFORM _add_item(p_char, r.key, r.value::integer);
  END LOOP;
  UPDATE characters SET gold = gold + p_gold WHERE id = p_char RETURNING gold INTO v_new;
  PERFORM _log_tx(p_char, COALESCE(p_kind, 'grant'), p_gold, v_new, NULL, NULL, NULL, p_ref, jsonb_build_object('items', v_items));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gold', v_new);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== سحب عناصر (فقدان عند الموت مثلًا) =====
CREATE OR REPLACE FUNCTION econ_take_items(p_char bigint, p_items jsonb, p_kind text, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; r record; v_items jsonb := COALESCE(p_items, '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_items) <> 'object' OR v_items = '{}'::jsonb THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gold', v_gold);
  END IF;
  FOR r IN SELECT key, value FROM jsonb_each_text(v_items) LOOP
    PERFORM _remove_item(p_char, r.key, r.value::integer);
  END LOOP;
  PERFORM _log_tx(p_char, COALESCE(p_kind, 'take_items'), 0, v_gold, NULL, NULL, NULL, p_ref, jsonb_build_object('items', v_items));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gold', v_gold);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== عقوبة نسبية (لا تتجاوز الرصيد أبدًا) =====
CREATE OR REPLACE FUNCTION econ_penalty(p_char bigint, p_pct numeric, p_cap bigint, p_kind text, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_take bigint; v_new bigint;
BEGIN
  IF p_pct IS NULL OR p_pct < 0 OR p_pct > 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'taken', 0, 'gold', v_gold);
  END IF;
  v_take := LEAST(v_gold, floor(v_gold * p_pct)::bigint);
  IF p_cap IS NOT NULL THEN v_take := LEAST(v_take, p_cap); END IF;
  UPDATE characters SET gold = gold - v_take WHERE id = p_char RETURNING gold INTO v_new;
  PERFORM _log_tx(p_char, COALESCE(p_kind, 'penalty'), -v_take, v_new, NULL, NULL, NULL, p_ref, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'taken', v_take, 'gold', v_new);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== رسم ثابت (شفاء، خدمات) =====
CREATE OR REPLACE FUNCTION econ_charge(p_char bigint, p_amount bigint, p_kind text, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_new bigint;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_char);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gold', v_gold);
  END IF;
  IF v_gold < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
  UPDATE characters SET gold = gold - p_amount WHERE id = p_char RETURNING gold INTO v_new;
  PERFORM _log_tx(p_char, COALESCE(p_kind, 'charge'), -p_amount, v_new, NULL, NULL, NULL, p_ref, '{}'::jsonb);
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gold', v_new);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== تجهيز / استهلاك =====
CREATE OR REPLACE FUNCTION item_equip(p_char bigint, p_item text, p_equip boolean)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_slot text;
BEGIN
  PERFORM _lock_char(p_char);
  SELECT slot INTO v_slot FROM items WHERE id = p_item;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'UNKNOWN_ITEM'; END IF;
  IF NOT EXISTS (SELECT 1 FROM character_items WHERE character_id = p_char AND item_id = p_item) THEN
    RAISE EXCEPTION 'INSUFFICIENT_ITEMS';
  END IF;
  IF p_equip THEN
    UPDATE character_items ci SET equipped = false, updated_at = now()
      FROM items i WHERE ci.character_id = p_char AND ci.item_id = i.id AND i.slot = v_slot AND ci.equipped AND ci.item_id <> p_item;
  END IF;
  UPDATE character_items SET equipped = p_equip, updated_at = now() WHERE character_id = p_char AND item_id = p_item;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION item_consume(p_char bigint, p_item text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_heal integer; v_kind item_kind;
BEGIN
  PERFORM _lock_char(p_char);
  SELECT heal, kind INTO v_heal, v_kind FROM items WHERE id = p_item;
  IF NOT FOUND OR v_kind <> 'consumable' THEN RAISE EXCEPTION 'UNKNOWN_ITEM'; END IF;
  PERFORM _remove_item(p_char, p_item, 1);
  RETURN jsonb_build_object('ok', true, 'heal', v_heal);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== إنشاء شخصية (ذرّي: حد 3 شخصيات + اسم فريد + عناصر البداية) =====
CREATE OR REPLACE FUNCTION create_character(
  p_user bigint, p_name text, p_prof profession, p_x real, p_y real,
  p_gold bigint, p_hp integer, p_skills jsonb, p_items jsonb, p_max_chars integer
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_id bigint; v_count integer; r record;
BEGIN
  PERFORM 1 FROM users WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT count(*) INTO v_count FROM characters WHERE user_id = p_user;
  IF v_count >= p_max_chars THEN RAISE EXCEPTION 'TOO_MANY_CHARACTERS'; END IF;
  INSERT INTO characters (user_id, name, profession, gold, pos_x, pos_y)
  VALUES (p_user, p_name, p_prof, p_gold, p_x, p_y) RETURNING id INTO v_id;
  INSERT INTO character_stats (character_id, level, xp, hp, max_hp, skill_points, skills)
  VALUES (v_id, 1, 0, p_hp, p_hp, 0, COALESCE(p_skills, '{}'::jsonb));
  INSERT INTO inventories (character_id) VALUES (v_id);
  FOR r IN SELECT key, value FROM jsonb_each_text(COALESCE(p_items, '{}'::jsonb)) LOOP
    PERFORM _add_item(v_id, r.key, r.value::integer);
  END LOOP;
  IF p_gold > 0 THEN
    PERFORM _log_tx(v_id, 'starting_gold', p_gold, p_gold, NULL, NULL, NULL, 'start:' || v_id, '{}'::jsonb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'error', 'NAME_TAKEN');
  WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== إطلاق قافلة =====
CREATE OR REPLACE FUNCTION caravan_launch(
  p_owner bigint, p_origin text, p_dest text, p_fee integer, p_cargo jsonb,
  p_capacity integer, p_max_hp integer, p_initial_value bigint, p_ref text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_gold bigint; v_new bigint; v_id bigint; r record; v_units integer := 0; v_prev bigint;
BEGIN
  IF p_origin IS NULL OR p_dest IS NULL OR p_origin = p_dest THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF p_fee IS NULL OR p_fee < 0 OR p_capacity < 1 OR p_max_hp < 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF p_cargo IS NULL OR jsonb_typeof(p_cargo) <> 'object' OR p_cargo = '{}'::jsonb THEN RAISE EXCEPTION 'CARGO_EMPTY'; END IF;
  v_gold := _lock_char(p_owner);
  IF p_ref IS NOT NULL THEN
    SELECT caravan_id INTO v_prev FROM transactions WHERE ref_key = p_ref;
    IF FOUND THEN RETURN jsonb_build_object('ok', true, 'duplicate', true, 'caravanId', v_prev, 'gold', v_gold); END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM caravans WHERE owner_id = p_owner AND status IN ('preparing', 'traveling', 'under_attack')) THEN
    RAISE EXCEPTION 'ACTIVE_CARAVAN_EXISTS';
  END IF;
  FOR r IN SELECT key, value::integer AS qty FROM jsonb_each_text(p_cargo) LOOP
    IF r.qty < 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
    IF NOT EXISTS (SELECT 1 FROM items WHERE id = r.key AND kind = 'good') THEN RAISE EXCEPTION 'UNKNOWN_ITEM'; END IF;
    v_units := v_units + r.qty;
  END LOOP;
  IF v_units > p_capacity THEN RAISE EXCEPTION 'CARGO_TOO_LARGE'; END IF;
  IF v_gold < p_fee THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
  FOR r IN SELECT key, value::integer AS qty FROM jsonb_each_text(p_cargo) LOOP
    PERFORM _remove_item(p_owner, r.key, r.qty);
  END LOOP;
  INSERT INTO caravans (owner_id, origin_city, dest_city, status, hp, max_hp, capacity, fee_paid, initial_value)
  VALUES (p_owner, p_origin, p_dest, 'preparing', p_max_hp, p_max_hp, p_capacity, p_fee, COALESCE(p_initial_value, 0))
  RETURNING id INTO v_id;
  FOR r IN SELECT key, value::integer AS qty FROM jsonb_each_text(p_cargo) LOOP
    INSERT INTO caravan_cargo (caravan_id, item_id, qty, initial_qty) VALUES (v_id, r.key, r.qty, r.qty);
  END LOOP;
  UPDATE characters SET gold = gold - p_fee WHERE id = p_owner RETURNING gold INTO v_new;
  PERFORM _log_tx(p_owner, 'caravan_launch', -p_fee, v_new, NULL, v_units, v_id, p_ref, jsonb_build_object('cargo', p_cargo, 'dest', p_dest));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'caravanId', v_id, 'gold', v_new);
EXCEPTION
  WHEN unique_violation THEN RETURN jsonb_build_object('ok', false, 'error', 'ACTIVE_CARAVAN_EXISTS');
  WHEN SQLSTATE 'P0001' THEN RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== وصول القافلة وصرف المكافأة مرة واحدة فقط =====
CREATE OR REPLACE FUNCTION caravan_settle(p_caravan bigint, p_reward_gold bigint, p_rep integer, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner bigint; v_status caravan_status; v_paid boolean; v_gold bigint; v_new bigint; v_rep integer;
BEGIN
  IF p_reward_gold IS NULL OR p_reward_gold < 0 OR p_rep IS NULL OR p_rep < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  SELECT owner_id, status, reward_paid INTO v_owner, v_status, v_paid FROM caravans WHERE id = p_caravan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_paid OR v_status NOT IN ('traveling', 'under_attack') THEN RAISE EXCEPTION 'CARAVAN_NOT_ACTIVE'; END IF;
  v_gold := _lock_char(v_owner);
  UPDATE caravans SET status = 'arrived', reward_paid = true, completed_at = now(), updated_at = now() WHERE id = p_caravan;
  UPDATE characters SET gold = gold + p_reward_gold, rep_trade = rep_trade + p_rep WHERE id = v_owner
    RETURNING gold, rep_trade INTO v_new, v_rep;
  PERFORM _log_tx(v_owner, 'caravan_reward', p_reward_gold, v_new, NULL, NULL, p_caravan, COALESCE(p_ref, 'caravan_reward:' || p_caravan), jsonb_build_object('rep', p_rep));
  RETURN jsonb_build_object('ok', true, 'gold', v_new, 'repTrade', v_rep, 'ownerId', v_owner);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== نهب: نقل جزء من الحمولة إلى اللص =====
CREATE OR REPLACE FUNCTION caravan_plunder(p_caravan bigint, p_thief bigint, p_items jsonb, p_rep integer, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_owner bigint; v_status caravan_status; v_gold bigint; r record; v_rep integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'object' OR p_items = '{}'::jsonb THEN RAISE EXCEPTION 'INVALID'; END IF;
  IF p_rep IS NULL OR p_rep < 0 THEN RAISE EXCEPTION 'INVALID'; END IF;
  SELECT owner_id, status INTO v_owner, v_status FROM caravans WHERE id = p_caravan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_status NOT IN ('traveling', 'under_attack') THEN RAISE EXCEPTION 'CARAVAN_NOT_ACTIVE'; END IF;
  IF v_owner = p_thief THEN RAISE EXCEPTION 'INVALID'; END IF;
  v_gold := _lock_char(p_thief);
  IF p_ref IS NOT NULL AND EXISTS (SELECT 1 FROM transactions WHERE ref_key = p_ref) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;
  FOR r IN SELECT key, value::integer AS qty FROM jsonb_each_text(p_items) LOOP
    IF r.qty < 1 THEN RAISE EXCEPTION 'INVALID'; END IF;
    UPDATE caravan_cargo SET qty = qty - r.qty WHERE caravan_id = p_caravan AND item_id = r.key AND qty >= r.qty;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_ITEMS'; END IF;
    PERFORM _add_item(p_thief, r.key, r.qty);
  END LOOP;
  UPDATE characters SET rep_black = rep_black + p_rep WHERE id = p_thief RETURNING rep_black INTO v_rep;
  PERFORM _log_tx(p_thief, 'plunder', 0, v_gold, NULL, NULL, p_caravan, p_ref, jsonb_build_object('items', p_items, 'owner', v_owner));
  PERFORM _log_tx(v_owner, 'caravan_plundered', 0, NULL, NULL, NULL, p_caravan, NULL, jsonb_build_object('items', p_items, 'thief', p_thief));
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'repBlack', v_rep, 'ownerId', v_owner);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- ===== فشل القافلة (تدميرها) مع توزيع اختياري لجزء من الحمولة =====
CREATE OR REPLACE FUNCTION caravan_fail(p_caravan bigint, p_reason text, p_beneficiary bigint, p_items jsonb, p_ref text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_status caravan_status; v_owner bigint; r record; v_given jsonb := '{}'::jsonb;
BEGIN
  SELECT owner_id, status INTO v_owner, v_status FROM caravans WHERE id = p_caravan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_status NOT IN ('preparing', 'traveling', 'under_attack') THEN RAISE EXCEPTION 'CARAVAN_NOT_ACTIVE'; END IF;
  IF p_beneficiary IS NOT NULL AND p_items IS NOT NULL AND jsonb_typeof(p_items) = 'object' THEN
    PERFORM _lock_char(p_beneficiary);
    FOR r IN SELECT key, value::integer AS qty FROM jsonb_each_text(p_items) LOOP
      IF r.qty < 1 THEN CONTINUE; END IF;
      BEGIN
        UPDATE caravan_cargo SET qty = qty - r.qty WHERE caravan_id = p_caravan AND item_id = r.key AND qty >= r.qty;
        IF FOUND THEN
          PERFORM _add_item(p_beneficiary, r.key, r.qty);
          v_given := v_given || jsonb_build_object(r.key, r.qty);
        END IF;
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        NULL; -- مخزون المستفيد ممتلئ: تُفقد هذه الوحدات (التراجع محصور في هذا الجزء)
      END;
    END LOOP;
  END IF;
  UPDATE caravan_cargo SET qty = 0 WHERE caravan_id = p_caravan;
  UPDATE caravans SET status = 'failed', fail_reason = p_reason, hp = 0, completed_at = now(), updated_at = now() WHERE id = p_caravan;
  PERFORM _log_tx(v_owner, 'caravan_failed', 0, NULL, NULL, NULL, p_caravan, p_ref, jsonb_build_object('reason', p_reason, 'beneficiary', p_beneficiary, 'given', v_given));
  RETURN jsonb_build_object('ok', true, 'given', v_given, 'ownerId', v_owner);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;
