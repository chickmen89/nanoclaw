# Customizations Log

NanoClaw 원본 코드베이스에 존재하지 않는 기능을 추가하거나 직접 수정한 커스터마이징 이력을 기록합니다.
스킬(`/add-*`)로 적용한 기본 설정은 제외합니다.

---

## 1. Telegram 메시지 마크다운 포맷 적용

- **작업일시**: 2026-03-10
- **관련 파일**: `src/channels/telegram.ts`

### `src/channels/telegram.ts` — `sendMessage()` 메서드 (Lines 205-219)

**기존 코드 (Lines 205-212)**:

```typescript
      if (text.length <= MAX_LENGTH) {
        await this.bot.api.sendMessage(numericId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LENGTH) {
          await this.bot.api.sendMessage(
            numericId,
            text.slice(i, i + MAX_LENGTH),
          );
```

**수정 코드 (Lines 205-219)**:

```typescript
      const chunks =
        text.length <= MAX_LENGTH
          ? [text]
          : Array.from({ length: Math.ceil(text.length / MAX_LENGTH) }, (_, i) =>
              text.slice(i * MAX_LENGTH, (i + 1) * MAX_LENGTH),
            );

      for (const chunk of chunks) {
        try {
          await this.bot.api.sendMessage(numericId, chunk, {
            parse_mode: 'Markdown',
          });
        } catch {
          // Fallback to plain text if Markdown parsing fails
          await this.bot.api.sendMessage(numericId, chunk);
```

**사유 및 목적**:

1. **마크다운 렌더링**: 에이전트 응답에 포함된 마크다운(굵기, 코드블록, 링크 등)이 Telegram에서 올바르게 렌더링되도록 `parse_mode: 'Markdown'` 옵션 추가.
2. **폴백 처리**: 마크다운 문법 오류로 Telegram API가 거부할 경우, `catch` 블록에서 일반 텍스트로 재전송하여 메시지 유실 방지.
3. **청크 분할 리팩터링**: `if/else` + `for` 루프를 `Array.from` 기반 청크 배열로 통합하여, 마크다운 전송과 폴백 로직을 한 곳에서 처리하도록 개선.

---

## 2. Telegram 양방향 파일 전송

- **작업일시**: 2026-03-10
- **관련 파일**: `src/channels/telegram.ts`, `src/types.ts`, `src/ipc.ts`, `src/index.ts`, `src/container-runner.ts`, `src/ipc-auth.test.ts`

### 개요

텔레그램을 통해 사용자와 에이전트 간 파일(이미지, 문서, 영상 등)을 양방향으로 주고받는 기능. 기존 IPC 마운트(`/workspace/ipc`)를 재사용하여 새로운 마운트 없이 구현.

### 인바운드 (사용자 → 에이전트)

사용자가 텔레그램으로 파일을 보내면 Telegram Bot API에서 다운로드하여 `./data/ipc/{groupFolder}/files/`에 저장. 에이전트에게는 컨테이너 경로가 포함된 플레이스홀더로 전달:

- `[Photo: /workspace/ipc/files/photo-1710012345.jpg]`
- `[Document: /workspace/ipc/files/doc-1710012345.pdf]`
- `[Video: /workspace/ipc/files/video-1710012345.mp4]`

다운로드 실패 시 기존처럼 `[Photo]` 등 텍스트 플레이스홀더로 대체 (graceful degradation).

### 아웃바운드 (에이전트 → 사용자)

에이전트가 `/workspace/ipc/messages/`에 JSON 파일을 작성하면 IPC watcher가 감지하여 전송:

```json
{"type":"send_file","chatJid":"tg:123","filePath":"/workspace/ipc/files/result.pdf","caption":"분석 결과"}
```

확장자 기반으로 자동 분기: 이미지→`sendPhoto`, 영상→`sendVideo`, 기타→`sendDocument`.

### 파일별 수정 상세

#### `src/types.ts` — `Channel` 인터페이스 (Line 91-92)

**추가 코드:**

