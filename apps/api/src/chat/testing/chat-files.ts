import { readdir, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import sharp from 'sharp';

// Tệp mẫu cho test tệp đính kèm của chat (chat B4; PLAN chat 7.7). Sinh bằng sharp trong bộ nhớ, không có tệp nhị phân trong repo; không phải dữ liệu bệnh nhân thật.

/** Toạ độ GPS giả trong EXIF (IFD3 là GPS): sau khi xử lý không được còn. */
const GPS_EXIF = {
  IFD0: { Copyright: 'clinix-test-exif' },
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '10/1 46/1 0/1',
    GPSLongitudeRef: 'E',
    GPSLongitude: '106/1 42/1 0/1',
  },
};

function solid(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  });
}

/** Ảnh nhỏ có EXIF chứa toạ độ GPS, đúng định dạng yêu cầu. */
export function imageWithGps(format: 'jpeg' | 'png' | 'webp'): Promise<Buffer> {
  return solid(64, 48).withExif(GPS_EXIF)[format]().toBuffer();
}

/** Ảnh PNG nhiễu ngẫu nhiên (không nén được nhiều): lớn hơn 2 MB, nhỏ hơn 10 MB. */
export async function noisyPng(): Promise<Buffer> {
  const width = 1200;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 11;
  for (let i = 0; i < pixels.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels[i] = seed >>> 24;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

/** Ảnh 5001 × 5000 (hơn 25 megapixel), một màu nên tệp nhỏ. */
export function hugePng(): Promise<Buffer> {
  return solid(5001, 5000).png().toBuffer();
}

/** WebP động hai khung (magic bytes đúng WebP). */
export function animatedWebp(): Promise<Buffer> {
  return sharp(Buffer.from([255, 0, 0, 0, 255, 0]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

/** JPEG hỏng: đúng ba byte đầu của JPEG nhưng phần còn lại là rác. */
export function brokenJpeg(): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(200, 0x41),
  ]);
}

/** Tệp thực thi Windows (đầu `MZ`), client đặt tên `.jpg`. */
export function windowsExecutable(): Buffer {
  return Buffer.concat([Buffer.from('MZ'), Buffer.alloc(510, 0x90)]);
}

/** PDF tối thiểu hợp lệ theo luật của chat; `size` đệm phần thân cho đủ số byte (≥ 64). */
export function pdf(size = 400): Buffer {
  const head = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n', 'ascii');
  const tail = Buffer.from('\ntrailer << >>\n%%EOF\n', 'ascii');
  const pad = Math.max(0, size - head.length - tail.length);
  return Buffer.concat([head, Buffer.alloc(pad, 0x20), tail]);
}

/** "PDF" giả: đầu `%PDF-` nhưng không có `%%EOF` ở 1024 byte cuối. */
export function fakePdf(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 0x41)]);
}

/** Mọi khoá đang có trong thư mục kho (bỏ tệp tạm), dạng `yyyy/mm/<tên>`. */
export async function storedKeys(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let names: string[];
    try {
      names = await readdir(dir, { withFileTypes: false });
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      if (/^\d{4}$|^\d{2}$/.test(name)) await walk(path);
      else out.push(relative(root, path).split(sep).join('/'));
    }
  };
  await walk(root);
  return out.sort();
}

/** Xoá sạch nội dung kho test (giữ thư mục gốc). */
export async function clearStore(root: string): Promise<void> {
  for (const name of await readdir(root).catch(() => [] as string[]))
    await rm(join(root, name), { recursive: true, force: true });
}
