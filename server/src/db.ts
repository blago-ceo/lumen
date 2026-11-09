import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'lumen.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,           -- Telegram user id
  username     TEXT,
  first_name   TEXT,
  nickname     TEXT UNIQUE COLLATE NOCASE,
  avatar_url   TEXT,
  ring         TEXT NOT NULL DEFAULT 'aurora', -- стиль обводки аватара
  theme        TEXT NOT NULL DEFAULT 'violet', -- акцент оформления профиля
  banner       TEXT NOT NULL DEFAULT 'nebula', -- фон шапки профиля
  bio          TEXT NOT NULL DEFAULT '',
  status_emoji TEXT NOT NULL DEFAULT '',
  notify       INTEGER NOT NULL DEFAULT 1,     -- пуши о новых лидах в бота
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  charge_id  TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  charge_id  TEXT UNIQUE,
  amount     INTEGER NOT NULL,
  currency   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,              -- platform:extId
  platform     TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  budget_text  TEXT,
  budget_value INTEGER,
  url          TEXT NOT NULL,
  author       TEXT,
  author_url   TEXT,
  contact      TEXT,
  category     TEXT,
  source       TEXT,                          -- канал / категория / аккаунт
  owner_id     INTEGER,                       -- лид из привязанного аккаунта виден только владельцу
  score        INTEGER NOT NULL DEFAULT 0,
  is_landing   INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL,
  fetched_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_pub ON leads(published_at DESC);
CREATE INDEX IF NOT EXISTS leads_platform ON leads(platform, published_at DESC);

CREATE TABLE IF NOT EXISTS lead_state (
  user_id INTEGER NOT NULL,
  lead_id TEXT NOT NULL,
  saved   INTEGER NOT NULL DEFAULT 0,
  hidden  INTEGER NOT NULL DEFAULT 0,
  seen    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, lead_id)
);

CREATE TABLE IF NOT EXISTS linked_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  handle      TEXT NOT NULL,
  profile_url TEXT,
  session_enc TEXT,                           -- зашифрованная сессия (AES-256-GCM)
  status      TEXT NOT NULL DEFAULT 'active', -- active | pending | error
  meta        TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, platform, handle)
);

CREATE TABLE IF NOT EXISTS tg_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,                         -- NULL = глобальный канал парсера
  account_id INTEGER,                         -- для чатов из привязанного аккаунта
  ref        TEXT NOT NULL,                   -- @username или id диалога
  title      TEXT,
  enabled    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, account_id, ref)
);

CREATE TABLE IF NOT EXISTS platform_state (
  platform   TEXT PRIMARY KEY,
  last_run   INTEGER,
  last_ok    INTEGER,
  last_error TEXT,
  items      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,                   -- pending | accepted
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL,                   -- direct | group | support
  title      TEXT,
  emoji      TEXT,
  owner_id   INTEGER,
  direct_key TEXT UNIQUE,                     -- "minId:maxId" для личных чатов
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  last_read_id    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL,
  text            TEXT NOT NULL DEFAULT '',
  kind            TEXT NOT NULL DEFAULT 'text', -- text | lead | system
  payload         TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, id DESC);
`);

export type Row = Record<string, any>;

export const q = {
  get: <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).get(...p) as T | undefined,
  all: <T = Row>(sql: string, ...p: any[]) => db.prepare(sql).all(...p) as T[],
  run: (sql: string, ...p: any[]) => db.prepare(sql).run(...p),
};

export const now = () => Date.now();

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/* ───────── миграции (добавляем колонки к уже созданной БД) ───────── */
function addCol(table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
// профиль в стиле Discord
addCol('users', 'banner_url', 'TEXT');                       // картинка/GIF на фон профиля
addCol('users', 'banner_grad', "TEXT NOT NULL DEFAULT ''");  // "#hex,#hex" — градиент фона
addCol('users', 'nick_grad', "TEXT NOT NULL DEFAULT ''");    // "#hex,#hex" — градиент ника
addCol('users', 'nick_font', "TEXT NOT NULL DEFAULT 'manrope'");
addCol('users', 'presence', "TEXT NOT NULL DEFAULT 'online'"); // online | idle | dnd | invisible
addCol('users', 'custom_status', "TEXT NOT NULL DEFAULT ''");
addCol('users', 'ai_persona', "TEXT NOT NULL DEFAULT ''");   // инструкция для ИИ-откликов
// типы заказов для фильтров
addCol('leads', 'is_design', 'INTEGER');
addCol('leads', 'is_dev', 'INTEGER');

db.exec(`
CREATE TABLE IF NOT EXISTS responses (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'queued', -- queued | generating | ready | sent | failed
  text       TEXT NOT NULL DEFAULT '',
  channel    TEXT,                           -- telegram | manual
  error      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lead_id)
);
`);