```typescript
  // Optional: send a file (image, document, video, etc.) to a chat.
  sendFile?(jid: string, filePath: string, caption?: string): Promise<void>;
```

**사유 및 목적**: 채널 공통 인터페이스에 파일 전송 메서드를 정의. `optional(?)`로 선언하여 파일 전송을 지원하지 않는 채널(WhatsApp 등)은 구현하지 않아도 되도록 기존 호환성 유지.

#### `src/channels/telegram.ts` — import 변경 (Lines 1-6)

**기존 코드:**

```typescript
import { Bot } from 'grammy';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
```

**수정 코드:**

```typescript
import fs from 'fs';
import path from 'path';

import { Bot, InputFile } from 'grammy';

import { ASSISTANT_NAME, DATA_DIR, TRIGGER_PATTERN } from '../config.js';
```

**사유 및 목적**: 파일 다운로드/저장을 위해 `fs`, `path` 모듈 추가. grammy의 `InputFile` 클래스는 아웃바운드 파일 전송 시 로컬 파일을 Telegram API에 업로드하는 데 사용. `DATA_DIR`은 다운로드한 파일을 IPC 디렉터리(`./data/ipc/`)에 저장하기 위해 필요.

#### `src/channels/telegram.ts` — `downloadFile()` private 메서드 (Lines 32-72)

**추가 코드:**

```typescript
  private async downloadFile(
    fileId: string,
    groupFolder: string,
    prefix: string,
    originalName?: string,
  ): Promise<string | null> {
    if (!this.bot) return null;
    try {
      const file = await this.bot.api.getFile(fileId);
      const remotePath = file.file_path;
      if (!remotePath) return null;

      const ext = originalName
        ? path.extname(originalName)
        : path.extname(remotePath) || '';
      const filename = `${prefix}-${Date.now()}${ext}`;
      const dir = path.join(DATA_DIR, 'ipc', groupFolder, 'files');
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, filename);

      const url = `https://api.telegram.org/file/bot${this.botToken}/${remotePath}`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const buffer = Buffer.from(await resp.arrayBuffer());
      fs.writeFileSync(dest, buffer);

      logger.info({ groupFolder, filename }, 'Telegram file downloaded');
      return `/workspace/ipc/files/${filename}`;
    } catch (err) {
      logger.debug({ err, prefix }, 'Failed to download Telegram file');
      return null;
    }
  }
```

**사유 및 목적**: Telegram Bot API의 `getFile()`로 파일 메타데이터(서버 경로)를 조회한 뒤, HTTP로 실제 파일을 다운로드하여 IPC files 디렉터리에 저장. 컨테이너 경로(`/workspace/ipc/files/...`)를 반환하여 에이전트가 해당 경로로 파일에 직접 접근 가능. 실패 시 `null`을 반환하여 기존 텍스트 플레이스홀더로 graceful degradation.

#### `src/channels/telegram.ts` — media handler 수정 (Lines 210-270)

**기존 코드:**

```typescript
    this.bot.on('message:photo', (ctx) => storeNonText(ctx, '[Photo]'));
    this.bot.on('message:video', (ctx) => storeNonText(ctx, '[Video]'));
    this.bot.on('message:voice', (ctx) => storeNonText(ctx, '[Voice message]'));
    this.bot.on('message:audio', (ctx) => storeNonText(ctx, '[Audio]'));
    this.bot.on('message:document', (ctx) => {
      const name = ctx.message.document?.file_name || 'file';
      storeNonText(ctx, `[Document: ${name}]`);
    });
