# NanoClaw 핵심 코드 레퍼런스

이 문서는 CLAUDE.md에 명시된 NanoClaw의 핵심 소스 파일 9개를 한국어 주석과 함께 정리한 것입니다. `types.ts`는 CLAUDE.md의 Key Files 테이블에는 없지만, 모든 핵심 파일이 참조하는 타입 정의 파일이므로 함께 포함했습니다. 각 파일의 원본 코드를 그대로 수록하되, 한국어 주석을 통해 코드의 동작과 설계 의도를 설명합니다.

---
## 1. src/config.ts — 전역 설정 및 환경 변수 로딩

### 역할
프로젝트 전체에서 사용되는 상수, 경로, 타임아웃, 트리거 패턴 등을 정의합니다.
`.env` 파일에서 비밀이 아닌 설정값만 읽어오며, API 키 등 민감 정보는 credential proxy가 별도로 관리합니다.

### 코드

```typescript
// [Lines 1-2] Node.js 내장 모듈 import — OS 정보와 경로 처리용
import os from 'os';
import path from 'path';

// [Line 4] .env 파일 읽기 유틸리티 import
import { readEnvFile } from './env.js';

// [Lines 6-9] .env에서 설정값 읽기 — 비밀 키(API 키, 토큰)는 여기서 읽지 않음
// 비밀 값은 credential-proxy.ts에서만 로딩하여 컨테이너에 노출되지 않도록 함
const envConfig = readEnvFile(['ASSISTANT_NAME', 'ASSISTANT_HAS_OWN_NUMBER']);

// [Lines 11-13] 어시스턴트 이름 설정 — 환경변수 > .env > 기본값 'Andy' 순으로 결정
export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
// [Lines 14-16] 어시스턴트 전용 전화번호 보유 여부 (WhatsApp 등에서 사용)
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
// [Line 17] 메시지 폴링 간격 (2초마다 새 메시지 확인)
export const POLL_INTERVAL = 2000;
// [Line 18] 스케줄러 폴링 간격 (1분마다 예약 작업 확인)
export const SCHEDULER_POLL_INTERVAL = 60000;

// [Lines 20-22] 컨테이너 마운트에 필요한 절대 경로 계산
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// [Lines 24-28] 마운트 보안: 허용 목록은 프로젝트 루트 바깥에 저장하여
// 컨테이너 내부에서 변조할 수 없도록 함
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
// [Lines 29-34] 발신자 허용 목록 경로 — 마찬가지로 프로젝트 외부에 저장
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'sender-allowlist.json',
);
// [Lines 35-37] 주요 데이터 디렉토리 경로
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

// [Lines 39-41] 컨테이너 이미지 이름 — 환경변수로 오버라이드 가능
export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
// [Lines 42-44] 컨테이너 실행 타임아웃 (기본 30분)
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
// [Lines 45-48] 컨테이너 최대 출력 크기 (기본 10MB) — 메모리 폭주 방지
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
// [Lines 49-52] 자격 증명 프록시 포트 — 컨테이너가 API 호출 시 이 포트를 경유
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
// [Line 53] IPC 파일 감시 간격 (1초)
export const IPC_POLL_INTERVAL = 1000;
// [Line 54] 유휴 타임아웃 (기본 30분) — 마지막 결과 이후 컨테이너 유지 시간
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
// [Lines 55-58] 동시 실행 가능한 최대 컨테이너 수 (최소 1, 기본 5)
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

// [Lines 60-62] 정규식 특수문자 이스케이프 — 어시스턴트 이름에 특수문자가 있을 경우 대비
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [Lines 64-67] 트리거 패턴 — "@어시스턴트이름"으로 시작하는 메시지를 감지 (대소문자 무시)
export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// [Lines 69-72] 스케줄 작업에 사용할 시간대 — 시스템 기본 시간대 사용
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
```
## 2. src/types.ts — 핵심 타입 및 인터페이스 정의

### 역할
프로젝트 전체에서 사용되는 TypeScript 인터페이스와 타입을 정의합니다.
마운트 보안, 컨테이너 설정, 그룹 등록, 메시지, 스케줄 작업, 채널 추상화 등의 구조를 포함합니다.

### 코드

```typescript
// [Lines 1-4] 추가 마운트 설정 — 호스트 디렉토리를 컨테이너에 마운트할 때 사용
export interface AdditionalMount {
  hostPath: string; // Absolute path on host (supports ~ for home)
  containerPath?: string; // Optional — defaults to basename of hostPath. Mounted at /workspace/extra/{value}
  readonly?: boolean; // Default: true for safety
}

// [Lines 6-11] 마운트 허용 목록 — ~/.config/nanoclaw/에 저장되어 컨테이너에서 변조 불가
/**
 * Mount Allowlist - Security configuration for additional mounts
 * This file should be stored at ~/.config/nanoclaw/mount-allowlist.json
 * and is NOT mounted into any container, making it tamper-proof from agents.
 */
export interface MountAllowlist {
  // [Line 13] 컨테이너에 마운트 가능한 디렉토리 목록
  allowedRoots: AllowedRoot[];
  // [Line 15] 절대 마운트 금지 경로 패턴 (예: ".ssh", ".gnupg")
  blockedPatterns: string[];
  // [Line 17] true이면 main이 아닌 그룹은 항상 읽기 전용으로만 마운트
  nonMainReadOnly: boolean;
}

// [Lines 20-27] 허용된 루트 디렉토리 하나의 설정
export interface AllowedRoot {
  path: string; // 절대 경로 또는 ~ (예: "~/projects", "/var/repos")
  allowReadWrite: boolean; // 읽기-쓰기 마운트 허용 여부
  description?: string; // 문서화용 설명 (선택)
}

// [Lines 29-32] 컨테이너 설정 — 그룹별로 추가 마운트와 타임아웃 지정 가능
export interface ContainerConfig {
  additionalMounts?: AdditionalMount[];
  timeout?: number; // Default: 300000 (5 minutes)
}

// [Lines 34-43] 등록된 그룹 — 채팅방/채널을 NanoClaw에 등록할 때의 메타데이터
export interface RegisteredGroup {
  name: string;
  folder: string; // 그룹 데이터를 저장할 폴더명
  trigger: string; // 트리거 패턴
  added_at: string; // 등록 시각
  containerConfig?: ContainerConfig;
  requiresTrigger?: boolean; // 기본값: 그룹=true, 1:1 채팅=false
  isMain?: boolean; // 메인 컨트롤 그룹 여부 (트리거 불필요, 상위 권한)
}

// [Lines 45-54] 수신 메시지 구조체 — 모든 채널에서 공통으로 사용
export interface NewMessage {
  id: string;
  chat_jid: string; // 채팅방 고유 식별자
  sender: string; // 발신자 ID
  sender_name: string; // 발신자 표시 이름
  content: string; // 메시지 본문
  timestamp: string; // ISO 8601 타임스탬프
  is_from_me?: boolean; // 내가 보낸 메시지 여부
  is_bot_message?: boolean; // 봇이 보낸 메시지 여부
}

// [Lines 56-68] 예약 작업 — cron, interval, once 타입의 스케줄 작업
export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string; // 에이전트에게 보낼 프롬프트
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string; // cron 표현식, 밀리초, 또는 ISO 타임스탬프
  context_mode: 'group' | 'isolated'; // 그룹 세션 공유 또는 독립 실행
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

// [Lines 70-77] 작업 실행 로그 — 각 작업 실행의 결과를 기록
export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

// [Line 79] === 채널 추상화 ===

// [Lines 81-95] 채널 인터페이스 — 모든 메시징 플랫폼이 구현해야 하는 공통 인터페이스
export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean; // 이 채널이 해당 JID를 소유하는지 확인
  disconnect(): Promise<void>;
  // 선택: 타이핑 표시 지원
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  // 선택: 파일 전송 (이미지, 문서, 동영상 등)
  sendFile?(jid: string, filePath: string, caption?: string): Promise<void>;
  // 선택: 플랫폼에서 그룹/채팅 이름 동기화
  syncGroups?(force: boolean): Promise<void>;
}

// [Line 97] 채널이 수신 메시지를 전달할 때 사용하는 콜백 타입
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;

// [Lines 99-107] 채팅 메타데이터 발견 시 콜백
// name은 선택 — Telegram처럼 인라인으로 이름을 전달하는 채널은 여기서 전달하고,
// 별도 syncGroups로 이름을 동기화하는 채널은 생략
export type OnChatMetadata = (
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
) => void;
```
## 3. src/db.ts — SQLite 데이터베이스 스키마 및 CRUD 연산

