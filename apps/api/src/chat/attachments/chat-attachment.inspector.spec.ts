import sharp from 'sharp';
import { AppException } from '../../common/errors/app.exception.js';
import { ImageProcessor } from '../../common/upload/image-processor.js';
import { CHAT_FILE_MAX_BYTES } from '../chat.constants.js';
import {
  animatedWebp,
  brokenJpeg,
  fakePdf,
  hugePng,
  imageWithGps,
  noisyPng,
  pdf,
  windowsExecutable,
} from '../testing/chat-files.js';
import { ChatAttachmentInspector, isPdf } from './chat-attachment.inspector.js';

// chat B4 — kiểm tệp theo nội dung với sharp THẬT (PLAN chat 7.7): TEP-01…TEP-04 phần xử lý tệp. Phần "không tệp, không tin" qua lõi gửi và DB thật ở
// rest/chat-attachment.int-spec.ts; 10 MB + 1 byte qua multer (413) ở test/chat-attachment.e2e-spec.ts.

const inspector = new ChatAttachmentInspector(new ImageProcessor());
const TWO_MB = 2 * 1024 * 1024;

async function errorOf(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    if (error instanceof AppException)
      return { status: error.getStatus(), maLoi: error.maLoi };
    throw error;
  }
  throw new Error('mong lỗi, nhận thành công');
}

describe('chat B4 — kiểm và xử lý tệp theo nội dung', () => {
  it.each([
    ['jpeg', 'jpg', 'image/jpeg'],
    ['png', 'png', 'image/png'],
    ['webp', 'webp', 'image/webp'],
  ] as const)(
    'TEP-01: %s có EXIF toạ độ GPS ⇒ tệp ra không còn EXIF hay metadata, ≤ 2 MB, loại %s',
    async (format, kind, mime) => {
      const source = await imageWithGps(format);
      // Đối chứng: ảnh vào thật sự có EXIF (chuỗi bản quyền giả nằm trong byte)
      expect((await sharp(source).metadata()).exif).toBeDefined();
      expect(source.includes(Buffer.from('clinix-test-exif'))).toBe(true);
      const out = await inspector.prepare(source, `anh.${kind}`);
      const meta = await sharp(out.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(out.data.includes(Buffer.from('clinix-test-exif'))).toBe(false);
      expect(out.data.length).toBeLessThanOrEqual(TWO_MB);
      expect([out.kind, out.mime, out.tenGoc]).toEqual([
        kind,
        mime,
        `anh.${kind}`,
      ]);
    },
  );

  it('TEP-02: ảnh trên 2 MB ⇒ nén ≤ 2 MB; nén sang WebP thì loại và đuôi tên theo WebP', async () => {
    const source = await noisyPng();
    expect(source.length).toBeGreaterThan(TWO_MB);
    expect(source.length).toBeLessThanOrEqual(CHAT_FILE_MAX_BYTES);
    const out = await inspector.prepare(source, 'chup-man-hinh.png');
    expect(out.data.length).toBeLessThanOrEqual(TWO_MB);
    expect((await sharp(out.data).metadata()).format).toBe('webp');
    expect([out.kind, out.mime, out.tenGoc]).toEqual([
      'webp',
      'image/webp',
      'chup-man-hinh.webp',
    ]);
  }, 30_000);

  it('TEP-02: ảnh trên 25 megapixel ⇒ 400 CHAT_TEP_KHONG_HOP_LE (mã ANH_… của ImageProcessor đã đổi sang mã chat)', async () => {
    expect(
      await errorOf(inspector.prepare(await hugePng(), 'lon.png')),
    ).toEqual({ status: 400, maLoi: 'CHAT_TEP_KHONG_HOP_LE' });
  }, 30_000);

  it.each([
    [
      'tệp thực thi đổi đuôi .jpg',
      () => Promise.resolve(windowsExecutable()),
      'anh.jpg',
    ],
    ['WebP động', animatedWebp, 'dong.webp'],
    ['JPEG hỏng', () => Promise.resolve(brokenJpeg()), 'hong.jpg'],
    [
      'GIF',
      () => Promise.resolve(Buffer.from('GIF89a\x01\x00\x01\x00')),
      'a.gif',
    ],
    [
      'văn bản thuần đặt tên .pdf',
      () => Promise.resolve(Buffer.from('xin chao')),
      'a.pdf',
    ],
    ['tệp rỗng', () => Promise.resolve(Buffer.alloc(0)), 'a.png'],
  ])('TEP-03: %s ⇒ 400 CHAT_TEP_KHONG_HOP_LE', async (_case, make, name) => {
    expect(await errorOf(inspector.prepare(await make(), name))).toEqual({
      status: 400,
      maLoi: 'CHAT_TEP_KHONG_HOP_LE',
    });
  });

  it('TEP-04: PDF đúng ⇒ nhận, giữ NGUYÊN byte; PDF giả (thiếu %%EOF ở 1024 byte cuối) ⇒ 400', async () => {
    const source = pdf(5000);
    const out = await inspector.prepare(source, 'don-thuoc.pdf');
    expect(out.data).toBe(source);
    expect([out.kind, out.mime, out.tenGoc]).toEqual([
      'pdf',
      'application/pdf',
      'don-thuoc.pdf',
    ]);
    expect(await errorOf(inspector.prepare(fakePdf(), 'gia.pdf'))).toEqual({
      status: 400,
      maLoi: 'CHAT_TEP_KHONG_HOP_LE',
    });
  });

  it('TEP-04: luật PDF ở biên: %%EOF đúng trong 1024 byte cuối thì nhận, lùi ra ngoài 1024 byte thì không', () => {
    const head = Buffer.from('%PDF-1.4\n');
    const eof = Buffer.from('%%EOF');
    const inside = Buffer.concat([
      head,
      Buffer.alloc(5000, 0x20),
      eof,
      Buffer.alloc(1024 - eof.length, 0x20),
    ]);
    const outside = Buffer.concat([
      head,
      Buffer.alloc(5000, 0x20),
      eof,
      Buffer.alloc(1025 - eof.length, 0x20),
    ]);
    expect(isPdf(inside)).toBe(true);
    expect(isPdf(outside)).toBe(false);
    expect(isPdf(Buffer.from('%PDF-%%EOF'))).toBe(true);
    expect(isPdf(Buffer.from(' %PDF-1.4 %%EOF'))).toBe(false);
  });

  it('TEP-04: đúng 10 MB ⇒ nhận; 10 MB + 1 byte ⇒ 413 CHAT_TEP_QUA_LON (lớp kiểm thứ hai sau multer)', async () => {
    const exact = pdf(CHAT_FILE_MAX_BYTES);
    expect(exact.length).toBe(CHAT_FILE_MAX_BYTES);
    expect((await inspector.prepare(exact, 'a.pdf')).data.length).toBe(
      CHAT_FILE_MAX_BYTES,
    );
    expect(
      await errorOf(inspector.prepare(pdf(CHAT_FILE_MAX_BYTES + 1), 'a.pdf')),
    ).toEqual({ status: 413, maLoi: 'CHAT_TEP_QUA_LON' });
  });
});