```

**수정 코드:**

```typescript
    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const photos = ctx.message.photo;
      const fileId = photos?.[photos.length - 1]?.file_id;
      if (group && fileId) {
        const fp = await this.downloadFile(fileId, group.folder, 'photo');
        storeNonText(ctx, fp ? `[Photo: ${fp}]` : '[Photo]');
      } else {
        storeNonText(ctx, '[Photo]');
      }
    });
    this.bot.on('message:video', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const fileId = ctx.message.video?.file_id;
      if (group && fileId) {
        const fp = await this.downloadFile(fileId, group.folder, 'video');
        storeNonText(ctx, fp ? `[Video: ${fp}]` : '[Video]');
      } else {
        storeNonText(ctx, '[Video]');
      }
    });
    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const fileId = ctx.message.voice?.file_id;
      if (group && fileId) {
        const fp = await this.downloadFile(fileId, group.folder, 'voice');
        storeNonText(ctx, fp ? `[Voice: ${fp}]` : '[Voice message]');
      } else {
        storeNonText(ctx, '[Voice message]');
      }
    });
    this.bot.on('message:audio', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const fileId = ctx.message.audio?.file_id;
      if (group && fileId) {
        const name = ctx.message.audio?.file_name;
        const fp = await this.downloadFile(fileId, group.folder, 'audio', name);
        storeNonText(ctx, fp ? `[Audio: ${fp}]` : '[Audio]');
      } else {
        storeNonText(ctx, '[Audio]');
      }
    });
    this.bot.on('message:document', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      const name = ctx.message.document?.file_name || 'file';
      const fileId = ctx.message.document?.file_id;
      if (group && fileId) {
        const fp = await this.downloadFile(fileId, group.folder, 'doc', name);
        storeNonText(ctx, fp ? `[Document: ${fp}]` : `[Document: ${name}]`);
      } else {
        storeNonText(ctx, `[Document: ${name}]`);
      }
    });
```

**사유 및 목적**: 기존에는 `[Photo]`, `[Document: name]` 등 텍스트만 전달하여 에이전트가 파일 내용에 접근할 수 없었음. 수정 후 각 미디어 타입별로 `downloadFile()`을 호출하여 실제 파일을 다운로드하고, 컨테이너 경로를 포함한 플레이스홀더(`[Photo: /workspace/ipc/files/...]`)로 전달. 등록되지 않은 그룹이거나 다운로드 실패 시 기존 플레이스홀더로 대체하여 안전성 확보. 사진의 경우 `photos[photos.length - 1]`로 최고 해상도 버전을 선택.

#### `src/channels/telegram.ts` — `sendFile()` 메서드 (Lines 333-357)

**추가 코드:**

```typescript
  async sendFile(
    jid: string,
    filePath: string,
    caption?: string,
  ): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }
    try {
      const numericId = jid.replace(/^tg:/, '');
      const ext = path.extname(filePath).toLowerCase();
      const source = new InputFile(filePath);

      if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        await this.bot.api.sendPhoto(numericId, source, { caption });
      } else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
        await this.bot.api.sendVideo(numericId, source, { caption });
      } else {
        await this.bot.api.sendDocument(numericId, source, { caption });
      }
      logger.info({ jid, filePath }, 'Telegram file sent');
    } catch (err) {
      logger.error({ jid, filePath, err }, 'Failed to send Telegram file');
    }
  }
```

**사유 및 목적**: grammy의 `InputFile`을 사용하여 호스트의 로컬 파일을 Telegram API로 업로드. 확장자 기반으로 `sendPhoto`(이미지), `sendVideo`(영상), `sendDocument`(기타)를 자동 분기하여 Telegram 클라이언트에서 적절한 미디어 뷰어로 표시되도록 처리. 선택적 `caption` 파라미터로 파일에 설명을 첨부 가능.

#### `src/ipc.ts` — `IpcDeps` 인터페이스 (Line 15)

**추가 코드:**

```typescript
  sendFile: (jid: string, filePath: string, caption?: string) => Promise<void>;
