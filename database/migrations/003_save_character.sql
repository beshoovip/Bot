-- 003_save_character.sql — حفظ حالة الشخصية في استدعاء ذرّي واحد (الموضع + الإحصاءات).
-- لا يلمس الذهب أو العناصر أبدًا: هذه تتغير فقط عبر دوال الاقتصاد.
CREATE OR REPLACE FUNCTION save_character(
  p_id bigint, p_x real, p_y real, p_level integer, p_xp bigint, p_hp integer, p_max_hp integer, p_skill_points integer, p_skills jsonb
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE characters SET pos_x = p_x, pos_y = p_y, last_seen_at = now() WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE character_stats
     SET level = p_level, xp = p_xp, max_hp = p_max_hp, hp = LEAST(GREATEST(p_hp, 0), p_max_hp),
         skill_points = p_skill_points, skills = COALESCE(p_skills, '{}'::jsonb), updated_at = now()
   WHERE character_id = p_id;
  RETURN true;
END $$;