### 역할
SQLite(better-sqlite3)를 사용하여 채팅, 메시지, 예약 작업, 라우터 상태, 세션, 등록된 그룹 데이터를 관리합니다.
스키마 마이그레이션과 기존 JSON 파일에서의 데이터 이전도 처리합니다.

### 코드

```typescript
// [Lines 1-3] 외부 모듈 import — SQLite, 파일 시스템, 경로 처리
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// [Lines 5-13] 내부 모듈 import — 설정, 유틸리티, 타입
import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import {
  NewMessage,
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
} from './types.js';

// [Line 15] 모듈 수준 DB 인스턴스 — 한 번 초기화 후 전체에서 공유
let db: Database.Database;

// [Lines 17-85] 데이터베이스 스키마 생성 — 모든 핵심 테이블과 인덱스 정의
function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
  `);

  // [Lines 87-94] 마이그레이션: context_mode 컬럼 추가 (기존 DB 호환)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // [Lines 96-107] 마이그레이션: is_bot_message 컬럼 추가 및 기존 봇 메시지 백필
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // 기존 봇 메시지를 콘텐츠 접두사 패턴으로 식별하여 백필
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // [Lines 109-120] 마이그레이션: is_main 컬럼 추가 — 폴더명이 'main'인 그룹을 메인으로 설정
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // [Lines 122-141] 마이그레이션: channel, is_group 컬럼 추가 — JID 패턴으로 채널 유형 백필
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // WhatsApp 그룹(@g.us), WhatsApp 개인(@s.whatsapp.net), Discord(dc:), Telegram(tg:)
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 1 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }
}

// [Lines 144-153] DB 초기화 — store/ 디렉토리에 SQLite 파일 생성, 스키마 적용, JSON 마이그레이션
export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();
}

// [Lines 155-159] 테스트 전용 — 인메모리 DB로 초기화
/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): void {
  db = new Database(':memory:');
  createSchema(db);
}

// [Lines 161-199] 채팅 메타데이터 저장 — 메시지 내용 없이 채팅방 정보만 기록
// 모든 채팅에 대해 그룹 탐색용으로 사용 (민감한 내용은 저장하지 않음)
/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // 이름과 함께 업데이트 — 기존 타임스탬프가 더 최신이면 유지
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // 타임스탬프만 업데이트 — 기존 이름이 있으면 유지
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

// [Lines 201-213] 채팅 이름 업데이트 — 타임스탬프 변경 없이 이름만 갱신 (그룹 메타데이터 동기화용)
/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

// [Lines 215-221] 채팅 정보 인터페이스
export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

// [Lines 223-236] 모든 채팅 조회 — 최근 활동순으로 정렬
/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

// [Lines 238-257] 그룹 메타데이터 동기화 시각 관리
// 특수 JID '__group_sync__'를 사용하여 마지막 동기화 시각 저장
/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

// [Lines 259-276] 메시지 저장 — 등록된 그룹에서만 호출 (메시지 이력이 필요한 경우)
/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