```

**사유 및 목적**: IPC watcher의 의존성 인터페이스에 `sendFile` 함수를 추가. IPC watcher가 `send_file` 타입의 IPC 메시지를 처리할 때 실제 파일 전송을 위임할 함수가 필요하며, 이를 외부에서 주입받는 구조(기존 `sendMessage`와 동일 패턴).

#### `src/ipc.ts` — `send_file` IPC 처리 (Lines 95-126)

**추가 코드** (기존 `type: "message"` 처리 블록 뒤에 추가):

```typescript
              } else if (
                data.type === 'send_file' &&
                data.chatJid &&
                data.filePath
              ) {
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  // Translate container path to host path
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
```

**사유 및 목적**: 에이전트 컨테이너가 IPC로 보낸 `send_file` 요청을 호스트에서 처리. 핵심은 컨테이너 경로(`/workspace/ipc/...`)를 호스트 경로(`./data/ipc/{groupFolder}/...`)로 변환하는 것. 기존 `type: "message"`와 동일한 권한 검증(non-main 그룹은 자기 chatJid만 전송 가능)을 적용하여 크로스 그룹 파일 전송을 차단.

#### `src/index.ts` — IPC deps에 `sendFile` 연결 (Lines 566-577)

**추가 코드** (기존 `sendMessage` 뒤에 추가):

```typescript
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
```

**사유 및 목적**: 오케스트레이터(`index.ts`)에서 IPC watcher에 실제 `sendFile` 구현을 주입. 채널이 `sendFile`을 지원하면 직접 호출하고, 미지원 시 텍스트 메시지로 파일 경로를 전달하는 폴백 처리. 이를 통해 Telegram 외 다른 채널에서도 에이전트의 `send_file` IPC가 에러 없이 동작.

#### `src/container-runner.ts` — `files/` 디렉터리 생성 (Line 172)

**추가 코드** (기존 `messages/tasks/input` 디렉터리 생성부 다음에 추가):

```typescript
  fs.mkdirSync(path.join(groupIpcDir, 'files'), { recursive: true });
```

**사유 및 목적**: 컨테이너 실행 전에 IPC `files/` 디렉터리를 미리 생성. 이 디렉터리는 인바운드(다운로드한 파일 저장)와 아웃바운드(에이전트가 보낼 파일 저장) 양방향으로 사용되며, 기존 IPC 마운트(`/workspace/ipc`)에 포함되어 별도 마운트 설정이 불필요.

#### `container/agent-runner/src/ipc-mcp-stdio.ts` — `send_file` MCP 도구 (Lines 66-107)

**추가 코드** (기존 `send_message` 도구 뒤에 추가):

```typescript
server.tool(
  'send_file',
  `Send a file to the user or group via Telegram. The file must exist at the given path inside the container. Files in /workspace/ipc/files/ are shared with the host and can be sent directly. You can also copy files from /workspace/group/ to /workspace/ipc/files/ first.

Supported types: images (.jpg, .png, .gif, .webp) are sent as photos, videos (.mp4, .mov) as videos, everything else as documents.

Telegram limits: max 50MB for uploads.`,
  {
    filePath: z.string().describe('Absolute path to the file inside the container (e.g., /workspace/ipc/files/result.png)'),
    caption: z.string().optional().describe('Optional caption/description for the file'),
  },
  async (args) => {
    if (!fs.existsSync(args.filePath)) {
      return {
        content: [{ type: 'text' as const, text: `File not found: ${args.filePath}` }],
        isError: true,
      };
    }

    let ipcFilePath = args.filePath;
    if (!args.filePath.startsWith(FILES_DIR)) {
      const filename = `out-${Date.now()}-${path.basename(args.filePath)}`;
      const dest = path.join(FILES_DIR, filename);
      fs.mkdirSync(FILES_DIR, { recursive: true });
      fs.copyFileSync(args.filePath, dest);
      ipcFilePath = dest;
    }

    const data: Record<string, string | undefined> = {
      type: 'send_file',
      chatJid,
      filePath: ipcFilePath,
      caption: args.caption || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: `File queued for sending: ${path.basename(ipcFilePath)}` }] };
  },
);
```

**사유 및 목적**: 에이전트가 파일 전송 기능을 인지하고 MCP 도구(`mcp__nanoclaw__send_file`)로 직접 호출할 수 있도록 등록. 이전에는 에이전트가 코드를 분석하여 IPC JSON을 직접 작성해야 했으나, MCP 도구로 등록함으로써 에이전트가 도구 목록에서 바로 발견하고 사용 가능. 파일이 `/workspace/ipc/files/` 외부에 있으면 자동으로 복사하여 호스트가 접근 가능한 경로로 이동. 파일 존재 여부를 사전 검증하여 잘못된 경로로 인한 IPC 실패를 방지.

#### `src/ipc-auth.test.ts` — mock deps (Line 55)

**추가 코드:**

```typescript
    sendFile: async () => {},
