import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { conversation, message } from '../testing/fake-chat-api';
import type { ChatMessage, ConversationListItem } from '../api/chat-types';
import {
  contentLength,
  dayDividerLabel,
  formatClock,
  listTimeLabel,
  replyLabel,
  rowLabel,
  sendErrorMessage,
  unreadText,
} from './chat-format';
import { mergeFirstPage } from './use-conversation-list';
import { compareIds, mergeMessages } from './use-message-thread';

// chat F3 — hàm thuần của khung nhắn tin (PLAN chat 5.9, 5.13, 5.14): giờ Việt Nam qua nửa đêm, số chưa đọc, nhãn, câu lỗi theo `maLoi`, so id BIGINT, gộp.
// Mã ca CFM-nn là [đề xuất].
const item = (patch: Record<string, unknown> = {}) =>
  conversation(patch) as unknown as ConversationListItem;
const msg = (id: string) => message({ id }) as unknown as ChatMessage;

// 10:00 ngày 27/11/2026 giờ Việt Nam
const NOW = Date.parse('2026-11-27T03:00:00.000Z');

describe('chat F3 — định dạng (WCH-08)', () => {
  it('WCH-08 CFM-01 ngăn ngày và giờ theo giờ Việt Nam: 17:00Z hôm trước đã là "Hôm nay" (00:00 VN), 16:59Z là "Hôm qua"', () => {
    expect(dayDividerLabel('2026-11-26T17:00:00.000Z', NOW)).toBe('Hôm nay');
    expect(dayDividerLabel('2026-11-26T16:59:00.000Z', NOW)).toBe('Hôm qua');
    expect(dayDividerLabel('2026-11-25T16:59:00.000Z', NOW)).toBe('25/11');
    expect(formatClock('2026-11-26T17:00:00.000Z')).toBe('00:00');
    expect(listTimeLabel('2026-11-27T01:05:00.000Z', NOW)).toBe('08:05');
    expect(listTimeLabel('2026-11-26T16:59:00.000Z', NOW)).toBe('26/11');
  });

  it('WCH-07 CFM-02 số chưa đọc ẩn khi 0, "99+" khi quá 99; tên truy cập của dòng kèm số', () => {
    expect(unreadText(0)).toBeNull();
    expect(unreadText(99)).toBe('99');
    expect(unreadText(100)).toBe('99+');
    expect(rowLabel(item({ soTinChuaDoc: 0 }))).toBe('BS. Trần Bình');
    expect(rowLabel(item({ soTinChuaDoc: 3 }))).toBe(
      'BS. Trần Bình, 3 tin chưa đọc',
    );
  });

  it('WCH-07 CFM-03 nhãn trả lời của Lễ tân (Q15); vai trò khác không có nhãn', () => {
    expect(replyLabel(item({ trangThaiTraLoi: 'ChoTraLoi' }))).toBe(
      'Chờ trả lời',
    );
    expect(
      replyLabel(item({ trangThaiTraLoi: 'DaTraLoi', traLoiBoi: 'Phạm Dung' })),
    ).toBe('Đã trả lời · Phạm Dung');
    expect(replyLabel(item())).toBeNull();
  });

  it('WCH-09 CFM-04 đếm theo điểm mã sau khi cắt hai đầu (emoji là một)', () => {
    expect(contentLength('  😀a \n')).toBe(2);
    expect(contentLength('   ')).toBe(0);
  });
});

describe('chat F3 — câu lỗi gửi (WCH-09, WCH-10)', () => {
  const apiError = (maLoi: string, loi?: { truong: string; ma: string }[]) =>
    new ApiError(400, { maLoi, thongBao: 'câu của máy chủ', loi });

  it('WCH-09 CFM-05 chọn câu theo `maLoi` và `loi[].ma`; mạng và quá giờ cùng một câu; mã lạ ⇒ câu chung, không lặp `thongBao`', () => {
    expect(sendErrorMessage(new NetworkError())).toBe(
      'Chưa gửi được do mạng. Nội dung vẫn còn, hãy thử lại.',
    );
    expect(sendErrorMessage(new TimeoutError())).toBe(
      'Chưa gửi được do mạng. Nội dung vẫn còn, hãy thử lại.',
    );
    expect(sendErrorMessage(apiError('CHAT_GUI_QUA_NHANH'))).toBe(
      'Bạn gửi quá nhanh. Đợi một chút rồi gửi lại.',
    );
    expect(sendErrorMessage(apiError('KHONG_TIM_THAY'))).toBe(
      'Bạn không có quyền xem hội thoại này.',
    );
    expect(
      sendErrorMessage(
        apiError('DU_LIEU_KHONG_HOP_LE', [
          { truong: 'noiDung', ma: 'NOI_DUNG_QUA_DAI' },
        ]),
      ),
    ).toBe('Tin nhắn phải có từ 1 đến 2000 ký tự.');
    expect(sendErrorMessage(apiError('MA_LA'))).toBe(
      'Chưa gửi được. Nội dung vẫn còn, hãy thử lại.',
    );
    expect(sendErrorMessage(new Error('x'))).toBe(
      'Chưa gửi được. Nội dung vẫn còn, hãy thử lại.',
    );
  });
});

describe('chat F3 — so id và gộp (WCH-07, WCH-08)', () => {
  it('WCH-08 CFM-06 so id BIGINT dạng chuỗi theo giá trị (không theo thứ tự chữ, không đổi sang number)', () => {
    expect(compareIds('9', '10')).toBeLessThan(0);
    expect(compareIds('9007199254740993', '9007199254740992')).toBeGreaterThan(
      0,
    );
    expect(compareIds('42', '42')).toBe(0);
  });

  it('WCH-08 CFM-07 gộp tin: bỏ trùng, sắp tăng dần', () => {
    const merged = mergeMessages(
      [msg('10'), msg('9')],
      [msg('10'), msg('11'), msg('2')],
    );
    expect(merged.map((m) => m.id)).toEqual(['2', '9', '10', '11']);
  });

  it('WCH-07 CFM-08 làm tươi trang đầu: chưa "Xem thêm" thì thay hẳn; đã "Xem thêm" thì trang mới lên trước, giữ các dòng sau và con trỏ cũ, không trùng', () => {
    const fresh = {
      items: [item({ id: 'b' }), item({ id: 'a' })],
      truocTiepTheo: 'c2',
    };
    expect(
      mergeFirstPage(
        { items: [item({ id: 'a' })], next: null, loadedAt: 0 },
        fresh,
        1,
      ),
    ).toEqual({
      items: fresh.items,
      next: 'c2',
      loadedAt: 1,
    });
    const many = Array.from({ length: 21 }, (_, i) => item({ id: String(i) }));
    const merged = mergeFirstPage(
      { items: many, next: 'old', loadedAt: 0 },
      { items: [item({ id: '20' })], truocTiepTheo: 'x' },
      1,
    );
    expect(merged.items.map((row) => row.id)).toEqual([
      '20',
      ...Array.from({ length: 20 }, (_, i) => String(i)),
    ]);
    expect(merged.next).toBe('old');
  });
});