// [Lines 278-303] 메시지 직접 저장 — 위와 동일하지만 raw 객체를 받음
/**
 * Store a message directly.
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

// [Lines 305-339] 새 메시지 조회 — 여러 JID에서 특정 시각 이후의 메시지를 가져옴
// 봇 메시지는 is_bot_message 플래그와 콘텐츠 접두사 양쪽으로 필터링
// 서브쿼리로 최근 N개를 가져온 후 시간순으로 재정렬
export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
  limit: number = 200,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
      FROM messages
      WHERE timestamp > ? AND chat_jid IN (${placeholders})
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`, limit) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

// [Lines 341-364] 특정 채팅의 메시지 조회 — 단일 채팅방에서 특정 시각 이후 메시지 가져오기
export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
  limit: number = 200,
): NewMessage[] {
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me
      FROM messages
      WHERE chat_jid = ? AND timestamp > ?
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;
  return db
    .prepare(sql)
    .all(chatJid, sinceTimestamp, `${botPrefix}:%`, limit) as NewMessage[];
}

// [Lines 366-386] 예약 작업 생성
export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

// [Lines 388-392] ID로 작업 조회
export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

// [Lines 394-400] 특정 그룹의 모든 작업 조회 (생성일 역순)
export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

// [Lines 402-406] 전체 작업 조회
export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

// [Lines 408-447] 작업 부분 업데이트 — 변경된 필드만 동적으로 UPDATE
export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      'prompt' | 'schedule_type' | 'schedule_value' | 'next_run' | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

// [Lines 449-453] 작업 삭제 — 외래 키 제약 때문에 자식 레코드(실행 로그)부터 삭제
export function deleteTask(id: string): void {
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

// [Lines 455-466] 실행 대기 중인 작업 조회 — 현재 시각보다 next_run이 이전인 활성 작업
export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

// [Lines 468-481] 작업 실행 후 상태 업데이트 — 다음 실행 시각 설정, 일회성이면 completed로 변경
export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

// [Lines 483-497] 작업 실행 로그 기록
export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

// [Lines 499-512] 라우터 상태 접근자 — 폴링 커서 등 키-값 저장소
export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// [Lines 514-538] 세션 접근자 — 그룹별 Claude 세션 ID 관리
export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// [Lines 540-635] 등록된 그룹 접근자 — JID로 조회, 전체 조회, 그룹 등록
// DB에서 읽을 때 container_config JSON 파싱, 유효하지 않은 폴더명 검증 포함
export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    containerConfig: row.container_config
      ? JSON.parse(row.container_config)
      : undefined,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.containerConfig ? JSON.stringify(group.containerConfig) : null,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
    group.isMain ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db.prepare('SELECT * FROM registered_groups').all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      containerConfig: row.container_config
        ? JSON.parse(row.container_config)
        : undefined,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}

// [Lines 637-697] JSON 마이그레이션 — 이전 버전의 JSON 파일 데이터를 SQLite로 이전
// router_state.json, sessions.json, registered_groups.json을 읽어서 DB에 저장 후 .migrated로 이름 변경
function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // 라우터 상태 마이그레이션
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // 세션 마이그레이션
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // 등록된 그룹 마이그레이션
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}
```
## 4. src/router.ts — 메시지 포매팅 및 아웃바운드 라우팅

### 역할
수신 메시지를 에이전트가 읽을 수 있는 XML 형식으로 변환하고, 에이전트의 응답에서 내부 태그를 제거한 뒤
적절한 채널로 발송합니다.

### 코드

```typescript
// [Lines 1-2] 타입과 시간대 변환 유틸리티 import
import { Channel, NewMessage } from './types.js';
import { formatLocalTime } from './timezone.js';

// [Lines 4-11] XML 특수문자 이스케이프 — 메시지 내용을 XML 안전하게 변환
export function escapeXml(s: string): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// [Lines 13-26] 메시지 배열을 XML 형식으로 변환 — 에이전트에게 전달할 구조화된 입력 생성
// 시간대 컨텍스트와 함께 각 메시지를 <message> 태그로 감싸서 반환
export function formatMessages(
  messages: NewMessage[],
  timezone: string,
): string {
  const lines = messages.map((m) => {
    const displayTime = formatLocalTime(m.timestamp, timezone);
    return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}">${escapeXml(m.content)}</message>`;
  });

  const header = `<context timezone="${escapeXml(timezone)}" />\n`;

  return `${header}<messages>\n${lines.join('\n')}\n</messages>`;
}

// [Lines 28-30] 내부 태그 제거 — 에이전트의 내부 추론 블록(<internal>)을 사용자에게 보이지 않게 제거
export function stripInternalTags(text: string): string {
  return text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
}

// [Lines 32-36] 아웃바운드 포매팅 — 내부 태그를 제거한 최종 사용자 메시지 생성
export function formatOutbound(rawText: string): string {
  const text = stripInternalTags(rawText);
  if (!text) return '';
  return text;
}

// [Lines 38-44] 아웃바운드 라우팅 — JID를 소유한 연결된 채널을 찾아 메시지 전송
export function routeOutbound(
  channels: Channel[],
  jid: string,
  text: string,
): Promise<void> {
  const channel = channels.find((c) => c.ownsJid(jid) && c.isConnected());
  if (!channel) throw new Error(`No channel for JID: ${jid}`);
  return channel.sendMessage(jid, text);
}

// [Lines 46-53] 채널 탐색 — 특정 JID를 소유한 채널 인스턴스 반환
export function findChannel(
  channels: Channel[],
  jid: string,
): Channel | undefined {
  return channels.find((c) => c.ownsJid(jid));
}
```
## 5. src/channels/registry.ts — 채널 등록 레지스트리

### 역할
채널(WhatsApp, Telegram, Slack 등)의 팩토리 함수를 Map에 등록하고 조회하는 레지스트리입니다.
각 채널 모듈이 startup 시 자체 등록(self-registration)하는 패턴을 사용합니다.

### 코드

```typescript
// [Lines 1-6] 타입 import — 채널 인터페이스, 콜백 타입, 그룹 정보
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';

// [Lines 8-12] 채널 옵션 인터페이스 — 팩토리 함수에 전달되는 의존성
export interface ChannelOpts {
  onMessage: OnInboundMessage; // 수신 메시지 콜백
  onChatMetadata: OnChatMetadata; // 채팅 메타데이터 콜백
  registeredGroups: () => Record<string, RegisteredGroup>; // 등록된 그룹 조회 함수
}

// [Line 14] 채널 팩토리 타입 — 옵션을 받아 Channel을 생성하거나, 인증 정보 없으면 null 반환
export type ChannelFactory = (opts: ChannelOpts) => Channel | null;

// [Line 16] 채널 레지스트리 — 이름 -> 팩토리 함수 매핑
const registry = new Map<string, ChannelFactory>();

// [Lines 18-20] 채널 등록 — 각 채널 모듈이 startup 시 호출
export function registerChannel(name: string, factory: ChannelFactory): void {
  registry.set(name, factory);
}

// [Lines 22-24] 팩토리 조회 — 이름으로 등록된 팩토리 함수 반환
export function getChannelFactory(name: string): ChannelFactory | undefined {
  return registry.get(name);
}

// [Lines 26-28] 등록된 채널 이름 목록 반환
export function getRegisteredChannelNames(): string[] {
  return [...registry.keys()];
}
```
## 6. src/ipc.ts — IPC 감시자 및 작업 처리

### 역할
컨테이너 에이전트와 호스트 프로세스 간의 통신(IPC)을 파일 시스템 기반으로 처리합니다.
각 그룹별 네임스페이스로 격리된 IPC 디렉토리를 폴링하며, 메시지 전송, 파일 전송,
작업 스케줄링, 그룹 등록 등의 요청을 처리합니다.

### 코드

```typescript
// [Lines 1-2] 파일 시스템 및 경로 모듈 import
import fs from 'fs';
import path from 'path';

// [Line 4] cron 표현식 파서 — 스케줄 작업의 다음 실행 시각 계산용
import { CronExpressionParser } from 'cron-parser';

// [Lines 6-11] 내부 모듈 import — 설정, 컨테이너, DB, 유틸리티, 타입
import { DATA_DIR, IPC_POLL_INTERVAL, TIMEZONE } from './config.js';
import { AvailableGroup } from './container-runner.js';
import { createTask, deleteTask, getTaskById, updateTask } from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// [Lines 13-26] IPC 의존성 인터페이스 — IPC 처리에 필요한 외부 함수들을 주입받음
export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  sendFile: (jid: string, filePath: string, caption?: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
}

// [Line 28] IPC 감시자 중복 실행 방지 플래그
let ipcWatcherRunning = false;

// [Lines 30-185] IPC 감시자 시작 — 주기적으로 IPC 디렉토리를 스캔하여 요청 처리
export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  // [Line 40] 주기적으로 실행되는 IPC 파일 처리 함수
  const processIpcFiles = async () => {
    // [Lines 41-52] 그룹별 IPC 디렉토리 스캔 — 디렉토리명이 곧 그룹 식별자
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // [Lines 57-60] 폴더 -> isMain 조회 테이블 구축 — 권한 확인에 사용
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
    }

    // [Lines 62-178] 각 그룹의 IPC 디렉토리에서 메시지와 작업 파일 처리
    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      // [Lines 68-146] 메시지 IPC 처리 — message 타입과 send_file 타입 지원
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // [Lines 78-94] 권한 확인: main 그룹은 모든 채팅에 전송 가능,
                // 일반 그룹은 자기 채팅에만 전송 가능
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await deps.sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              } else if (
                data.type === 'send_file' &&
                data.chatJid &&
                data.filePath
              ) {
                // [Lines 100-124] 파일 전송 처리 — 컨테이너 경로를 호스트 경로로 변환
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  const hostPath = (data.filePath as string).replace(
                    /^\/workspace\/ipc\//,
                    path.join(ipcBaseDir, sourceGroup) + '/',
                  );
                  await deps.sendFile(
                    data.chatJid,
                    hostPath,
                    data.caption as string | undefined,
                  );
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup, file: hostPath },
                    'IPC file sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC send_file attempt blocked',
                  );
                }
              }
              // [Line 126] 처리 완료된 IPC 파일 삭제
              fs.unlinkSync(filePath);
            } catch (err) {
              // [Lines 128-138] 에러 발생 시 파일을 errors 디렉토리로 이동
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // [Lines 148-177] 작업(task) IPC 처리 — 스케줄 작업 생성/변경/삭제 등
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // 소스 그룹 정보를 전달하여 권한 확인
              await processTaskIpc(data, sourceGroup, isMain, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }
    }

    // [Line 180] 다음 폴링 예약
    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

// [Lines 187-486] IPC 작업 처리 함수 — 작업 유형별 분기 처리
// schedule_task, pause/resume/cancel/update_task, refresh_groups, register_group 지원
export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // 디렉토리 경로에서 검증된 소스 그룹 식별자
  isMain: boolean, // 디렉토리 경로에서 검증된 메인 그룹 여부
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    // [Lines 213-305] 작업 스케줄링 — cron/interval/once 타입별 다음 실행 시각 계산
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // 권한 확인: main이 아닌 그룹은 자기 그룹에만 작업 스케줄 가능
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        // [Lines 245-279] 타입별 다음 실행 시각 계산
        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const date = new Date(data.schedule_value);
          if (isNaN(date.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = date.toISOString();
        }

        // [Lines 281-304] 작업 ID 생성 및 DB에 저장
        const taskId =
          data.taskId ||
          `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
      }
      break;

    // [Lines 307-323] 작업 일시정지 — 권한 확인 후 status를 'paused'로 변경
    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    // [Lines 325-341] 작업 재개 — 권한 확인 후 status를 'active'로 변경
    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    // [Lines 343-359] 작업 취소 — 권한 확인 후 작업과 실행 로그 삭제
    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    // [Lines 361-423] 작업 업데이트 — 프롬프트, 스케줄 타입/값 변경 및 next_run 재계산
    case 'update_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (!task) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Task not found for update',
          );
          break;
        }
        if (!isMain && task.group_folder !== sourceGroup) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task update attempt',
          );
          break;
        }

        const updates: Parameters<typeof updateTask>[1] = {};
        if (data.prompt !== undefined) updates.prompt = data.prompt;
        if (data.schedule_type !== undefined)
          updates.schedule_type = data.schedule_type as
            | 'cron'
            | 'interval'
            | 'once';
        if (data.schedule_value !== undefined)
          updates.schedule_value = data.schedule_value;

        // 스케줄이 변경되면 next_run 재계산
        if (data.schedule_type || data.schedule_value) {
          const updatedTask = {
            ...task,
            ...updates,
          };
          if (updatedTask.schedule_type === 'cron') {
            try {
              const interval = CronExpressionParser.parse(
                updatedTask.schedule_value,
                { tz: TIMEZONE },
              );
              updates.next_run = interval.next().toISOString();
            } catch {
              logger.warn(
                { taskId: data.taskId, value: updatedTask.schedule_value },
                'Invalid cron in task update',
              );
              break;
            }
          } else if (updatedTask.schedule_type === 'interval') {
            const ms = parseInt(updatedTask.schedule_value, 10);
            if (!isNaN(ms) && ms > 0) {
              updates.next_run = new Date(Date.now() + ms).toISOString();
            }
          }
        }

        updateTask(data.taskId, updates);
        logger.info(
          { taskId: data.taskId, sourceGroup, updates },
          'Task updated via IPC',
        );
      }
      break;

    // [Lines 425-447] 그룹 새로고침 — main 그룹만 가능, 채널 메타데이터 재동기화
    case 'refresh_groups':
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    // [Lines 449-481] 그룹 등록 — main 그룹만 새 그룹 등록 가능
    // 보안: 에이전트가 IPC를 통해 isMain을 설정할 수 없도록 방어
    case 'register_group':
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // 심층 방어: 에이전트가 IPC를 통해 isMain을 설정할 수 없음
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    // [Lines 483-485] 알 수 없는 IPC 작업 유형 경고
    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
```
## 7. src/task-scheduler.ts — 예약 작업 스케줄러

### 역할
cron, interval, once 타입의 예약 작업을 주기적으로 폴링하여 실행합니다.
각 작업은 컨테이너 에이전트를 통해 실행되며, 결과를 채팅에 전송하고 다음 실행 시각을 계산합니다.
interval 작업의 누적 시간 드리프트를 방지하는 앵커 기반 계산을 사용합니다.

### 코드

```typescript
// [Lines 1-3] Node.js 및 외부 모듈 import
import { ChildProcess } from 'child_process';
import { CronExpressionParser } from 'cron-parser';
import fs from 'fs';

// [Lines 5-22] 내부 모듈 import — 설정, 컨테이너 실행, DB, 큐, 로거, 타입
import { ASSISTANT_NAME, SCHEDULER_POLL_INTERVAL, TIMEZONE } from './config.js';
import {
  ContainerOutput,
  runContainerAgent,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  getAllTasks,
  getDueTasks,
  getTaskById,
  logTaskRun,
  updateTask,
  updateTaskAfterRun,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup, ScheduledTask } from './types.js';

// [Lines 24-63] 다음 실행 시각 계산 — 예약된 시각 기준으로 계산하여 누적 드리프트 방지
// once: null 반환 (완료 처리), cron: 파서로 다음 시각 계산, interval: 앵커 기반 계산
/**
 * Compute the next run time for a recurring task, anchored to the
 * task's scheduled time rather than Date.now() to prevent cumulative
 * drift on interval-based tasks.
 *
 * Co-authored-by: @community-pr-601
 */
