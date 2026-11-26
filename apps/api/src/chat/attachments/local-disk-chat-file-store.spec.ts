import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { isChatFileKey, newChatFileKey } from './chat-file-key.js';
import { InvalidChatFileKeyError } from './chat-file-store.js';
import { LocalDiskChatFileStore } from './local-disk-chat-file-store.js';

// chat P3 — TEP-07, TEP-14 (PLAN chat 7.7): khoá lưu và kho tệp trên đĩa. Mỗi ca chạy trên một thư mục tạm riêng;
// thư mục gốc của kho là `<tạm>/kho` để kiểm được "không ghi ra ngoài thư mục gốc" (chỉ còn đúng `kho` trong `<tạm>`).

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function collect<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) out.push(item);
  return out;
}

let parent: string;
let root: string;
let store: LocalDiskChatFileStore;

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'clinix-chat-p3-'));
  root = join(parent, 'kho');
  store = new LocalDiskChatFileStore(root);
  await store.assertWritable();
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

describe('chat P3 — khoá lưu tệp (TEP-07)', () => {
  it('TEP-07: khoá đúng mẫu yyyy/mm/<uuid v4>.<đuôi theo loại>; tháng theo giờ Việt Nam; hai lần sinh khác nhau', () => {
    // 30/11 18:00 UTC = 01/12 01:00 giờ Việt Nam ⇒ thư mục tháng 12 (ca biên đổi tháng)
    const key = newChatFileKey('pdf', new Date('2026-11-30T18:00:00Z'));
    const [year, month, file] = key.split('/');
    expect(year).toBe('2026');
    expect(month).toBe('12');
    expect(file?.endsWith('.pdf')).toBe(true);
    expect(UUID_V4.test(file!.slice(0, -'.pdf'.length))).toBe(true);
    expect(isChatFileKey(key)).toBe(true);
    for (const kind of ['jpg', 'png', 'webp', 'pdf'] as const)
      expect(newChatFileKey(kind).endsWith(`.${kind}`)).toBe(true);
    expect(newChatFileKey('jpg')).not.toBe(newChatFileKey('jpg'));
  });

  it.each([
    ['đi ngược thư mục', '../2026/11/0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8.jpg'],
    ['đi ngược ở giữa', '2026/11/../../../etc/passwd'],
    ['đường dẫn tuyệt đối', '/etc/passwd'],
    ['gạch chéo ngược', '2026\\11\\0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8.jpg'],
    ['tên tệp của người dùng', '2026/11/anh-cua-toi.jpg'],
    ['đuôi lạ', '2026/11/0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8.exe'],
    ['tháng 13', '2026/13/0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8.png'],
    ['UUID chữ hoa', '2026/11/0B1C2D3E-4F50-4A61-8B72-93A4B5C6D7E8.png'],
    ['tệp tạm', '2026/11/.0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8.tmp'],
    ['rỗng', ''],
  ])('TEP-07: khoá sai mẫu (%s) ⇒ không nhận', (_case, key) => {
    expect(isChatFileKey(key)).toBe(false);
  });

  it('TEP-07: không phải chuỗi ⇒ không nhận', () => {
    expect(isChatFileKey(undefined)).toBe(false);
    expect(isChatFileKey(42)).toBe(false);
  });

  it('TEP-07: đọc và xoá bằng khoá đi ngược thư mục ⇒ từ chối, tệp ngoài thư mục gốc còn nguyên', async () => {
    const outside = join(parent, 'bi-mat.txt');
    await writeFile(outside, 'khong duoc doc');
    for (const key of ['../bi-mat.txt', '2026/11/../../../bi-mat.txt']) {
      await expect(store.openRead(key)).rejects.toBeInstanceOf(
        InvalidChatFileKeyError,
      );
      await expect(store.remove(key)).rejects.toBeInstanceOf(
        InvalidChatFileKeyError,
      );
    }
    expect(await readFile(outside, 'utf8')).toBe('khong duoc doc');
    // Thông điệp lỗi không lặp lại khoá (có thể là chuỗi người dùng gửi)
    expect(new InvalidChatFileKeyError().message).not.toContain('..');
  });
});

