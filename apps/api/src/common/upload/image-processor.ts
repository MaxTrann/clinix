import { Injectable } from '@nestjs/common';
import sharp, { type Sharp } from 'sharp';
import { AppException } from '../errors/app.exception.js';
import { SPECIALTY_IMAGE_POLICY as P } from './upload-policy.js';

function invalid(): AppException {
  return new AppException(400, 'ANH_KHONG_HOP_LE', {
    thongBao:
      'Ảnh phải là JPEG, PNG hoặc WebP tĩnh, đọc được, tối đa 10 MB và 25 megapixel.',
  });
}

export function imageFormat(data: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return 'jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'png';
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  return null;
}

@Injectable()
export class ImageProcessor {
  async process(data: Buffer, filename: string): Promise<Buffer> {
    if (
      !data.length ||
      data.length > P.inputBytes ||
      /[/\\]/.test(filename) ||
      filename.includes(String.fromCharCode(0)) ||
      filename.includes('..')
    ) {
      if (data.length > P.inputBytes)
        throw new AppException(413, 'ANH_QUA_DUNG_LUONG', {
          thongBao: 'Ảnh gốc tối đa 10 MB.',
        });
      throw invalid();
    }
    const format = imageFormat(data);
    if (!format) throw invalid();
    let active: Sharp | undefined;
    let expired = false;
    const started = Date.now();
    const pipeline = (source: Buffer): Sharp => {
      if (expired || Date.now() - started >= P.processingMs)
        throw new Error('IMAGE_DEADLINE');
      active = sharp(source, {
        limitInputPixels: P.maxPixels,
        failOn: 'warning',
        animated: true,
      });
      active.timeout({
        seconds: Math.max(
          1,
          Math.ceil((P.processingMs - (Date.now() - started)) / 1000),
        ),
      });
      return active;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        active?.destroy();
        reject(new Error('IMAGE_DEADLINE'));
      }, P.processingMs);
    });
    const work = async (): Promise<Buffer> => {
      const metadata = await pipeline(data).metadata();
      if (
        metadata.format !== format ||
        (metadata.pages ?? 1) !== 1 ||
        !metadata.width ||
        !metadata.height ||
        metadata.width * metadata.height > P.maxPixels
      )
        throw invalid();
      // Raw là nguồn duy nhất cho các lần thử: không nén chồng bản đã mất dữ liệu.
      const normalized = await pipeline(data)
        .autoOrient()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
      const source = normalized.data;
      const { width, height, channels } = normalized.info;
      const encode = async (
        quality: number | null,
        longEdge?: number,
        outputFormat = 'webp',
      ): Promise<Buffer> => {
        if (expired) throw new Error('IMAGE_DEADLINE');
        active = sharp(source, {
          raw: { width, height, channels },
          limitInputPixels: P.maxPixels,
        });
        active.timeout({
          seconds: Math.max(
            1,
            Math.ceil((P.processingMs - (Date.now() - started)) / 1000),
          ),
        });
        if (longEdge)
          active.resize({
            width: Math.round((width * longEdge) / Math.max(width, height)),
            height: Math.round((height * longEdge) / Math.max(width, height)),
            fit: 'inside',
            withoutEnlargement: true,
          });
        if (outputFormat === 'jpeg')
          return active
            .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
            .toBuffer();
        if (outputFormat === 'png') return active.png().toBuffer();
        return active
          .webp({
            lossless: quality === null,
            quality: quality ?? 100,
            alphaQuality: 100,
          })
          .toBuffer();
      };
      if (data.length <= P.outputBytes) {
        // Giải mã ở trên vẫn bắt ảnh hỏng; giữ nguyên byte nếu không cần chuẩn hóa metadata.
        if (
          !metadata.exif &&
          !metadata.icc &&
          !metadata.xmp &&
          !metadata.iptc &&
          !metadata.tifftagPhotoshop &&
          !metadata.comments?.length &&
          !metadata.gainMap &&
          (!metadata.orientation || metadata.orientation === 1)
        )
          return data;
        const preserved = await encode(null, undefined, format);
        if (preserved.length <= P.outputBytes) return preserved;
      }
      let result = await encode(null);
      if (result.length <= P.outputBytes) return result;
      for (const quality of P.qualities) {
        result = await encode(quality);
        if (result.length <= P.outputBytes) return result;
      }
      let edge = Math.max(width, height);
      for (let step = 0; step < P.resizeSteps && edge > P.minLongEdge; step++) {
        edge = Math.max(P.minLongEdge, Math.floor(edge * P.resizeRatio));
        result = await encode(80, edge);
        if (result.length <= P.outputBytes) return result;
      }
      throw new AppException(422, 'ANH_KHONG_THE_TOI_UU', {
        thongBao:
          'Không thể tối ưu ảnh xuống 2 MB trong giới hạn chất lượng. Hãy chọn ảnh khác.',
      });
    };
    try {
      return await Promise.race([work(), deadline]);
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (expired)
        throw new AppException(422, 'XU_LY_ANH_HET_THOI_GIAN', {
          thongBao: 'Xử lý ảnh quá lâu. Hãy chọn ảnh nhỏ hơn.',
        });
      throw invalid();
    } finally {
      if (timer) clearTimeout(timer);
      active?.destroy();
    }
  }
}