export function computeNextRun(task: ScheduledTask): string | null {
  if (task.schedule_type === 'once') return null;

  const now = Date.now();

  if (task.schedule_type === 'cron') {
    const interval = CronExpressionParser.parse(task.schedule_value, {
      tz: TIMEZONE,
    });
    return interval.next().toISOString();
  }

  if (task.schedule_type === 'interval') {
    const ms = parseInt(task.schedule_value, 10);
    if (!ms || ms <= 0) {
      // 잘못된 interval 값으로 무한 루프 방지 — 1분 뒤로 설정
      logger.warn(
        { taskId: task.id, value: task.schedule_value },
        'Invalid interval value',
      );
      return new Date(now + 60_000).toISOString();
    }
    // 예약된 시각 기준으로 계산하여 드리프트 방지
    // 놓친 interval은 건너뛰어 항상 미래 시점으로 설정
    let next = new Date(task.next_run!).getTime() + ms;
    while (next <= now) {
      next += ms;
    }
    return new Date(next).toISOString();
  }

  return null;
}

// [Lines 65-76] 스케줄러 의존성 인터페이스 — 외부 함수 주입
export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onProcess: (
    groupJid: string,
    proc: ChildProcess,
    containerName: string,
    groupFolder: string,
  ) => void;
  sendMessage: (jid: string, text: string) => Promise<void>;
}

