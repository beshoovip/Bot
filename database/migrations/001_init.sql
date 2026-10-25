-- 001_init.sql — المخطط الأساسي. مصمم بحيث تتحكم قاعدة البيانات نفسها في سلامة الاقتصاد:
-- قيود CHECK تمنع الرصيد السالب، وفهارس فريدة تمنع تكرار العمليات وتعدد القوافل النشطة.

CREATE TYPE profession AS ENUM ('trader', 'thief', 'hunter');
CREATE TYPE item_kind AS ENUM ('weapon', 'armor', 'consumable', 'good', 'trophy');
CREATE TYPE caravan_status AS ENUM ('preparing', 'traveling', 'under_attack', 'arrived', 'failed');

-- الحسابات
CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  username      text        NOT NULL,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_]{3,20}$')
);
CREATE UNIQUE INDEX users_username_key ON users (username);

-- جلسات الدخول: نخزن تجزئة الرمز فقط (لا الرمز نفسه)
CREATE TABLE sessions (
  id         bigserial PRIMARY KEY,
  user_id    bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- الشخصيات
CREATE TABLE characters (
  id           bigserial PRIMARY KEY,
  user_id      bigint      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         text        NOT NULL,
  profession   profession  NOT NULL,
  gold         bigint      NOT NULL DEFAULT 0 CHECK (gold >= 0),
  rep_trade    integer     NOT NULL DEFAULT 0 CHECK (rep_trade >= 0),
  rep_black    integer     NOT NULL DEFAULT 0 CHECK (rep_black >= 0),
  pos_x        real        NOT NULL,
  pos_y        real        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  CONSTRAINT characters_name_len CHECK (char_length(name) BETWEEN 3 AND 16)
);
CREATE UNIQUE INDEX characters_name_key ON characters (lower(name));
CREATE INDEX characters_user_idx ON characters (user_id);

CREATE TABLE character_stats (
  character_id bigint      PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  level        integer     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  xp           bigint      NOT NULL DEFAULT 0 CHECK (xp >= 0),
  hp           integer     NOT NULL CHECK (hp >= 0),
  max_hp       integer     NOT NULL CHECK (max_hp > 0),
  skill_points integer     NOT NULL DEFAULT 0 CHECK (skill_points >= 0),
  skills       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stats_hp_le_max CHECK (hp <= max_hp)
);

CREATE TABLE inventories (
  character_id bigint  PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
  capacity     integer NOT NULL DEFAULT 30 CHECK (capacity BETWEEN 1 AND 200)
);

-- تعريف العناصر (يُملأ من database/seeds)
CREATE TABLE items (
  id           text      PRIMARY KEY,
  kind         item_kind NOT NULL,
  name_ar      text      NOT NULL,
  name_en      text      NOT NULL,
  slot         text      CHECK (slot IN ('weapon', 'armor')),
  weapon_class text,
  atk          integer   NOT NULL DEFAULT 0 CHECK (atk >= 0),
  def          integer   NOT NULL DEFAULT 0 CHECK (def >= 0),
  heal         integer   NOT NULL DEFAULT 0 CHECK (heal >= 0),
  base_price   integer   NOT NULL CHECK (base_price >= 0),
  min_level    integer   NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  CONSTRAINT items_slot_matches_kind CHECK (
    (kind IN ('weapon', 'armor')) = (slot IS NOT NULL)
  )
);

CREATE TABLE character_items (
  character_id bigint      NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  item_id      text        NOT NULL REFERENCES items (id),
  qty          integer     NOT NULL CHECK (qty BETWEEN 1 AND 9999),
  equipped     boolean     NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, item_id)
);

