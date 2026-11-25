import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import type { AppointmentEvent } from '../ports/appointment-notifier.port.js';
import { contextOf, MA_LICH_HEN } from '../testing/notification-fixtures.js';
import {
  GIO_CU,
  GIO_CU_TEXT,
  GIO_MOI,
  GIO_MOI_TEXT,
} from '../testing/reschedule-notification-world.js';
import { NOTIFICATION_MAX_LENGTH } from './notification-text.js';
import {
  buildRescheduleText,
  type RescheduleTextInput,
} from './reschedule-text.js';

// reschedule B3 — chữ của `thong_bao.noi_dung` cho bốn sự kiện đổi lịch (PLAN reschedule 5.10, 7.8, 7.10): NDL-09 (nguyên văn, giờ Việt Nam), NDL-06 (≤ 500 ở trường hợp xấu nhất, cắt có chủ đích, không làm hỏng
// ký tự đa byte), BDL-04 (chữ người nhập lưu nguyên, một dòng). Hàm thuần: đơn vị, không DB. Chữ là `[đề xuất]` (Q13).
const { RESCHEDULED, REQUEST_PENDING, REQUEST_APPROVED, REQUEST_REJECTED } =
  RESCHEDULE_NOTIFICATION_EVENTS;
type DoiLich = NonNullable<AppointmentEvent['doiLich']>;
type YeuCau = NonNullable<AppointmentEvent['yeuCau']>;

const MA_CU = 'CLX-20261105-0007';
const MA_MOI = 'CLX-20261110-0099';
// Một nửa cặp thay thế (cao không có thấp đi sau, hoặc thấp không có cao đứng trước)
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const CONTROL_OR_LINE_BREAK = /[\p{Cc}\p{Zl}\p{Zp}]/u;

const rescheduled = (
  doiLich: Partial<DoiLich> = {},
  context = contextOf(),
): string =>
  buildRescheduleText({
    loai: RESCHEDULED,
    context,
    doiLich: {
      maLichHenCu: MA_CU,
      thoiGianCu: GIO_CU,
      thoiGianMoi: GIO_MOI,
      via: 'TuDoi',
      ...doiLich,
    },
  });

const request = (
  loai: Extract<RescheduleTextInput, { yeuCau: YeuCau }>['loai'],
  yeuCau: Partial<YeuCau> = {},
  context = contextOf({ gio: '07:45', ngay: '09/11/2026' }),
): string =>
  buildRescheduleText({
    loai,
    context,
    yeuCau: { yeuCauId: '5', thoiGianMongMuon: GIO_MOI, ...yeuCau },
  });

