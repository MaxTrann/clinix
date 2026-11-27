import { describe, expect, it } from 'vitest';
import {
  CHAT_FILE_ACCEPT,
  CHAT_FILE_MAX_BYTES,
  attachmentError,
  formatFileSize,
  isImageType,
} from './attachment-rules';

// chat F6 — luật tệp ở web (PLAN chat 5.8, Q6; WCH-14): chặn sớm loại và cỡ, cách đọc dung lượng. Mã ca CAR-nn là [đề xuất].
describe('chat F6 — luật tệp đính kèm (WCH-14)', () => {
  it('WCH-14 CAR-01 nhận JPEG, PNG, WebP, PDF tới đúng 10 MB; sai loại, rỗng ⇒ câu loại tệp; hơn 10 MB ⇒ câu cỡ', () => {
    for (const type of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ])
      expect(
        attachmentError({ type, size: CHAT_FILE_MAX_BYTES }),
        type,
      ).toBeNull();
    for (const type of ['image/gif', 'image/svg+xml', 'text/html', ''])
      expect(attachmentError({ type, size: 10 }), type).toBe(
        'Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF.',
      );
    expect(attachmentError({ type: 'image/png', size: 0 })).toBe(
      'Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF.',
    );
    expect(
      attachmentError({
        type: 'application/pdf',
        size: CHAT_FILE_MAX_BYTES + 1,
      }),
    ).toBe('Tệp tối đa 10 MB.');
    expect(CHAT_FILE_ACCEPT).toBe(
      'image/jpeg,image/png,image/webp,application/pdf',
    );
  });

  it('WCH-14 CAR-02 ảnh là ba loại ảnh (PDF tải xuống); dung lượng "B", "KB", "MB" có dấu phẩy', () => {
    expect(isImageType('image/webp')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(350 * 1024)).toBe('350 KB');
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB');
  });
});
