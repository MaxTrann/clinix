import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { CancelReason } from '../cancel/cancel.types.js';
import { contextOf, MA_LICH_HEN } from '../testing/notification-fixtures.js';
import {
  buildNotificationText,
  NOTIFICATION_MAX_LENGTH,
  type NotificationTextInput,
} from './notification-text.js';

// Task B15 — chữ của `thong_bao.noi_dung` (PLAN booking 5.12, 7.14; TRACKING 3.37 B15-F): NTF-08 (độ dài, một dòng, không dữ liệu riêng tư; TB-02), NTF-09 (ba biến thể huỷ và ba dạng câu hoàn; TB-07 phần chữ).
// Hàm thuần: đơn vị, không DB. Chữ biến thể và câu hoàn là `[đề xuất]` (Figma `676:2` chỉ vẽ MỘT biến thể).
const { CONFIRMED, CANCELLED, NO_SHOW, NO_SHOW_LOCK } =
  BOOKING_NOTIFICATION_EVENTS;
const CONTROL_OR_LINE_BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const cancelled = (
  reason: CancelReason,
  hoanCoc: { tyLe: number; soTien: string } | null,
): string =>
  buildNotificationText({
    loai: CANCELLED,
    context: contextOf(),
    huy: { reason, hoanCoc },
  });

describe('NTF-09 ba biến thể huỷ theo reason (Q30; TB-07 phần chữ)', () => {
  it.each<[CancelReason, string]>([
    ['BenhNhanHuy', 'đã được hủy theo yêu cầu của bạn.'],
    ['LeTanHuy', 'đã được phòng khám điều chỉnh và hủy.'],
    ['QtvOverride', 'đã được phòng khám điều chỉnh và hủy.'],
    ['BacSiNghiPhep', 'đã bị hủy do bác sĩ nghỉ phép.'],
  ])('%s ⇒ "%s"', (reason, sentence) => {
    expect(cancelled(reason, null)).toContain(`${MA_LICH_HEN} ${sentence}`);
  });

  it('LeTanHuy và QtvOverride CÙNG biến thể "Phòng khám điều chỉnh"; ba biến thể khác nhau đôi một', () => {
    expect(cancelled('LeTanHuy', null)).toBe(cancelled('QtvOverride', null));
    const variants = new Set([
      cancelled('BenhNhanHuy', null),
      cancelled('LeTanHuy', null),
      cancelled('BacSiNghiPhep', null),
    ]);
    expect(variants.size).toBe(3);
  });
});

describe('NTF-09 câu hoàn tiền (Q18: chỉ khi có số, chữ "dự kiến")', () => {
  it('đã thu cọc, hoàn 50%: có số tiền định dạng VNĐ và tỷ lệ', () => {
    expect(cancelled('BenhNhanHuy', { tyLe: 50, soTien: '50000.00' })).toBe(
      `Lịch hẹn ${MA_LICH_HEN} đã được hủy theo yêu cầu của bạn. Hoàn dự kiến 50.000 VNĐ (50% tiền cọc).`,
    );
  });

  it('hoàn 100% của nghỉ phép: câu hoàn đủ số', () => {
    expect(cancelled('BacSiNghiPhep', { tyLe: 100, soTien: '100000.00' })).toBe(
      `Lịch hẹn ${MA_LICH_HEN} đã bị hủy do bác sĩ nghỉ phép. Hoàn dự kiến 100.000 VNĐ (100% tiền cọc).`,
    );
  });

  it('chưa thu đồng nào (`hoanCoc` null): nói chưa phát sinh thanh toán, KHÔNG có số tiền hay "hoàn dự kiến"', () => {
    const text = cancelled('BenhNhanHuy', null);
    expect(text).toContain(
      'Lịch hẹn này chưa phát sinh khoản thanh toán nên không có hoàn tiền.',
    );
    expect(text).not.toMatch(/Hoàn dự kiến|VNĐ/);
  });

  it('tỷ lệ 0 hay số tiền 0 (ca biên): nói cọc không được hoàn, không in "Hoàn dự kiến 0"', () => {
    for (const hoanCoc of [
      { tyLe: 0, soTien: '0.00' },
      { tyLe: 0, soTien: '100000.00' },
      { tyLe: 30, soTien: '0.00' },
    ]) {
      const text = cancelled('LeTanHuy', hoanCoc);
      expect(text, JSON.stringify(hoanCoc)).toContain(
        'khoản cọc không được hoàn.',
      );
      expect(text).not.toContain('Hoàn dự kiến');
    }
  });

  it('thiếu `huy` (người gọi cũ): câu trung tính, KHÔNG khẳng định ai huỷ và không nói về tiền', () => {
    expect(
      buildNotificationText({ loai: CANCELLED, context: contextOf() }),
    ).toBe(`Lịch hẹn ${MA_LICH_HEN} đã bị hủy.`);
  });
});

