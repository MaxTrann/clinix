import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception.js';
import {
  ImageProcessor,
  imageFormat,
} from '../../common/upload/image-processor.js';
import {
  CHAT_FILE_MAX_BYTES,
  chatFileInvalid,
  chatFileTooLarge,
} from '../chat.constants.js';
import type { ChatFileKind } from './chat-file-key.js';
import { cleanFileName } from './chat-file-name.js';

// Kiểm và xử lý tệp đính kèm THEO NỘI DUNG (chat B4; PLAN chat 5.8, Q6): không tin tên tệp hay `Content-Type` của client.
//  - Ảnh JPEG, PNG, WebP: qua `ImageProcessor` dùng chung (tĩnh, ≤ 25 megapixel, ra ≤ 2 MB, bỏ EXIF và metadata). Loại lưu lấy từ byte ĐẦU RA (ảnh lớn bị nén sang WebP).
//  - PDF: bắt đầu `%PDF-` và có `%%EOF` trong 1024 byte cuối; giữ nguyên byte.
//  - Còn lại (tệp thực thi đổi đuôi, GIF, ảnh hỏng…) ⇒ 400 `CHAT_TEP_KHONG_HOP_LE`. Mã lỗi `ANH_…` của `ImageProcessor` được đổi sang mã `CHAT_TEP_…` ở đây.

export interface PreparedFile {
  kind: ChatFileKind;
  /** MIME ghi vào `tep_loai` và header `Content-Type` khi tải. */
  mime: string;
  data: Buffer;
  /** Tên hiển thị đã làm sạch, đuôi theo `kind`. */
  tenGoc: string;
}

const PDF_HEAD = Buffer.from('%PDF-', 'ascii');
const PDF_EOF = Buffer.from('%%EOF', 'ascii');
const PDF_TAIL_BYTES = 1024;

const IMAGE_KIND = {
  jpeg: { kind: 'jpg', mime: 'image/jpeg' },
  png: { kind: 'png', mime: 'image/png' },
  webp: { kind: 'webp', mime: 'image/webp' },
} as const;

/** PDF đúng dạng tối thiểu theo PLAN 5.8. Không phân tích cấu trúc bên trong (không quét virus, Q6). */
export function isPdf(data: Buffer): boolean {
  if (data.length < PDF_HEAD.length + PDF_EOF.length) return false;
  if (!data.subarray(0, PDF_HEAD.length).equals(PDF_HEAD)) return false;
  return data
    .subarray(Math.max(0, data.length - PDF_TAIL_BYTES))
    .includes(PDF_EOF);
}

@Injectable()
export class ChatAttachmentInspector {
  constructor(
    @Inject(ImageProcessor) private readonly images: ImageProcessor,
  ) {}

  async prepare(data: Buffer, originalName: string): Promise<PreparedFile> {
    if (data.length === 0) throw chatFileInvalid();
    if (data.length > CHAT_FILE_MAX_BYTES) throw chatFileTooLarge();
    if (isPdf(data))
      return {
        kind: 'pdf',
        mime: 'application/pdf',
        data,
        tenGoc: cleanFileName(originalName, 'pdf'),
      };
    // Không phải PDF ⇒ phải là ảnh: ImageProcessor tự kiểm magic bytes JPEG, PNG, WebP rồi giải mã thật (sai ⇒ lỗi, đổi sang 400 ở processImage)
    const output = await this.processImage(data);
    // Đầu ra của ImageProcessor luôn là một trong ba định dạng; kiểm lại cho chắc trước khi đặt đuôi
    const format = imageFormat(output);
    if (format === null) throw chatFileInvalid();
    const { kind, mime } = IMAGE_KIND[format];
    return {
      kind,
      mime,
      data: output,
      tenGoc: cleanFileName(originalName, kind),
    };
  }

  private async processImage(data: Buffer): Promise<Buffer> {
    try {
      // Tên truyền vào chỉ để qua phép kiểm tên của ImageProcessor (dành cho ảnh chuyên khoa); tên thật đã được làm sạch riêng ở trên
      return await this.images.process(data, 'tep');
    } catch (error) {
      if (error instanceof AppException && error.getStatus() === 413)
        throw chatFileTooLarge();
      // Ảnh hỏng, ảnh động, quá 25 megapixel, không nén được xuống 2 MB, xử lý quá lâu: cùng một lỗi cho người gửi
      if (error instanceof AppException) throw chatFileInvalid();
      throw error;
    }
  }
}