-- القوافل
CREATE TABLE caravans (
  id            bigserial      PRIMARY KEY,
  owner_id      bigint         NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  origin_city   text           NOT NULL,
  dest_city     text           NOT NULL,
  status        caravan_status NOT NULL DEFAULT 'preparing',
  hp            integer        NOT NULL CHECK (hp >= 0),
  max_hp        integer        NOT NULL CHECK (max_hp > 0),
  capacity      integer        NOT NULL CHECK (capacity > 0),
  progress      real           NOT NULL DEFAULT 0 CHECK (progress >= 0),
  pos_x         real,
  pos_y         real,
  fee_paid      integer        NOT NULL CHECK (fee_paid >= 0),
  initial_value bigint         NOT NULL DEFAULT 0 CHECK (initial_value >= 0),
  reward_paid   boolean        NOT NULL DEFAULT false,
  fail_reason   text,
  created_at    timestamptz    NOT NULL DEFAULT now(),
  updated_at    timestamptz    NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  CONSTRAINT caravans_distinct_cities CHECK (origin_city <> dest_city),
  CONSTRAINT caravans_hp_le_max CHECK (hp <= max_hp)
);
-- قافلة نشطة واحدة فقط لكل تاجر (قيد على مستوى قاعدة البيانات)
CREATE UNIQUE INDEX caravans_one_active_per_owner ON caravans (owner_id)
  WHERE status IN ('preparing', 'traveling', 'under_attack');
CREATE INDEX caravans_status_idx ON caravans (status);

CREATE TABLE caravan_cargo (
  caravan_id  bigint  NOT NULL REFERENCES caravans (id) ON DELETE CASCADE,
  item_id     text    NOT NULL REFERENCES items (id),
  qty         integer NOT NULL CHECK (qty >= 0),
  initial_qty integer NOT NULL CHECK (initial_qty > 0),
  PRIMARY KEY (caravan_id, item_id)
);

-- سجل المعاملات (تدقيق + منع التكرار عبر ref_key)
CREATE TABLE transactions (
  id            bigserial   PRIMARY KEY,
  character_id  bigint      REFERENCES characters (id) ON DELETE SET NULL,
  kind          text        NOT NULL,
  gold_delta    bigint      NOT NULL DEFAULT 0,
  balance_after bigint,
  item_id       text,
  qty           integer,
  caravan_id    bigint      REFERENCES caravans (id) ON DELETE SET NULL,
  ref_key       text,
  detail        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX transactions_ref_key_key ON transactions (ref_key) WHERE ref_key IS NOT NULL;
CREATE INDEX transactions_char_idx ON transactions (character_id, created_at DESC);
CREATE INDEX transactions_caravan_idx ON transactions (caravan_id);

-- المهام
CREATE TABLE quests (
  code        text    PRIMARY KEY,
  title_ar    text    NOT NULL,
  desc_ar     text    NOT NULL,
  profession  profession,
  objective   text    NOT NULL,
  target      integer NOT NULL CHECK (target > 0),
  reward_gold integer NOT NULL DEFAULT 0 CHECK (reward_gold >= 0),
  reward_xp   integer NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  min_level   integer NOT NULL DEFAULT 1
);

CREATE TABLE character_quests (
  character_id bigint      NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  quest_code   text        NOT NULL REFERENCES quests (code),
  progress     integer     NOT NULL DEFAULT 0 CHECK (progress >= 0),
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'claimed')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, quest_code)
);

-- تعريف الوحوش
CREATE TABLE monsters (
  code            text    PRIMARY KEY,
  name_ar         text    NOT NULL,
  level           integer NOT NULL CHECK (level >= 1),
  max_hp          integer NOT NULL CHECK (max_hp > 0),
  atk             integer NOT NULL CHECK (atk >= 0),
  def             integer NOT NULL CHECK (def >= 0),
  xp              integer NOT NULL CHECK (xp >= 0),
  gold_min        integer NOT NULL CHECK (gold_min >= 0),
  gold_max        integer NOT NULL CHECK (gold_max >= gold_min),
  aggro_range     real    NOT NULL,
  leash_range     real    NOT NULL,
  speed           real    NOT NULL,
  attack_range    real    NOT NULL,
  attack_cooldown real    NOT NULL,
  respawn_sec     integer NOT NULL,
  loot            jsonb   NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE chat_messages (
  id           bigserial   PRIMARY KEY,
  character_id bigint      REFERENCES characters (id) ON DELETE SET NULL,
  channel      text        NOT NULL DEFAULT 'global',
  author_name  text        NOT NULL,
  body         text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 200),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_channel_time_idx ON chat_messages (channel, created_at DESC);
