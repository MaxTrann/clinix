import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { type OnModuleInit } from '@nestjs/common';
import {
  isChatFileKey,
  newChatFileKey,
  type ChatFileKind,
} from './chat-file-key.js';
import {
  InvalidChatFileKeyError,
  type ChatFileContent,
  type ChatFileEntry,
  type ChatFileStore,
  type StoredChatFile,
} from './chat-file-store.js';

// Kho tệp trên đĩa cục bộ (chat P3; PLAN chat 5.8, Q5): thư mục gốc `CHAT_FILES_DIR`, trong container là volume `chat-files` gắn ở `/data/chat`.

const YEAR_DIR = /^\d{4}$/;
const MONTH_DIR = /^(?:0[1-9]|1[0-2])$/;

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

export class LocalDiskChatFileStore implements ChatFileStore, OnModuleInit {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Kiểm lúc API khởi động (TEP-14): thư mục gốc phải ghi được, nếu không thì dừng ngay với lỗi rõ ràng thay vì đợi tới lần gửi tệp đầu tiên. */
  async onModuleInit(): Promise<void> {
    await this.assertWritable();
  }

  async assertWritable(): Promise<void> {
    const probe = join(this.root, `.kiem-ghi-${randomUUID()}.tmp`);
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(probe, '', { flag: 'wx' });
      await unlink(probe);
    } catch (error) {
      // Chỉ nêu tên biến và mã lỗi hệ điều hành (EACCES, ENOTDIR…), đủ để biết phải sửa gì
      const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      throw new Error(
        `CHAT_FILES_DIR: thư mục tệp đính kèm của chat không ghi được (${code})`,
        { cause: error },
      );
    }
  }

  async write(kind: ChatFileKind, data: Buffer): Promise<StoredChatFile> {
    const key = newChatFileKey(kind);
    const target = this.pathOf(key);
    await mkdir(dirname(target), { recursive: true });
    // Ghi ra tệp tạm cùng thư mục rồi đổi tên: người đọc và job dọn không bao giờ thấy tệp ghi dở.
    // Tên tạm bắt đầu bằng dấu chấm nên không khớp mẫu khoá (list bỏ qua). `wx`: không bao giờ ghi đè tệp có sẵn.
    const temp = join(dirname(target), `.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, data, { flag: 'wx' });
      await rename(temp, target);
    } catch (error) {
      await unlink(temp).catch(() => undefined);
      throw error;
    }
    return { key, size: data.length };
  }

  async openRead(key: string): Promise<ChatFileContent | null> {
    const path = this.pathOf(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
      return { stream: createReadStream(path), size: info.size };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathOf(key));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async *list(): AsyncIterable<ChatFileEntry> {
    for (const year of await this.childNames(this.root, YEAR_DIR)) {
      const yearDir = join(this.root, year);
      for (const month of await this.childNames(yearDir, MONTH_DIR)) {
        const monthDir = join(yearDir, month);
        for (const name of await this.childNames(monthDir)) {
          const key = `${year}/${month}/${name}`;
          if (!isChatFileKey(key)) continue;
          try {
            const info = await stat(join(monthDir, name));
            if (info.isFile()) yield { key, modifiedAt: info.mtime };
          } catch (error) {
            // Tệp vừa bị xoá giữa readdir và stat: bỏ qua
            if (!isMissing(error)) throw error;
          }
        }
      }
    }
  }

  /** Đường dẫn tuyệt đối của một khoá. Hai lớp chặn đi ngược thư mục: khoá phải đúng mẫu, và đường dẫn sau khi ghép phải nằm trong thư mục gốc. */
  private pathOf(key: string): string {
    if (!isChatFileKey(key)) throw new InvalidChatFileKeyError();
    const path = resolve(this.root, ...key.split('/'));
    const inside = relative(this.root, path);
    if (inside === '' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
      throw new InvalidChatFileKeyError();
    return path;
  }

  private async childNames(dir: string, pattern?: RegExp): Promise<string[]> {
    try {
      const names = await readdir(dir);
      return pattern ? names.filter((name) => pattern.test(name)) : names;
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }
}
