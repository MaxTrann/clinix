import sharp from 'sharp';
import { crc32 } from 'node:zlib';
import { ImageProcessor, imageFormat } from '../image-processor.js';
import { SPECIALTY_IMAGE_POLICY as P } from '../upload-policy.js';

const processor = new ImageProcessor();
async function image(width = 64, height = 32) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 20, g: 140, b: 220, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
}

describe('CK-11/SE-A7 — xử lý ảnh thực bằng Sharp', () => {
  it('ảnh nhỏ hợp lệ không đổi kích thước/chủ động nén, giữ nguyên byte khi không metadata', async () => {
    const source = await image();
    const result = await processor.process(source, 'anh.png');
    expect(result).toEqual(source);
    const meta = await sharp(result).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([64, 32, true]);
  });

  it('ảnh nhỏ có PNG text riêng tư vẫn loại metadata, không resize', async () => {
    const original = await image();
    const content = Buffer.from('Comment\0private-test-metadata');
    const body = Buffer.concat([Buffer.from('tEXt'), content]);
    const chunk = Buffer.alloc(content.length + 12);
    chunk.writeUInt32BE(content.length, 0);
    body.copy(chunk, 4);
    chunk.writeUInt32BE(crc32(body), content.length + 8);
    const source = Buffer.concat([
      original.subarray(0, 33),
      chunk,
      original.subarray(33),
    ]);
    expect((await sharp(source).metadata()).comments?.length).toBeGreaterThan(
      0,
    );
    const result = await processor.process(source, 'private.png');
    const meta = await sharp(result).metadata();
    expect(meta.comments?.length ?? 0).toBe(0);
    expect([meta.width, meta.height]).toEqual([64, 32]);
    expect(result.includes(content)).toBe(false);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])(
    'chuẩn hóa EXIF %s đúng chiều và bỏ metadata, không xoay hai lần',
    async (orientation) => {
      const source = await sharp(await image(80, 40))
        .jpeg()
        .withMetadata({ orientation })
        .toBuffer();
      const result = await processor.process(source, 'anh.jpg');
      const meta = await sharp(result).metadata();
      expect([meta.width, meta.height]).toEqual(
        orientation >= 5 ? [40, 80] : [80, 40],
      );
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
      expect(await processor.process(result, 'ket-qua.jpg')).toEqual(result);
    },
  );

  it('ảnh PNG >2 MB được nén xuống trần, không ép resize xuống 512 px', async () => {
    const width = 1200;
    const height = 900;
    const pixels = Buffer.alloc(width * height * 4);
    let seed = 7;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = i % 4 === 3 ? 255 : seed >>> 24;
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(source.length).toBeGreaterThan(P.outputBytes);
    const result = await processor.process(source, 'anh.png');
    expect(result.length).toBeLessThanOrEqual(P.outputBytes);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('webp');
    expect([meta.width, meta.height]).toEqual([width, height]);
  }, 20_000);

  it.each(['../a.png', 'x\\a.png', 'a\0.png'])(
    'từ chối tên traversal %s',
    async (name) => {
      await expect(
        processor.process(await image(), name),
      ).rejects.toMatchObject({ maLoi: 'ANH_KHONG_HOP_LE' });
    },
  );

  it('từ chối magic bytes giả, ảnh hỏng, tệp rỗng và quá dung lượng', async () => {
    for (const source of [
      Buffer.alloc(0),
      Buffer.from('<svg/>'),
      Buffer.from([255, 216, 255, 0]),
    ]) {
      await expect(processor.process(source, 'anh.png')).rejects.toMatchObject({
        maLoi: 'ANH_KHONG_HOP_LE',
      });
    }
    await expect(
      processor.process(Buffer.alloc(P.inputBytes + 1), 'anh.png'),
    ).rejects.toMatchObject({ maLoi: 'ANH_QUA_DUNG_LUONG' });
    expect(imageFormat(Buffer.from('GIF89a'))).toBeNull();
  });

  it('từ chối ảnh có hơn 25 megapixel trước khi giải mã raw', async () => {
    const source = await image(5001, 5000);
    await expect(processor.process(source, 'lon.png')).rejects.toMatchObject({
      maLoi: 'ANH_KHONG_HOP_LE',
    });
  }, 20_000);

  it('ảnh chụp lớn chỉ resize khi nén chưa đạt, giữ tỷ lệ và sàn cạnh dài', async () => {
    const width = 2200;
    const pixels = Buffer.alloc(width * width * 3);
    let seed = 31;
    for (let i = 0; i < pixels.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels[i] = seed >>> 24;
    }
    const input = await sharp(pixels, {
      raw: { width, height: width, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    expect(input.length).toBeGreaterThan(P.outputBytes);
    expect(input.length).toBeLessThanOrEqual(P.inputBytes);
    const output = await processor.process(input, 'camera.jpg');
    const meta = await sharp(output).metadata();
    expect(output.length).toBeLessThanOrEqual(P.outputBytes);
    expect(meta.width).toBe(meta.height);
    expect(meta.width).toBeLessThan(width);
    expect(meta.width).toBeGreaterThanOrEqual(P.minLongEdge);
  }, 20_000);

  it('từ chối WebP động dù magic bytes hợp lệ', async () => {
    const source = await sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
      raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(source, { animated: true }).metadata()).pages).toBe(2);
    await expect(
      processor.process(source, 'animated.webp'),
    ).rejects.toMatchObject({ maLoi: 'ANH_KHONG_HOP_LE' });
  });
});