// [Lines 78-239] 작업 실행 함수 — 컨테이너 에이전트를 통해 작업 실행 후 결과 기록
async function runTask(
  task: ScheduledTask,
  deps: SchedulerDependencies,
): Promise<void> {
  const startTime = Date.now();
  // [Lines 83-103] 그룹 폴더 경로 검증 — 잘못된 경로면 작업 일시정지
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(task.group_folder);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    updateTask(task.id, { status: 'paused' });
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder, error },
      'Task has invalid group folder',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error,
    });
    return;
  }
  fs.mkdirSync(groupDir, { recursive: true });

  logger.info(
    { taskId: task.id, group: task.group_folder },
    'Running scheduled task',
  );

  // [Lines 111-130] 대상 그룹 조회 — 등록된 그룹에서 폴더명으로 검색
  const groups = deps.registeredGroups();
  const group = Object.values(groups).find(
    (g) => g.folder === task.group_folder,
  );

  if (!group) {
    logger.error(
      { taskId: task.id, groupFolder: task.group_folder },
      'Group not found for task',
    );
    logTaskRun({
      task_id: task.id,
      run_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      status: 'error',
      result: null,
      error: `Group not found: ${task.group_folder}`,
    });
    return;
  }

  // [Lines 132-147] 컨테이너가 읽을 수 있도록 작업 스냅샷 파일 작성
  const isMain = group.isMain === true;
  const tasks = getAllTasks();
  writeTasksSnapshot(
    task.group_folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  let result: string | null = null;
  let error: string | null = null;

  // [Lines 153-155] 그룹 컨텍스트 모드일 때 기존 세션 사용
  const sessions = deps.getSessions();
  const sessionId =
    task.context_mode === 'group' ? sessions[task.group_folder] : undefined;

  // [Lines 157-169] 작업 완료 후 빠른 컨테이너 종료 — 단일 턴이므로 유휴 타임아웃 대기 불필요
  const TASK_CLOSE_DELAY_MS = 10000;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleClose = () => {
    if (closeTimer) return;
    closeTimer = setTimeout(() => {
      logger.debug({ taskId: task.id }, 'Closing task container after result');
      deps.queue.closeStdin(task.chat_jid);
    }, TASK_CLOSE_DELAY_MS);
  };

  // [Lines 171-219] 컨테이너 에이전트 실행 — 스트리밍 콜백으로 실시간 결과 처리
  try {
    const output = await runContainerAgent(
      group,
      {
        prompt: task.prompt,
        sessionId,
        groupFolder: task.group_folder,
        chatJid: task.chat_jid,
        isMain,
        isScheduledTask: true,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) =>
        deps.onProcess(task.chat_jid, proc, containerName, task.group_folder),
      async (streamedOutput: ContainerOutput) => {
        if (streamedOutput.result) {
          result = streamedOutput.result;
          // 결과를 사용자에게 즉시 전달
          await deps.sendMessage(task.chat_jid, streamedOutput.result);
          scheduleClose();
        }
        if (streamedOutput.status === 'success') {
          deps.queue.notifyIdle(task.chat_jid);
          scheduleClose(); // IPC 전용 작업(결과 null)도 즉시 종료
        }
        if (streamedOutput.status === 'error') {
          error = streamedOutput.error || 'Unknown error';
        }
      },
    );

    if (closeTimer) clearTimeout(closeTimer);

    if (output.status === 'error') {
      error = output.error || 'Unknown error';
    } else if (output.result) {
      // 스트리밍 콜백에서 이미 사용자에게 전달됨
      result = output.result;
    }

    logger.info(
      { taskId: task.id, durationMs: Date.now() - startTime },
      'Task completed',
    );
  } catch (err) {
    if (closeTimer) clearTimeout(closeTimer);
    error = err instanceof Error ? err.message : String(err);
    logger.error({ taskId: task.id, error }, 'Task failed');
  }

  // [Lines 221-238] 실행 로그 기록 및 다음 실행 시각 업데이트
  const durationMs = Date.now() - startTime;

  logTaskRun({
    task_id: task.id,
    run_at: new Date().toISOString(),
    duration_ms: durationMs,
    status: error ? 'error' : 'success',
    result,
    error,
  });

  const nextRun = computeNextRun(task);
  const resultSummary = error
    ? `Error: ${error}`
    : result
      ? result.slice(0, 200)
      : 'Completed';
  updateTaskAfterRun(task.id, nextRun, resultSummary);
}

// [Line 241] 스케줄러 중복 실행 방지 플래그
let schedulerRunning = false;

// [Lines 243-277] 스케줄러 루프 시작 — 주기적으로 실행 대기 작업을 확인하여 큐에 등록
export function startSchedulerLoop(deps: SchedulerDependencies): void {
  if (schedulerRunning) {
    logger.debug('Scheduler loop already running, skipping duplicate start');
    return;
  }
  schedulerRunning = true;
  logger.info('Scheduler loop started');

  const loop = async () => {
    try {
      const dueTasks = getDueTasks();
      if (dueTasks.length > 0) {
        logger.info({ count: dueTasks.length }, 'Found due tasks');
      }

      for (const task of dueTasks) {
        // 실행 직전에 상태 재확인 — 일시정지/취소되었을 수 있음
        const currentTask = getTaskById(task.id);
        if (!currentTask || currentTask.status !== 'active') {
          continue;
        }

        // GroupQueue에 작업 등록 — 그룹별 직렬화된 실행 보장
        deps.queue.enqueueTask(currentTask.chat_jid, currentTask.id, () =>
          runTask(currentTask, deps),
        );
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduler loop');
    }

    setTimeout(loop, SCHEDULER_POLL_INTERVAL);
  };

  loop();
}

// [Lines 279-282] 테스트 전용 리셋 함수
/** @internal - for tests only. */
export function _resetSchedulerLoopForTests(): void {
  schedulerRunning = false;
}
```
## 8. src/container-runner.ts — 컨테이너 에이전트 실행기

### 역할
에이전트 실행을 위한 Docker/Podman 컨테이너를 생성하고 관리합니다.
그룹별 볼륨 마운트 구성, 보안 격리(읽기 전용 마운트, .env 차단), 자격 증명 프록시 연동,
스트리밍 출력 파싱, 타임아웃 관리를 담당합니다.

### 코드

```typescript
// [Lines 1-4] 모듈 설명 주석과 Node.js 모듈 import
/**
 * Container Runner for NanoClaw
 * Spawns agent execution in containers and handles IPC
 */
import { ChildProcess, exec, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// [Lines 9-18] 설정값 import — 컨테이너 이미지, 타임아웃, 크기 제한 등
import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  CREDENTIAL_PROXY_PORT,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  TIMEZONE,
} from './config.js';
// [Lines 19-30] 내부 모듈 import — 그룹 경로, 로거, 컨테이너 런타임, 인증, 마운트 보안, 타입
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import {
  CONTAINER_HOST_GATEWAY,
  CONTAINER_RUNTIME_BIN,
  hostGatewayArgs,
  readonlyMountArgs,
  stopContainer,
} from './container-runtime.js';
import { detectAuthMode } from './credential-proxy.js';
import { validateAdditionalMounts } from './mount-security.js';
import { RegisteredGroup } from './types.js';

// [Lines 32-34] 출력 파싱용 센티널 마커 — agent-runner와 동일한 값 사용
const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

// [Lines 36-44] 컨테이너 입력 인터페이스 — 에이전트에게 전달할 정보
export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

// [Lines 46-51] 컨테이너 출력 인터페이스 — 에이전트 실행 결과
export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

// [Lines 53-57] 볼륨 마운트 내부 인터페이스
interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

// [Lines 59-214] 볼륨 마운트 구성 — 그룹 유형(main/일반)에 따라 다른 마운트 전략
function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);

  // [Lines 67-113] main 그룹: 프로젝트 루트를 읽기 전용으로, .env는 /dev/null로 섀도잉
  // 일반 그룹: 자기 폴더만 마운트, global 메모리는 읽기 전용
  if (isMain) {
    // 프로젝트 루트 읽기 전용 — 에이전트가 호스트 코드 수정 방지
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // .env 파일을 /dev/null로 섀도잉하여 비밀 노출 차단
    const envFile = path.join(projectRoot, '.env');
    if (fs.existsSync(envFile)) {
      mounts.push({
        hostPath: '/dev/null',
        containerPath: '/workspace/project/.env',
        readonly: true,
      });
    }

    // main 그룹 작업 디렉토리
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    // 일반 그룹은 자기 폴더만 접근 가능
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // 전역 메모리 디렉토리 — 일반 그룹은 읽기 전용
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // [Lines 116-164] 그룹별 Claude 세션 디렉토리 — 크로스 그룹 세션 접근 방지
  // 초기 settings.json 생성 (에이전트 팀, 추가 디렉토리, 자동 메모리 활성화)
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.claude',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  const settingsFile = path.join(groupSessionsDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
          },
        },
        null,
        2,
      ) + '\n',
    );
  }

  // [Lines 149-159] container/skills/를 그룹 세션 디렉토리로 동기화
  const skillsSrc = path.join(process.cwd(), 'container', 'skills');
  const skillsDst = path.join(groupSessionsDir, 'skills');
  if (fs.existsSync(skillsSrc)) {
    for (const skillDir of fs.readdirSync(skillsSrc)) {
      const srcDir = path.join(skillsSrc, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(skillsDst, skillDir);
      fs.cpSync(srcDir, dstDir, { recursive: true });
    }
  }
  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  // [Lines 166-177] 그룹별 IPC 네임스페이스 — 크로스 그룹 권한 상승 방지
  const groupIpcDir = resolveGroupIpcPath(group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'files'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // [Lines 179-201] agent-runner 소스를 그룹별로 복사 — 에이전트가 커스터마이즈 가능
  // 다른 그룹에 영향을 주지 않도록 격리
  const agentRunnerSrc = path.join(
    projectRoot,
    'container',
    'agent-runner',
    'src',
  );
  const groupAgentRunnerDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    'agent-runner-src',
  );
  if (!fs.existsSync(groupAgentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
    fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
  }
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: '/app/src',
    readonly: false,
  });

  // [Lines 203-211] 추가 마운트 — 외부 허용 목록으로 검증된 마운트만 허용
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