```

**사유 및 목적**: `IpcDeps` 인터페이스에 `sendFile`이 추가됨에 따라 테스트의 mock 객체에도 빈 구현을 추가하여 TypeScript 컴파일 에러 해소.

### 주의사항: 그룹별 agent-runner-src 수동 갱신 필요

`src/container-runner.ts:194`에서 그룹별 `agent-runner-src/` 디렉터리가 **이미 존재하면 소스를 복사하지 않는다:**

```typescript
if (!fs.existsSync(groupAgentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
  fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
}
```

컨테이너 이미지를 리빌드해도 실제 에이전트가 사용하는 MCP 소스는 `data/sessions/{group}/agent-runner-src/`에 마운트된 파일이다. 따라서 `container/agent-runner/src/`의 MCP 도구를 수정한 후에는 기존 그룹의 `agent-runner-src/`에 수동으로 복사해야 반영된다:

```bash
# 예시: telegram_main 그룹에 최신 MCP 소스 반영
cp container/agent-runner/src/ipc-mcp-stdio.ts data/sessions/telegram_main/agent-runner-src/ipc-mcp-stdio.ts

# 모든 그룹에 일괄 반영
for dir in data/sessions/*/agent-runner-src; do
  cp container/agent-runner/src/ipc-mcp-stdio.ts "$dir/ipc-mcp-stdio.ts"
done

# 반영 후 서비스 재시작
systemctl --user restart nanoclaw
```

새로 등록하는 그룹은 `agent-runner-src/`가 없으므로 자동으로 최신 소스가 복사된다.

### 제한사항

- Telegram Bot API 파일 크기 제한: 다운로드 20MB, 업로드 50MB
- 다운로드된 파일은 `./data/ipc/{groupFolder}/files/`에 누적됨 (추후 정리 로직 필요)

---

## 3. Telegram MarkdownV2 변환 레이어

- **작업일시**: 2026-03-10
- **관련 파일**: `src/channels/telegram.ts`, `src/channels/telegram.test.ts`

### 개요

에이전트 응답에 포함된 표준 마크다운을 Telegram MarkdownV2 포맷으로 변환하는 레이어 추가. 기존 `parse_mode: 'Markdown'`(레거시)에서 `parse_mode: 'MarkdownV2'`로 전환하여 더 풍부한 포맷팅 지원.

### 변환 규칙

| 입력 (표준 MD) | 출력 (TG MarkdownV2) | 설명 |
|----------------|---------------------|------|
| `# Heading` | `*Heading*` | 제목 → 볼드 |
| `**bold**` | `*bold*` | 볼드 |
| `*italic*` 또는 `_italic_` | `_italic_` | 이탤릭 |
| `***bold italic***` 또는 `**_text_**` | `*_text_*` | 볼드+이탤릭 |
| `~~strike~~` 또는 `~strike~` | `~strike~` | 취소선 |
| `\|\|spoiler\|\|` | `\|\|spoiler\|\|` | 스포일러 |
| `` `code` `` | `` `code` `` | 인라인 코드 |
| ` ```code``` ` | ` ```code``` ` | 코드 블록 |
| `[text](url)` | `[text](url)` | 링크 |
| `> quote` | `>quote` | 블록인용 |
| `---` | `─────────────────` | 수평선 → 유니코드 |
| `- item` | `• item` | 목록 → 불릿 |
| 테이블 | ` ```table``` ` | 테이블 → 코드 블록 |

### 변환 순서 (이스케이프 안전성 확보)

1. 펜스드 코드 블록 추출 → 플레이스홀더
2. 인라인 코드 추출 → 플레이스홀더
3. 테이블 → 코드 블록 플레이스홀더
4. 링크 → 플레이스홀더 (텍스트 이스케이프, URL 별도 처리)
5. 제목 → `**bold**` 임시 변환
6. 수평선, 목록 마커 변환
7. 마크다운 문법 변환 (스포일러 → 취소선 → 볼드이탤릭 → 볼드 → 이탤릭, 복합 패턴 우선)
8. 블록인용 마커 임시 치환
9. 나머지 특수문자 이스케이프 (`_*[]()~\`>#+-=|{}.!\\`)
10. 블록인용 마커 복원
11. 플레이스홀더 복원 (역순)

### 파일별 수정 상세

#### `src/channels/telegram.ts` — `convertToTelegramMarkdownV2()` 함수 (Lines 23-89)

**추가 코드:**

```typescript
export function convertToTelegramMarkdownV2(text: string): string {
  const phs: string[] = [];
  const ph = (v: string): string => {
    const i = phs.length;
    phs.push(v);
    return `\x00${i}\x00`;
  };
  const esc = (s: string): string =>
    s.replace(/[_*\[\]()~`>#+=|{}.!\-\\]/g, '\\$&');

  // 1. Fenced code blocks → placeholders
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const e = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(lang ? `\`\`\`${lang}\n${e}\`\`\`` : `\`\`\`\n${e}\`\`\``);
  });

  // 2. Inline code → placeholders
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const e = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(`\`${e}\``);
  });

  // 3. Tables → code block placeholders
  text = text.replace(/(^\|[^\n]*\|(?:\n\|[^\n]*\|)+)/gm, (match) => {
    const e = match.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(`\`\`\`\n${e}\n\`\`\``);
  });

  // 4. Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
    ph(`[${esc(t)}](${u.replace(/\\/g, '\\\\').replace(/\)/g, '\\)')})`)
  );

  // 5. Headings → **bold** (then bold conversion below)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');

  // 6. Horizontal rules
  text = text.replace(/^-{3,}$/gm, '─────────────────');
  text = text.replace(/^\*{3,}$/gm, '─────────────────');

  // 7. List markers → bullet
  text = text.replace(/^(\s*)\*\s/gm, '$1• ');
  text = text.replace(/^(\s*)[+-]\s/gm, '$1• ');

  // 8. Spoiler: ||text|| → TG spoiler
  text = text.replace(/\|\|(.+?)\|\|/g, (_, c) => ph(`||${esc(c)}||`));

  // 9. Strikethrough: ~~text~~ or ~text~ → TG ~text~
  text = text.replace(/~~(.+?)~~/g, (_, c) => ph(`~${esc(c)}~`));
  text = text.replace(/(?<!~)~([^~\n]+)~(?!~)/g, (_, c) => ph(`~${esc(c)}~`));

  // 10. Bold+Italic: ***text*** or **_text_** → TG *_text_*
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, (_, c) => ph(`*_${esc(c)}_*`));
  text = text.replace(/\*\*_(.+?)_\*\*/g, (_, c) => ph(`*_${esc(c)}_*`));

  // 11. Bold: **text** or __text__ → TG *text*
  text = text.replace(/\*\*(.+?)\*\*/g, (_, c) => ph(`*${esc(c)}*`));
  text = text.replace(/__(.+?)__/g, (_, c) => ph(`*${esc(c)}*`));

  // 12. Italic: *text* or _text_ → TG _text_
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, c) => ph(`_${esc(c)}_`));
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, (_, c) => ph(`_${esc(c)}_`));

  // 13. Blockquote prefix → marker
  text = text.replace(/^>\s?/gm, '\x01');

  // 14. Escape remaining special chars
  text = esc(text);

  // 15. Restore blockquote markers
  text = text.replace(/\x01/g, '>');

  // 16. Restore placeholders (reverse order)
  for (let i = phs.length - 1; i >= 0; i--) {
    text = text.replace(`\x00${i}\x00`, phs[i]);
  }

  return text;
}
```

**사유 및 목적**: 표준 마크다운을 Telegram MarkdownV2로 안전하게 변환. 플레이스홀더 기반으로 코드 블록/인라인 코드 내부의 특수문자가 이중 이스케이프되지 않도록 보호. 변환 실패 시 `sendMessage`의 `catch` 블록에서 일반 텍스트로 폴백하여 메시지 유실 방지.

#### `src/channels/telegram.ts` — `sendMessage()` 메서드 변경 (Lines 370-403)

**기존 코드:**

```typescript
    const chunks =
      text.length <= MAX_LENGTH
        ? [text]
        : Array.from(
            { length: Math.ceil(text.length / MAX_LENGTH) },
            (_, i) => text.slice(i * MAX_LENGTH, (i + 1) * MAX_LENGTH),
          );

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(numericId, chunk, {
          parse_mode: 'Markdown',
        });
      } catch {
        await this.bot.api.sendMessage(numericId, chunk);
      }
    }