describe('NDL-09 nguyên văn bốn sự kiện (PLAN reschedule 5.10; Q9, Q10, Q13 `[đề xuất]`)', () => {
  it('LichHenDaDoiLich, tự đổi: mã cũ → mã mới, giờ cũ → giờ mới theo giờ Việt Nam, bác sĩ, chi nhánh; KHÔNG có lý do dù sự kiện mang `lyDo`', () => {
    expect(rescheduled()).toBe(
      `Lịch hẹn ${MA_CU} đã đổi sang ${MA_LICH_HEN}: ${GIO_CU_TEXT} → ${GIO_MOI_TEXT}, bác sĩ Nguyễn Thị Hương, CLINIX Clinic Q.3.`,
    );
    const withReason = rescheduled({ lyDo: 'LYDO-KHONG-HIEN' });
    expect(withReason).not.toContain('LYDO-KHONG-HIEN');
    expect(withReason).not.toContain('Lễ tân đã đổi hộ');
  });

  it('LichHenDaDoiLich, đổi hộ (Q9): thêm "Lễ tân đã đổi hộ. Lý do: …."', () => {
    expect(rescheduled({ via: 'DoiHo', lyDo: 'Bác sĩ có việc đột xuất' })).toBe(
      `Lịch hẹn ${MA_CU} đã đổi sang ${MA_LICH_HEN}: ${GIO_CU_TEXT} → ${GIO_MOI_TEXT}, bác sĩ Nguyễn Thị Hương, CLINIX Clinic Q.3. Lễ tân đã đổi hộ. Lý do: Bác sĩ có việc đột xuất.`,
    );
  });

  it('đổi hộ thiếu hay rỗng lý do: bỏ câu lý do, vẫn nói "Lễ tân đã đổi hộ" (không ném: không hoàn tác một lần đổi vì thiếu chữ)', () => {
    const base = `Lịch hẹn ${MA_CU} đã đổi sang ${MA_LICH_HEN}: ${GIO_CU_TEXT} → ${GIO_MOI_TEXT}, bác sĩ Nguyễn Thị Hương, CLINIX Clinic Q.3. Lễ tân đã đổi hộ.`;
    expect(rescheduled({ via: 'DoiHo' })).toBe(base);
    expect(rescheduled({ via: 'DoiHo', lyDo: ' \n\t ' })).toBe(base);
  });

  it('YeuCauDoiLichDangCho: mã và giờ hiện tại của lịch CŨ (đọc từ ngữ cảnh), giờ mong muốn của yêu cầu', () => {
    expect(request(REQUEST_PENDING)).toBe(
      `Yêu cầu đổi lịch hẹn ${MA_LICH_HEN} sang ${GIO_MOI_TEXT} đã được gửi. Lịch hẹn giữ nguyên 07:45 09/11/2026 cho tới khi có kết quả.`,
    );
  });

  it('YeuCauDoiLichDaDuyet: mã cũ, mã mới, giờ mới (khung giờ thay thế thắng giờ mong muốn), ghi chú', () => {
    expect(
      request(REQUEST_APPROVED, {
        maLichHenMoi: MA_MOI,
        ghiChu: 'Đã xếp khung giờ gần nhất',
      }),
    ).toBe(
      `Yêu cầu đổi lịch hẹn ${MA_LICH_HEN} đã được duyệt. Lịch mới ${MA_MOI}: ${GIO_MOI_TEXT}. Ghi chú: Đã xếp khung giờ gần nhất.`,
    );
    expect(
      request(REQUEST_APPROVED, {
        maLichHenMoi: MA_MOI,
        thoiGianMongMuon: GIO_CU,
        thoiGianMoi: GIO_MOI,
        ghiChu: 'x',
      }),
    ).toContain(`Lịch mới ${MA_MOI}: ${GIO_MOI_TEXT}.`);
  });

  it('YeuCauDoiLichDaDuyet thiếu mã lịch mới: NÉM (lỗi lập trình của người gọi, hoàn tác hành động gốc), không đoán', () => {
    expect(() => request(REQUEST_APPROVED, { ghiChu: 'x' })).toThrow(
      /maLichHenMoi/,
    );
  });

  it('YeuCauDoiLichBiTuChoi: lịch hẹn giữ nguyên giờ hiện tại, ghi chú của nhân sự', () => {
    expect(request(REQUEST_REJECTED, { ghiChu: 'Khung giờ đã kín' })).toBe(
      `Yêu cầu đổi lịch hẹn ${MA_LICH_HEN} bị từ chối. Lịch hẹn giữ nguyên 07:45 09/11/2026. Ghi chú: Khung giờ đã kín.`,
    );
  });

  it('duyệt hay từ chối thiếu hoặc rỗng ghi chú: bỏ câu ghi chú, phần còn lại nguyên', () => {
    expect(request(REQUEST_REJECTED)).toBe(
      `Yêu cầu đổi lịch hẹn ${MA_LICH_HEN} bị từ chối. Lịch hẹn giữ nguyên 07:45 09/11/2026.`,
    );
    expect(request(REQUEST_REJECTED, { ghiChu: '   ' })).toBe(
      request(REQUEST_REJECTED),
    );
  });
});

