import { resolve } from 'node:path';
import { DEV_CHAT_FILES_DIR, resolveChatFilesDir } from './chat-files-dir.js';

// chat P3 — TEP-14 (PLAN chat 7.7, 5.8): biến CHAT_FILES_DIR thiếu hay sai ⇒ lỗi rõ ràng lúc khởi động.
const ABSOLUTE_DIR = resolve('kho-tep-chat');

describe('chat P3 — thư mục kho tệp CHAT_FILES_DIR (TEP-14)', () => {
  it.each(['development', 'test'])(
    'TEP-14: NODE_ENV=%s bỏ trống hay chuỗi rỗng ⇒ thư mục mặc định .chat-files (tuyệt đối, theo thư mục chạy)',
    (stage) => {
      expect(resolveChatFilesDir(stage, undefined)).toBe(
        resolve(DEV_CHAT_FILES_DIR),
      );
      expect(resolveChatFilesDir(stage, '')).toBe(resolve(DEV_CHAT_FILES_DIR));
    },
  );

  it.each(['staging', 'production'])(
    'TEP-14: NODE_ENV=%s thiếu biến ⇒ lỗi nêu tên biến, không dùng mặc định',
    (stage) => {
      for (const dir of [undefined, ''])
        expect(() => resolveChatFilesDir(stage, dir)).toThrow(
          `CHAT_FILES_DIR: bắt buộc khi NODE_ENV=${stage}`,
        );
    },
  );

  it.each(['development', 'staging', 'production'])(
    'TEP-14: NODE_ENV=%s đặt đường dẫn tuyệt đối ⇒ dùng đúng đường dẫn đó',
    (stage) => {
      expect(resolveChatFilesDir(stage, ABSOLUTE_DIR)).toBe(ABSOLUTE_DIR);
    },
  );

  it.each(['data/chat', './chat', '../chat'])(
    'TEP-14: đường dẫn tương đối (%s) ⇒ từ chối',
    (dir) => {
      expect(() => resolveChatFilesDir('production', dir)).toThrow(
        'CHAT_FILES_DIR: phải là đường dẫn tuyệt đối',
      );
      expect(() => resolveChatFilesDir('development', dir)).toThrow(
        'CHAT_FILES_DIR: phải là đường dẫn tuyệt đối',
      );
    },
  );
});
