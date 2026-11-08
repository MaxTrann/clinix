import { ApiError } from '../../../shared/api/errors';
import {
  absencesLabel,
  accountStatusLabel,
  formatVietnamDate,
} from './lookup-labels';
import { lookupErrorMessage, resultCountLabel } from './lookup-messages';

// patient F8 (TRACKING F8-G, F8-I): nhãn, ngày giờ Việt Nam và câu theo mã lỗi. Mã ca LV-nn là [đề xuất].
afterEach(() => vi.unstubAllEnvs());

describe('accountStatusLabel', () => {
  it('LV-33 Q18 chỉ `NgungHoatDong` có nhãn "Ngừng hoạt động"; `DangHoatDong` và mã lạ không nhãn', () => {
    expect(accountStatusLabel('NgungHoatDong')).toBe('Ngừng hoạt động');
    expect(accountStatusLabel('DangHoatDong')).toBeNull();
    expect(accountStatusLabel('MaLa')).toBeNull();
    expect(accountStatusLabel('')).toBeNull();
  });
});

describe('formatVietnamDate', () => {
  it('LV-34 Q18 `2026-11-07T17:30:00.000Z` ⇒ 08/11/2026 (00:30 giờ Việt Nam), KHÔNG cắt 10 ký tự đầu', () => {
    expect(formatVietnamDate('2026-11-07T17:30:00.000Z')).toBe('08/11/2026');
    expect('2026-11-07T17:30:00.000Z'.slice(0, 10)).toBe('2026-11-07');
  });

  it.each([
    ['2026-11-07T16:59:59.999Z', '07/11/2026'],
    ['2026-11-07T17:00:00.000Z', '08/11/2026'],
    ['2026-12-31T17:00:00.000Z', '01/01/2027'],
    ['2026-02-28T16:59:59.999Z', '28/02/2026'],
    ['2028-02-28T17:00:00.000Z', '29/02/2028'],
    ['2026-01-01T05:00:00.000Z', '01/01/2026'],
  ])('LV-35 Q18 biên nửa đêm giờ Việt Nam: %s ⇒ %s', (iso, expected) => {
    expect(formatVietnamDate(iso)).toBe(expected);
  });

  it('LV-36 Q18 thời điểm có phần dư mili giây và không có mili giây đều đúng', () => {
    expect(formatVietnamDate('2026-11-07T17:30:00Z')).toBe('08/11/2026');
    expect(formatVietnamDate('2026-11-07T17:30:00.123Z')).toBe('08/11/2026');
  });

  // Hàm không phụ thuộc múi giờ của máy chạy test. Bộ định dạng được tạo ở MỨC MODULE, lúc nạp: đặt TZ rồi nạp lại module (như F7), để
  // bản thiếu `timeZone` (dùng múi giờ máy) cũng bị bắt kể cả khi máy chạy test đang ở Việt Nam.
  it.each([
    'Asia/Ho_Chi_Minh',
    'UTC',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
  ])('LV-37 Q18 máy chạy ở múi giờ %s vẫn ra 08/11/2026', async (zone) => {
    vi.stubEnv('TZ', zone);
    vi.resetModules();
    const fresh = await import('./lookup-labels');
    expect(fresh.formatVietnamDate('2026-11-07T17:30:00.000Z')).toBe(
      '08/11/2026',
    );
    expect(fresh.formatVietnamDate('2026-11-07T16:59:59.999Z')).toBe(
      '07/11/2026',
    );
  });
});

describe('absencesLabel và resultCountLabel', () => {
  it('LV-38 Q18 "Số lần vắng khám" hiện "N lần"; "N kết quả" theo số tổng', () => {
    expect(absencesLabel(0)).toBe('0 lần');
    expect(absencesLabel(12)).toBe('12 lần');
    expect(resultCountLabel(1)).toBe('1 kết quả');
    expect(resultCountLabel(135)).toBe('135 kết quả');
  });
});

describe('lookupErrorMessage', () => {
  const api = (maLoi: string, loi?: { truong: string; ma: string }[]) =>
    new ApiError(400, { maLoi, thongBao: 'câu của API', loi });

  it('LV-39 Q22 400 TU_KHOA_KHONG_HOP_LE ⇒ "Nhập ít nhất 2 ký tự để tìm kiếm."; 403 và 404 có câu riêng (PLAN 5.9)', () => {
    expect(
      lookupErrorMessage(
        api('DU_LIEU_KHONG_HOP_LE', [
          { truong: 'q', ma: 'TU_KHOA_KHONG_HOP_LE' },
        ]),
      ),
    ).toBe('Nhập ít nhất 2 ký tự để tìm kiếm.');
    expect(lookupErrorMessage(api('KHONG_DU_QUYEN'))).toBe(
      'Bạn không có quyền thực hiện thao tác này.',
    );
    expect(lookupErrorMessage(api('KHONG_TIM_THAY'))).toBe(
      'Không tìm thấy bệnh nhân.',
    );
  });

  it('LV-40 Q22 mã khác, lỗi 400 của ô khác, lỗi không phải ApiError ⇒ null (dùng câu chung kèm "Thử lại")', () => {
    expect(lookupErrorMessage(api('LOI_HE_THONG'))).toBeNull();
    expect(
      lookupErrorMessage(
        api('DU_LIEU_KHONG_HOP_LE', [{ truong: 'page', ma: 'KHAC' }]),
      ),
    ).toBeNull();
    expect(lookupErrorMessage(api('DU_LIEU_KHONG_HOP_LE'))).toBeNull();
    expect(lookupErrorMessage(new Error('x'))).toBeNull();
    expect(lookupErrorMessage(null)).toBeNull();
  });
});