// [Lines 216-266] 컨테이너 실행 인자 구성 — 환경변수, 마운트, 사용자 ID 설정
function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // 호스트 시간대를 컨테이너에 전달
  args.push('-e', `TZ=${TIMEZONE}`);

  // API 트래픽을 자격 증명 프록시를 통해 라우팅 (컨테이너는 실제 비밀을 볼 수 없음)
  args.push(
    '-e',
    `ANTHROPIC_BASE_URL=http://${CONTAINER_HOST_GATEWAY}:${CREDENTIAL_PROXY_PORT}`,
  );

  // 호스트의 인증 모드를 플레이스홀더 값으로 미러링
  // API 키 모드: SDK가 x-api-key 헤더 전송, 프록시가 실제 키로 교체
  // OAuth 모드: SDK가 플레이스홀더 토큰으로 교환 요청, 프록시가 실제 OAuth 토큰 주입
  const authMode = detectAuthMode();
  if (authMode === 'api-key') {
    args.push('-e', 'ANTHROPIC_API_KEY=placeholder');
  } else {
    args.push('-e', 'CLAUDE_CODE_OAUTH_TOKEN=placeholder');
  }

  // 런타임별 호스트 게이트웨이 해석 인자
  args.push(...hostGatewayArgs());

  // 호스트 사용자로 실행하여 바인드 마운트된 파일 접근 가능하게 함
  // root(uid 0), 컨테이너 node 사용자(uid 1000), getuid 미지원 시 건너뜀
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  // 볼륨 마운트 인자 추가 — 읽기 전용과 읽기-쓰기 분리
  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