describe('NTF-08 bốn sự kiện: chữ đúng, số liệu lấy từ tham số', () => {
  it('xác nhận: mã, dịch vụ, bác sĩ, giờ, ngày, chi nhánh', () => {
    expect(
      buildNotificationText({ loai: CONFIRMED, context: contextOf() }),
    ).toBe(
      `Lịch hẹn ${MA_LICH_HEN} đã được xác nhận: Khám nội tổng quát với bác sĩ Nguyễn Thị Hương lúc 09:30 ngày 10/11/2026 tại CLINIX Clinic Q.3.`,
    );
  });

  it('Vắng mặt và khoá: số lần và ngưỡng lấy từ tham số (không viết cứng "3")', () => {
    const noShow = buildNotificationText({
      loai: NO_SHOW,
      context: contextOf(),
      soLan: 5,
      nguong: 7,
    });
    expect(noShow).toBe(
      `Bạn đã vắng mặt tại lịch hẹn ${MA_LICH_HEN} (lần thứ 5). Từ 7 lần vắng mặt, tài khoản sẽ bị hạn chế đặt lịch online.`,
    );
    const lock = buildNotificationText({
      loai: NO_SHOW_LOCK,
      context: contextOf(),
      soLan: 5,
      nguong: 7,
    });
    expect(lock).toBe(
      'Tài khoản của bạn đã bị hạn chế đặt lịch online do vắng mặt 5 lần (ngưỡng 7 lần). Đây không phải khóa đăng nhập tài khoản.',
    );
    expect(`${noShow}${lock}`).not.toMatch(/\b3\b/);
  });
});

// Một đầu vào cho mỗi loại, đủ hai nhánh chữ dài nhất của loại huỷ
const ALL_INPUTS = (context = contextOf()): NotificationTextInput[] => [
  { loai: CONFIRMED, context },
  {
    loai: CANCELLED,
    context,
    huy: { reason: 'BenhNhanHuy', hoanCoc: { tyLe: 50, soTien: '50000.00' } },
  },
  { loai: NO_SHOW, context, soLan: 2, nguong: 3 },
  { loai: NO_SHOW_LOCK, context, soLan: 3, nguong: 3 },
];

describe('NTF-08 an toàn: ≤ 500 ký tự, MỘT dòng, không dữ liệu riêng tư (TB-02, H10)', () => {
  it('chữ dài nhất có thể (mọi tên đủ 100 ký tự): vẫn ≤ 500', () => {
    const long = 'Đ'.repeat(100);
    const context = contextOf({
      maLichHen: 'CLX-20261110-9999',
      dichVu: long,
      tenBacSi: long,
      chiNhanh: long,
    });
    for (const input of ALL_INPUTS(context))
      expect(
        buildNotificationText(input).length,
        input.loai,
      ).toBeLessThanOrEqual(NOTIFICATION_MAX_LENGTH);
  });

  it('chữ của DB có xuống dòng, ký tự điều khiển, U+2028: gộp thành MỘT dòng, không ký tự điều khiển', () => {
    const context = contextOf({
      tenBacSi: 'Hương\r\nBcc: ke-xau@example.test giả',
      dichVu: 'Khám\u0000nội\tkhoa',
      chiNhanh: 'Q.3\nQ.4',
    });
    const text = buildNotificationText({ loai: CONFIRMED, context });
    expect(text).not.toMatch(CONTROL_OR_LINE_BREAK);
    expect(text).toContain('Hương Bcc: ke-xau@example.test giả');
  });

  it('chữ dài bất thường (2000 ký tự mỗi trường, vượt cả cột của DB) bị cắt theo từng trường: không ném, tổng vẫn ≤ 500', () => {
    const huge = 'x'.repeat(2000);
    const text = buildNotificationText({
      loai: CONFIRMED,
      context: contextOf({
        maLichHen: huge,
        dichVu: huge,
        tenBacSi: huge,
        chiNhanh: huge,
      }),
    });
    expect(text.length).toBeLessThanOrEqual(NOTIFICATION_MAX_LENGTH);
    expect(text).not.toContain('x'.repeat(101));
  });

  it('không bao giờ chứa email, tên người khám hay tên người đặt: các trường đó không đi vào chữ', () => {
    const context = contextOf({
      emailNguoiDat: 'rieng.tu@example.test',
      nguoiDuocKham: 'Tên Người Khám Riêng',
      tenNguoiDat: 'Tên Người Đặt Riêng',
    });
    for (const input of ALL_INPUTS(context)) {
      const text = buildNotificationText(input);
      expect(text, input.loai).not.toContain('rieng.tu@example.test');
      expect(text, input.loai).not.toContain('Tên Người Khám Riêng');
      expect(text, input.loai).not.toContain('Tên Người Đặt Riêng');
    }
  });
});