describe('NDL-06 `noi_dung` ≤ 500; cắt có chủ đích ở phần chữ tự do, không làm hỏng ký tự đa byte', () => {
  const NOTE_255 = 'Ư'.repeat(255);
  const LONGEST = contextOf({
    maLichHen: 'A'.repeat(20),
    tenBacSi: 'B'.repeat(100),
    chiNhanh: 'C'.repeat(100),
  });
  const fixedDoiHo = (): string => rescheduled({ via: 'DoiHo' }, contextOf());

  it('duyệt và từ chối với ghi chú 255 ký tự ở trường hợp xấu nhất: vừa 500, KHÔNG cắt, ghi chú nguyên vẹn', () => {
    for (const loai of [REQUEST_APPROVED, REQUEST_REJECTED] as const) {
      const text = request(
        loai,
        { ghiChu: NOTE_255, maLichHenMoi: 'D'.repeat(20) },
        LONGEST,
      );
      expect(text.length, loai).toBeLessThanOrEqual(NOTIFICATION_MAX_LENGTH);
      expect(text, loai).toContain(`Ghi chú: ${NOTE_255}.`);
      expect(text, loai).not.toContain('…');
    }
  });

  it('đổi hộ với lý do 255 ký tự, bác sĩ và chi nhánh đều 100 ký tự (phần cố định 337): vượt 500 nên CẮT lý do, đúng 500 đơn vị, kết thúc "…."; phần cố định nguyên vẹn', () => {
    const full = rescheduled(
      { via: 'DoiHo', lyDo: NOTE_255, maLichHenCu: 'E'.repeat(20) },
      LONGEST,
    );
    const fixed = rescheduled(
      { via: 'DoiHo', maLichHenCu: 'E'.repeat(20) },
      LONGEST,
    );
    expect(full).toHaveLength(NOTIFICATION_MAX_LENGTH);
    // số điểm mã (MySQL `varchar(500)` đếm theo điểm mã) không vượt số đơn vị UTF-16
    expect(Array.from(full).length).toBeLessThanOrEqual(
      NOTIFICATION_MAX_LENGTH,
    );
    expect(full.startsWith(`${fixed} Lý do: `)).toBe(true);
    expect(full.endsWith('….')).toBe(true);
    expect(full).toContain('Ư');
  });

  it('đổi hộ với dữ liệu thường và lý do 255 ký tự: vừa, không cắt', () => {
    const text = rescheduled({ via: 'DoiHo', lyDo: NOTE_255 });
    expect(text.length).toBeLessThan(NOTIFICATION_MAX_LENGTH);
    expect(text.endsWith(`Lý do: ${NOTE_255}.`)).toBe(true);
  });

  it('biên: tổng đúng 499 và 500 thì giữ nguyên chữ; 501 thì cắt xuống đúng 500 và có "…"', () => {
    const fixedLength = fixedDoiHo().length;
    // câu = phần cố định + " Lý do: " (8 ký tự) + chữ + "."
    const totalOf = (n: number) =>
      rescheduled({ via: 'DoiHo', lyDo: 'x'.repeat(n) });
    const fit499 = totalOf(499 - fixedLength - 9);
    const fit500 = totalOf(500 - fixedLength - 9);
    const over501 = totalOf(501 - fixedLength - 9);
    expect(fit499).toHaveLength(499);
    expect(fit499).not.toContain('…');
    expect(fit500).toHaveLength(500);
    expect(fit500).not.toContain('…');
    expect(over501).toHaveLength(500);
    expect(over501.endsWith('x….')).toBe(true);
  });

  it('chữ tự do dài 1000 ký tự vẫn ra ≤ 500', () => {
    expect(
      rescheduled({ via: 'DoiHo', lyDo: 'ă'.repeat(1000) }).length,
    ).toBeLessThanOrEqual(NOTIFICATION_MAX_LENGTH);
    expect(
      request(REQUEST_REJECTED, { ghiChu: 'ă'.repeat(1000) }).length,
    ).toBeLessThanOrEqual(NOTIFICATION_MAX_LENGTH);
  });

  it('emoji (cặp thay thế) đúng ở chỗ cắt: không còn nửa cặp nào; emoji nằm trọn trong phần giữ thì được giữ', () => {
    const fixedLength = fixedDoiHo().length;
    // kept = (500 − (fixed + 9) − 1) đơn vị chữ tự do... tính từ biên: ngân sách = 500 − (fixedLength + 8) − 1, phần giữ = ngân sách − 1
    const kept = 500 - (fixedLength + 8) - 1 - 1;
    const split = rescheduled({
      via: 'DoiHo',
      lyDo: `${'a'.repeat(kept - 1)}😀${'b'.repeat(40)}`,
    });
    expect(split).toHaveLength(fixedLength + 8 + (kept - 1) + 1 + 1);
    expect(split).not.toMatch(LONE_SURROGATE);
    expect(split.endsWith(`${'a'.repeat(kept - 1)}….`)).toBe(true);

    const whole = rescheduled({
      via: 'DoiHo',
      lyDo: `${'a'.repeat(kept - 2)}😀${'b'.repeat(40)}`,
    });
    expect(whole).not.toMatch(LONE_SURROGATE);
    expect(whole.endsWith(`${'a'.repeat(kept - 2)}😀….`)).toBe(true);
    expect(whole).toHaveLength(500);
  });

  it('chữ có dấu tổ hợp (NFD) vẫn đếm đúng đơn vị: tổng ≤ 500', () => {
    const nfd = 'ế'.repeat(200);
    expect(rescheduled({ via: 'DoiHo', lyDo: nfd }).length).toBeLessThanOrEqual(
      NOTIFICATION_MAX_LENGTH,
    );
  });
});

describe('BDL-04 chữ người nhập lưu nguyên và là MỘT dòng (thoát HTML là việc của mẫu thư)', () => {
  const HOSTILE = '<script>alert(1)</script> & " \'';

  it('ghi chú và lý do có `<script>`, `&`, dấu nháy: lưu NGUYÊN trong `noi_dung`', () => {
    expect(rescheduled({ via: 'DoiHo', lyDo: HOSTILE })).toContain(
      `Lý do: ${HOSTILE}.`,
    );
    expect(request(REQUEST_REJECTED, { ghiChu: HOSTILE })).toContain(
      `Ghi chú: ${HOSTILE}.`,
    );
  });

  it('xuống dòng, tab, NUL, U+2028 trong chữ người nhập ⇒ một dòng, không ký tự điều khiển', () => {
    const messy = 'dòng một\r\ndòng hai\tcột\u0000ba bốn';
    for (const text of [
      rescheduled({ via: 'DoiHo', lyDo: messy }),
      request(REQUEST_APPROVED, { ghiChu: messy, maLichHenMoi: MA_MOI }),
      request(REQUEST_REJECTED, { ghiChu: messy }),
    ]) {
      expect(text).not.toMatch(CONTROL_OR_LINE_BREAK);
      expect(text).toContain('dòng một dòng hai cột ba bốn');
    }
  });

  it('tên bác sĩ và chi nhánh có xuống dòng cũng thành một dòng', () => {
    const text = rescheduled(
      {},
      contextOf({ tenBacSi: 'Nguyễn\nThị\tHương', chiNhanh: 'CLINIX\r\nQ.3' }),
    );
    expect(text).not.toMatch(CONTROL_OR_LINE_BREAK);
    expect(text).toContain('bác sĩ Nguyễn Thị Hương, CLINIX Q.3.');
  });
});