// [Lines 268-643] 메인 컨테이너 실행 함수 — 컨테이너 생성, 입력 전달, 출력 스트림 파싱, 타임아웃 관리
export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = resolveGroupFolderPath(group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  // [Lines 279-282] 컨테이너 이름 생성 및 인자 구성
  const mounts = buildVolumeMounts(group, input.isMain);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `nanoclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName);

  logger.debug(
    {
      group: group.name,
      containerName,
      mounts: mounts.map(
        (m) =>
          `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
      ),
      containerArgs: containerArgs.join(' '),
    },
    'Container mount configuration',
  );

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(groupDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // [Lines 310-643] Promise로 컨테이너 라이프사이클 관리
  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    // [Lines 322-323] JSON 입력을 stdin으로 전달 후 종료
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // [Lines 325-379] stdout 스트리밍 출력 파싱 — 센티널 마커 사이의 JSON을 추출
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data) => {
      const chunk = data.toString();

      // 로깅용 축적 — 최대 크기 제한
      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
          logger.warn(
            { group: group.name, size: stdout.length },
            'Container stdout truncated due to size limit',
          );
        } else {
          stdout += chunk;
        }
      }

      // 스트리밍 모드: 출력 마커를 실시간으로 파싱
      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break; // 불완전한 쌍 — 추가 데이터 대기

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            // 활동 감지 — 하드 타임아웃 리셋
            resetTimeout();
            // 모든 마커에 대해 onOutput 호출 (null 결과 포함)
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: group.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    // [Lines 382-402] stderr 처리 — 디버그 로깅, 타임아웃 리셋하지 않음 (SDK 디버그 로그가 지속 출력)
    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
        logger.warn(
          { group: group.name, size: stderr.length },
          'Container stderr truncated due to size limit',
        );
      } else {
        stderr += chunk;
      }
    });

    // [Lines 404-434] 타임아웃 관리 — 하드 타임아웃, 활동 시 리셋, 유예 기간 보장
    let timedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
    // 유예 기간: IDLE_TIMEOUT + 30초 이상이어야 graceful close가 먼저 동작
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error(
        { group: group.name, containerName },
        'Container timeout, stopping gracefully',
      );
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn(
            { group: group.name, containerName, err },
            'Graceful stop failed, force killing',
          );
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    // 스트리밍 출력이 있을 때마다 타임아웃 리셋
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    // [Lines 436-629] 컨테이너 종료 핸들러 — 타임아웃/정상 종료/에러 분기 처리
    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      // [Lines 440-485] 타임아웃 종료 처리 — 출력이 있었으면 idle cleanup (성공), 없었으면 에러
      if (timedOut) {
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const timeoutLog = path.join(logsDir, `container-${ts}.log`);
        fs.writeFileSync(
          timeoutLog,
          [
            `=== Container Run Log (TIMEOUT) ===`,
            `Timestamp: ${new Date().toISOString()}`,
            `Group: ${group.name}`,
            `Container: ${containerName}`,
            `Duration: ${duration}ms`,
            `Exit Code: ${code}`,
            `Had Streaming Output: ${hadStreamingOutput}`,
          ].join('\n'),
        );

        // 출력 후 타임아웃 = idle cleanup (실패가 아님)
        if (hadStreamingOutput) {
          logger.info(
            { group: group.name, containerName, duration, code },
            'Container timed out after output (idle cleanup)',
          );
          outputChain.then(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId,
            });
          });
          return;
        }

        logger.error(
          { group: group.name, containerName, duration, code },
          'Container timed out with no output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      // [Lines 487-540] 정상 종료 시 로그 파일 작성 — verbose 모드나 에러 시 상세 기록
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      const isVerbose =
        process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace';

      const logLines = [
        `=== Container Run Log ===`,
        `Timestamp: ${new Date().toISOString()}`,
        `Group: ${group.name}`,
        `IsMain: ${input.isMain}`,
        `Duration: ${duration}ms`,
        `Exit Code: ${code}`,
        `Stdout Truncated: ${stdoutTruncated}`,
        `Stderr Truncated: ${stderrTruncated}`,
        ``,
      ];

      const isError = code !== 0;

      if (isVerbose || isError) {
        logLines.push(
          `=== Input ===`,
          JSON.stringify(input, null, 2),
          ``,
          `=== Container Args ===`,
          containerArgs.join(' '),
          ``,
          `=== Mounts ===`,
          mounts
            .map(
              (m) =>
                `${m.hostPath} -> ${m.containerPath}${m.readonly ? ' (ro)' : ''}`,
            )
            .join('\n'),
          ``,
          `=== Stderr${stderrTruncated ? ' (TRUNCATED)' : ''} ===`,
          stderr,
          ``,
          `=== Stdout${stdoutTruncated ? ' (TRUNCATED)' : ''} ===`,
          stdout,
        );
      } else {
        logLines.push(
          `=== Input Summary ===`,
          `Prompt length: ${input.prompt.length} chars`,
          `Session ID: ${input.sessionId || 'new'}`,
          ``,
          `=== Mounts ===`,
          mounts
            .map((m) => `${m.containerPath}${m.readonly ? ' (ro)' : ''}`)
            .join('\n'),
          ``,
        );
      }

      fs.writeFileSync(logFile, logLines.join('\n'));
      logger.debug({ logFile, verbose: isVerbose }, 'Container log written');

      // [Lines 545-564] 비정상 종료 처리 — stderr 마지막 200자를 에러 메시지에 포함
      if (code !== 0) {
        logger.error(
          {
            group: group.name,
            code,
            duration,
            stderr,
            stdout,
            logFile,
          },
          'Container exited with error',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr.slice(-200)}`,
        });
        return;
      }

      // [Lines 566-580] 스트리밍 모드 완료 — output chain이 완료될 때까지 대기
      if (onOutput) {
        outputChain.then(() => {
          logger.info(
            { group: group.name, duration, newSessionId },
            'Container completed (streaming mode)',
          );
          resolve({
            status: 'success',
            result: null,
            newSessionId,
          });
        });
        return;
      }

      // [Lines 582-628] 레거시 모드 — 축적된 stdout에서 마지막 출력 마커 쌍을 파싱
      try {
        const startIdx = stdout.indexOf(OUTPUT_START_MARKER);
        const endIdx = stdout.indexOf(OUTPUT_END_MARKER);

        let jsonLine: string;
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          jsonLine = stdout
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
        } else {
          // 폴백: 마지막 비어있지 않은 줄 (하위 호환)
          const lines = stdout.trim().split('\n');
          jsonLine = lines[lines.length - 1];
        }

        const output: ContainerOutput = JSON.parse(jsonLine);

        logger.info(
          {
            group: group.name,
            duration,
            status: output.status,
            hasResult: !!output.result,
          },
          'Container completed',
        );

        resolve(output);
      } catch (err) {
        logger.error(
          {
            group: group.name,
            stdout,
            stderr,
            error: err,
          },
          'Failed to parse container output',
        );

        resolve({
          status: 'error',
          result: null,
          error: `Failed to parse container output: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    });

    // [Lines 631-642] 컨테이너 생성 에러 핸들러
    container.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(
        { group: group.name, containerName, error: err },
        'Container spawn error',
      );
      resolve({
        status: 'error',
        result: null,
        error: `Container spawn error: ${err.message}`,
      });
    });
  });
}

// [Lines 646-670] 작업 스냅샷 작성 — 컨테이너가 읽을 수 있도록 IPC 디렉토리에 현재 작업 목록 저장
// main 그룹은 모든 작업, 일반 그룹은 자기 작업만 볼 수 있음
export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

// [Lines 672-677] 가용 그룹 인터페이스 — 그룹 활성화 UI용
export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