describe('chat P3 — kho tệp trên đĩa', () => {
  it('TEP-07: ghi ⇒ khoá do kho sinh, tệp nằm đúng <gốc>/yyyy/mm/<uuid>.<đuôi>, không còn tệp tạm; đọc lại đúng byte và kích thước', async () => {
    const data = Buffer.from('%PDF-1.7 noi dung gia %%EOF');
    const stored = await store.write('pdf', data);
    expect(isChatFileKey(stored.key)).toBe(true);
    expect(stored.size).toBe(data.length);
    const [year, month, name] = stored.key.split('/');
    expect(await readdir(join(root, year!, month!))).toEqual([name]);
    expect(await readFile(join(root, year!, month!, name!))).toEqual(data);

    const content = await store.openRead(stored.key);
    expect(content?.size).toBe(data.length);
    expect(await readAll(content!.stream)).toEqual(data);
  });

  it('TEP-07: xoá ⇒ đọc lại trả null; xoá lần nữa và đọc khoá đúng mẫu nhưng không có tệp ⇒ không lỗi', async () => {
    const { key } = await store.write('png', Buffer.from([1, 2, 3]));
    await store.remove(key);
    expect(await store.openRead(key)).toBeNull();
    await expect(store.remove(key)).resolves.toBeUndefined();
    expect(await store.openRead(newChatFileKey('jpg'))).toBeNull();
  });

  it('TEP-07: liệt kê chỉ trả tệp đúng mẫu khoá (bỏ tệp tạm, tệp lạ, thư mục lạ)', async () => {
    const a = await store.write('jpg', Buffer.from('a'));
    const b = await store.write('webp', Buffer.from('b'));
    const [year, month] = a.key.split('/');
    await writeFile(join(root, year!, month!, '.ghi-do.tmp'), 'x');
    await writeFile(join(root, year!, month!, 'la.txt'), 'x');
    await mkdir(join(root, 'khac'), { recursive: true });
    await writeFile(join(root, 'khac', 'x.jpg'), 'x');

    const entries = await collect(store.list());
    expect(entries.map((e) => e.key).sort()).toEqual([a.key, b.key].sort());
    for (const entry of entries) expect(entry.modifiedAt).toBeInstanceOf(Date);
  });

  it('TEP-07: kho trống hay thư mục gốc chưa có tệp nào ⇒ liệt kê rỗng', async () => {
    expect(await collect(store.list())).toEqual([]);
  });

  it('TEP-14: ghi, đọc, xoá, liệt kê không tạo gì ra ngoài thư mục gốc; kiểm ghi lúc khởi động không để lại tệp thử', async () => {
    const { key } = await store.write('jpg', Buffer.from('x'));
    await store.openRead(key);
    await collect(store.list());
    await store.remove(key);
    expect(await readdir(parent)).toEqual(['kho']);
    const [year] = key.split('/');
    expect(await readdir(root)).toEqual([year]);
  });
});

describe('chat P3 — kiểm thư mục lúc khởi động (TEP-14)', () => {
  it('TEP-14: thư mục gốc chưa có ⇒ tạo và nhận', async () => {
    const fresh = new LocalDiskChatFileStore(join(parent, 'moi', 'sau'));
    await expect(fresh.onModuleInit()).resolves.toBeUndefined();
    expect(await readdir(join(parent, 'moi', 'sau'))).toEqual([]);
  });

  it('TEP-14: đường dẫn là một tệp (không ghi được) ⇒ lỗi rõ ràng nêu tên biến CHAT_FILES_DIR và mã lỗi hệ điều hành', async () => {
    const file = join(parent, 'la-tep');
    await writeFile(file, 'x');
    const broken = new LocalDiskChatFileStore(file);
    await expect(broken.onModuleInit()).rejects.toThrow(
      /^CHAT_FILES_DIR: thư mục tệp đính kèm của chat không ghi được \((?:EEXIST|ENOTDIR)\)$/,
    );
    // Không ghi gì cạnh đó thay cho thư mục gốc
    expect((await readdir(parent)).sort()).toEqual(['kho', 'la-tep']);
  });
});