```

**수정 코드:**

```typescript
    const converted = convertToTelegramMarkdownV2(text);
    const MAX_LENGTH = 4096;
    const chunks =
      converted.length <= MAX_LENGTH
        ? [converted]
        : Array.from(
            { length: Math.ceil(converted.length / MAX_LENGTH) },
            (_, i) => converted.slice(i * MAX_LENGTH, (i + 1) * MAX_LENGTH),
          );

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(numericId, chunk, {
          parse_mode: 'MarkdownV2',
        });
      } catch {
        await this.bot.api.sendMessage(numericId, chunk);
      }
    }
```

**사유 및 목적**:
1. **MarkdownV2 전환**: 레거시 `Markdown` 모드에서 `MarkdownV2`로 전환. MarkdownV2는 볼드, 이탤릭, 취소선, 블록인용 등 더 많은 포맷팅을 지원.
2. **변환 후 청킹**: 변환된 텍스트(이스케이프로 길이 증가 가능)를 기준으로 4096자 청킹하여 Telegram 메시지 길이 제한 준수.
3. **폴백 유지**: MarkdownV2 파싱 실패 시 동일 청크를 일반 텍스트로 재전송.

#### `src/channels/telegram.test.ts` — MarkdownV2 변환 테스트 (25개 테스트 추가)

**추가된 테스트 항목:**

- 일반 텍스트 특수문자 이스케이프 (`.`, `+`, `=` 등)
- 펜스드 코드 블록 보존 (언어 태그 포함/미포함)
- 코드 블록 내 백틱 이스케이프
- 인라인 코드 변환
- `**bold**` → `*bold*` 변환
- `__bold__` → `*bold*` 변환
- `*italic*` → `_italic_` 변환
- `_italic_` → `_italic_` 변환
- `~~strikethrough~~` → `~text~` 변환
- `~strikethrough~` → `~text~` 변환 (MarkdownV2 네이티브)
- `||spoiler||` → `||spoiler||` 변환
- `***bold italic***` → `*_text_*` 변환
- `**_bold italic_**` → `*_text_*` 변환
- 제목(`#`, `##`, `###`) → 볼드 변환
- 수평선(`---`) → 유니코드 라인 변환
- 블록인용(`>`) 변환
- 목록 마커(`-`, `*`, `+`) → 불릿 변환
- 링크 변환 및 링크 텍스트 내 특수문자 이스케이프
- 테이블 → 코드 블록 변환
- 볼드 내부 특수문자 이스케이프
- 혼합 포맷팅
- 코드 블록과 일반 텍스트 혼용
- 백슬래시 이스케이프

**사유 및 목적**: 변환 함수를 `export`하여 직접 단위 테스트 가능. 각 변환 규칙별 독립 테스트로 회귀 방지. 기존 `sendMessage` 테스트도 `parse_mode: 'MarkdownV2'`로 업데이트하고, MarkdownV2 실패 시 일반 텍스트 폴백 테스트 추가.