// [Lines 679-709] 가용 그룹 스냅샷 작성 — main 그룹만 모든 가용 그룹을 볼 수 있음
/**
 * Write available groups snapshot for the container to read.
 * Only main group can see all available groups (for activation).
 * Non-main groups only see their own registration status.
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  // main은 모든 그룹 표시, 일반 그룹은 아무것도 표시하지 않음 (활성화 권한 없음)
  const visibleGroups = isMain ? groups : [];

  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
```
## 9. src/index.ts — 메인 오케스트레이터

### 역할
NanoClaw의 진입점이자 오케스트레이터입니다. 데이터베이스 초기화, 채널 연결, 자격 증명 프록시 시작,
메시지 루프, 스케줄러, IPC 감시자를 조율합니다. 메시지 수신 시 트리거 확인, 에이전트 실행,
결과 전송, 세션 관리, 에러 복구를 수행합니다.

### 코드

```typescript
// [Lines 1-2] 파일 시스템 및 경로 모듈 import
import fs from 'fs';
import path from 'path';

// [Lines 4-11] 설정값 import — 어시스턴트 이름, 프록시 포트, 타임아웃, 트리거 패턴 등
import {
  ASSISTANT_NAME,
  CREDENTIAL_PROXY_PORT,
  IDLE_TIMEOUT,
  POLL_INTERVAL,
  TIMEZONE,
  TRIGGER_PATTERN,
} from './config.js';
// [Line 12] 자격 증명 프록시 시작 함수
import { startCredentialProxy } from './credential-proxy.js';
// [Line 13] 채널 배럴 import — 이 import만으로 모든 채널이 레지스트리에 자체 등록됨
import './channels/index.js';
// [Lines 14-17] 채널 레지스트리에서 팩토리 함수 조회
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
// [Lines 18-23] 컨테이너 실행기 import
import {
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
// [Lines 24-28] 컨테이너 런타임 유틸리티
import {
  cleanupOrphans,
  ensureContainerRuntimeRunning,
  PROXY_BIND_HOST,
} from './container-runtime.js';
// [Lines 29-44] DB 연산 import — 채팅, 메시지, 그룹, 세션, 라우터 상태 관리
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRegisteredGroup,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
} from './db.js';
// [Line 45] 그룹별 직렬화 큐 — 동일 그룹의 메시지를 순서대로 처리
import { GroupQueue } from './group-queue.js';
// [Line 46] 그룹 폴더 경로 해석
import { resolveGroupFolderPath } from './group-folder.js';
// [Line 47] IPC 감시자
import { startIpcWatcher } from './ipc.js';
// [Line 48] 라우터 — 메시지 포매팅, 아웃바운드 처리
import { findChannel, formatMessages, formatOutbound } from './router.js';
// [Lines 49-54] 발신자 허용 목록 — 메시지 필터링
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
// [Line 55] 스케줄러
import { startSchedulerLoop } from './task-scheduler.js';
// [Line 56] 타입
import { Channel, NewMessage, RegisteredGroup } from './types.js';
// [Line 57] 로거
import { logger } from './logger.js';

// [Lines 59-60] 리팩토링 중 하위 호환을 위한 re-export
export { escapeXml, formatMessages } from './router.js';

// [Lines 62-66] 모듈 수준 상태 — 메시지 커서, 세션, 등록 그룹, 에이전트 타임스탬프
let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

// [Lines 68-69] 채널 인스턴스 배열과 그룹 큐
const channels: Channel[] = [];
const queue = new GroupQueue();

// [Lines 71-86] 상태 로드 — DB에서 라우터 상태, 세션, 등록 그룹을 읽어옴
function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

// [Lines 88-91] 상태 저장 — 라우터 상태를 DB에 기록
function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

// [Lines 93-115] 그룹 등록 — 폴더 경로 검증 후 DB에 저장하고 디렉토리 생성
function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

// [Lines 117-133] 가용 그룹 목록 생성 — 모든 채팅 중 그룹 채팅을 최근 활동순으로 반환
/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

// [Lines 135-140] 테스트 전용 — 등록 그룹 직접 설정
/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

// [Lines 142-261] 그룹별 메시지 처리 — GroupQueue가 순서대로 호출
// 트리거 확인, 에이전트 실행, 결과 전송, 에러 시 커서 롤백
/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  // lastAgentTimestamp 이후의 미처리 메시지 조회
  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  // main이 아닌 그룹에서 트리거 필수인 경우 확인
  if (!isMainGroup && group.requiresTrigger !== false) {
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = missedMessages.some(
      (m) =>
        TRIGGER_PATTERN.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages, TIMEZONE);

  // 커서를 미리 전진 — 에러 시 롤백할 수 있도록 이전 커서 저장
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  // [Lines 193-204] 유휴 타이머 — 에이전트 유휴 시 컨테이너 stdin 닫기
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.debug(
        { group: group.name },
        'Idle timeout, closing container stdin',
      );
      queue.closeStdin(chatJid);
    }, IDLE_TIMEOUT);
  };

  // [Lines 206-235] 에이전트 실행 및 스트리밍 결과 처리
  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    if (result.result) {
      const raw =
        typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);
      // <internal> 블록 제거 — 에이전트의 내부 추론은 사용자에게 보이지 않음
      const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
      logger.info({ group: group.name }, `Agent output: ${raw.slice(0, 200)}`);
      if (text) {
        await channel.sendMessage(chatJid, text);
        outputSentToUser = true;
      }
      // 실제 결과에만 유휴 타이머 리셋 (세션 업데이트 마커는 제외)
      resetIdleTimer();
    }

    if (result.status === 'success') {
      queue.notifyIdle(chatJid);
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

  await channel.setTyping?.(chatJid, false);
  if (idleTimer) clearTimeout(idleTimer);

  // [Lines 240-261] 에러 처리 — 이미 사용자에게 응답을 보냈으면 커서 롤백하지 않음 (중복 방지)
  if (output === 'error' || hadError) {
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

// [Lines 263-342] 에이전트 실행 래퍼 — 작업 스냅샷 작성, 세션 관리, 컨테이너 에이전트 호출
async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.isMain === true;
  const sessionId = sessions[group.folder];

  // 작업 스냅샷을 컨테이너가 읽을 수 있도록 파일로 작성
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // 가용 그룹 스냅샷 작성 (main만 전체 그룹 목록 볼 수 있음)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // 스트리밍 결과에서 세션 ID 추적을 위한 onOutput 래퍼
  const wrappedOnOutput = onOutput
    ? async (output: ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runContainerAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
      },
      (proc, containerName) =>
        queue.registerProcess(chatJid, proc, containerName, group.folder),
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error(
        { group: group.name, error: output.error },
        'Container agent error',
      );
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

// [Lines 344-443] 메인 메시지 루프 — 주기적으로 새 메시지를 폴링하여 그룹별로 처리
async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`NanoClaw running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      // [Lines 355-360] 등록된 모든 JID에서 새 메시지 가져오기
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // "확인" 커서를 즉시 전진
        lastTimestamp = newTimestamp;
        saveState();

        // [Lines 370-378] 그룹별로 메시지 분류
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        // [Lines 380-436] 각 그룹에 대해 트리거 확인 후 처리
        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // 트리거 없는 메시지는 DB에 축적되어 트리거 시 컨텍스트로 사용
          if (needsTrigger) {
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                TRIGGER_PATTERN.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // 마지막 에이전트 처리 이후 축적된 모든 메시지를 컨텍스트로 포함
          const allPending = getMessagesSince(
            chatJid,
            lastAgentTimestamp[chatJid] || '',
            ASSISTANT_NAME,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;
          const formatted = formatMessages(messagesToSend, TIMEZONE);

          // [Lines 418-435] 활성 컨테이너가 있으면 stdin으로 파이핑, 없으면 새 컨테이너 시작
          if (queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active container',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // 파이핑된 메시지 처리 중 타이핑 표시
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // 활성 컨테이너 없음 — 새 컨테이너 큐에 등록
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    // [Line 441] 폴링 간격만큼 대기 후 다음 루프
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

// [Lines 445-461] 시작 복구 — 크래시 사이에 처리되지 않은 메시지 확인
// lastTimestamp 전진 후 처리 전에 크래시가 발생한 경우 대비
/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
    const pending = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

// [Lines 463-466] 컨테이너 시스템 확인 — 런타임 실행 중인지 확인, 고아 컨테이너 정리
function ensureContainerSystemRunning(): void {
  ensureContainerRuntimeRunning();
  cleanupOrphans();
}

// [Lines 468-596] 메인 함수 — 전체 시스템 초기화 및 시작
async function main(): Promise<void> {
  ensureContainerSystemRunning();
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // [Lines 474-478] 자격 증명 프록시 시작 — 컨테이너가 API 호출을 이 프록시를 통해 라우팅
  const proxyServer = await startCredentialProxy(
    CREDENTIAL_PROXY_PORT,
    PROXY_BIND_HOST,
  );

  // [Lines 480-489] 우아한 종료 핸들러 — SIGTERM/SIGINT 시 프록시, 큐, 채널 정리
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    proxyServer.close();
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // [Lines 491-520] 채널 콜백 — 모든 채널이 공유하는 수신 메시지 및 메타데이터 핸들러
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // 발신자 허용 목록 drop 모드: 거부된 발신자의 메시지를 저장 전에 폐기
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
  };

  // [Lines 522-541] 채널 생성 및 연결 — 레지스트리에 등록된 모든 채널을 순회
  // 인증 정보 없는 채널은 null을 반환하므로 건너뜀
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // [Lines 543-596] 서브시스템 시작 — 스케줄러, IPC 감시자, 메시지 루프
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName, groupFolder) =>
      queue.registerProcess(groupJid, proc, containerName, groupFolder),
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    sendFile: async (jid, filePath, caption) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      if (channel.sendFile) {
        await channel.sendFile(jid, filePath, caption);
      } else {
        await channel.sendMessage(
          jid,
          caption ? `${caption}\n[File: ${filePath}]` : `[File: ${filePath}]`,
        );
      }
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
  });
  // 메시지 처리 함수 등록 및 복구
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  // 메시지 루프 시작 — 크래시 시 프로세스 종료
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// [Lines 599-610] 직접 실행 가드 — import 시에는 main()을 실행하지 않음 (테스트 호환)
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
```
