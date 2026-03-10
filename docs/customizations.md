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
