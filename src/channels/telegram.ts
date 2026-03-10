import fs from 'fs';
import path from 'path';

import { Bot, InputFile } from 'grammy';

import { ASSISTANT_NAME, DATA_DIR, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * Convert standard Markdown to Telegram MarkdownV2 format.
 * Handles code blocks, inline code, tables, headings, bold, italic,
 * strikethrough, links, blockquotes, horizontal rules, and list markers.
 */
export function convertToTelegramMarkdownV2(text: string): string {
  const phs: string[] = [];
  const ph = (v: string): string => {
    const i = phs.length;
    phs.push(v);
    return `\x00${i}\x00`;
  };
  const esc = (s: string): string =>
    s.replace(/[_*\[\]()~`>#+=|{}.!\-\\]/g, '\\$&');

  // 1. Fenced code blocks → placeholders (preserve content as-is)
  text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const e = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(lang ? `\`\`\`${lang}\n${e}\`\`\`` : `\`\`\`\n${e}\`\`\``);
  });

  // 2. Inline code → placeholders
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const e = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(`\`${e}\``);
  });

  // 3. Tables (2+ consecutive |…| lines) → code block placeholders
  text = text.replace(/(^\|[^\n]*\|(?:\n\|[^\n]*\|)+)/gm, (match) => {
    const e = match.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
    return ph(`\`\`\`\n${e}\n\`\`\``);
  });

  // 4. Links: [text](url) → placeholders
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) =>
    ph(
      `[${esc(t)}](${u.replace(/\\/g, '\\\\').replace(/\)/g, '\\)')})`,
    ),
  );

  // 5. Headings → temporary **bold** (converted to TG bold below)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '**$1**');

  // 6. Horizontal rules → unicode line
  text = text.replace(/^-{3,}$/gm, '─────────────────');
  text = text.replace(/^\*{3,}$/gm, '─────────────────');

  // 7. List markers → bullet (before italic to avoid * conflicts)
  text = text.replace(/^(\s*)\*\s/gm, '$1• ');
  text = text.replace(/^(\s*)[+-]\s/gm, '$1• ');

  // 8. Spoiler: ||text|| → TG spoiler (MarkdownV2 native)
  text = text.replace(/\|\|(.+?)\|\|/g, (_, c) => ph(`||${esc(c)}||`));

  // 9. Strikethrough: ~~text~~ or ~text~ → TG ~text~
  text = text.replace(/~~(.+?)~~/g, (_, c) => ph(`~${esc(c)}~`));
  text = text.replace(/(?<!~)~([^~\n]+)~(?!~)/g, (_, c) =>
    ph(`~${esc(c)}~`),
  );

  // 10. Bold+Italic: ***text*** or **_text_** → TG bold italic *_text_*
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, (_, c) =>
    ph(`*_${esc(c)}_*`),
  );
  text = text.replace(/\*\*_(.+?)_\*\*/g, (_, c) =>
    ph(`*_${esc(c)}_*`),
  );

  // 11. Bold: **text** or __text__ → TG bold *text*
  text = text.replace(/\*\*(.+?)\*\*/g, (_, c) => ph(`*${esc(c)}*`));
  text = text.replace(/__(.+?)__/g, (_, c) => ph(`*${esc(c)}*`));

  // 12. Italic: *text* or _text_ → TG italic _text_
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, (_, c) =>
    ph(`_${esc(c)}_`),
  );
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, (_, c) =>
    ph(`_${esc(c)}_`),
  );

  // 13. Blockquote: > text → marker (restore after escaping)
  text = text.replace(/^>\s?/gm, '\x01');

  // 14. Escape remaining special chars in plain text
  text = esc(text);

  // 15. Restore blockquote markers
  text = text.replace(/\x01/g, '>');

  // 16. Restore all placeholders (reverse order for nested)
  for (let i = phs.length - 1; i >= 0; i--) {
    text = text.replace(`\x00${i}\x00`, phs[i]);
  }

  return text;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  /**
   * Download a file from Telegram servers into the group's IPC files directory.
   * Returns the container-side path (e.g., /workspace/ipc/files/photo-123.jpg)
   * or null on failure.
   */
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

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content: `${placeholder}${caption}`,
        timestamp,
        is_from_me: false,
      });
    };

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
    this.bot.on('message:sticker', (ctx) => {
      const emoji = ctx.message.sticker?.emoji || '';
      storeNonText(ctx, `[Sticker ${emoji}]`);
    });
    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('Telegram bot not initialized');
      return;
    }

    try {
      const numericId = jid.replace(/^tg:/, '');
      const converted = convertToTelegramMarkdownV2(text);

      // Telegram has a 4096 character limit per message — split if needed
      const MAX_LENGTH = 4096;
      const chunks =
        converted.length <= MAX_LENGTH
          ? [converted]
          : Array.from(
              { length: Math.ceil(converted.length / MAX_LENGTH) },
              (_, i) =>
                converted.slice(i * MAX_LENGTH, (i + 1) * MAX_LENGTH),
            );

      for (const chunk of chunks) {
        try {
          await this.bot.api.sendMessage(numericId, chunk, {
            parse_mode: 'MarkdownV2',
          });
        } catch {
          // Fallback to plain text if MarkdownV2 parsing fails
          await this.bot.api.sendMessage(numericId, chunk);
        }
      }
      logger.info({ jid, length: text.length }, 'Telegram message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Telegram message');
    }
  }

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

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  return new TelegramChannel(token, opts);
});
