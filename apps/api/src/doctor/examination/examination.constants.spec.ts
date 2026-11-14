import {
  BOOKING_ERROR_CODES,
  BOOKING_NOTIFICATION_EVENTS,
} from '../../appointments/appointments.constants.js';
import {
  COMMON_ERROR_CODES,
  ERROR_CODE_PATTERN,
} from '../../common/errors/error-codes.js';
import { APPROVAL_ERROR_CODES } from '../leave-approval/admin-leave.constants.js';
import { LEAVE_ERROR_CODES } from '../leave-requests/leave-request.constants.js';
import {
  EXAM_ERROR_CODES,
  EXAM_FIELD_ERROR_CODES,
  EXAM_NOTIFICATION_EVENTS,
  EXAM_TEXT_MAX_LENGTH,
  FOLLOW_UP_MAX_DAYS,
  HIDE_REASON_MAX_LENGTH,
  HIDE_REASON_MIN_LENGTH,
  NOTIFICATION_MAX_LENGTH,
  RATING_COMMENT_MAX_LENGTH,
  RATING_MAX,
  RATING_MIN,
} from './examination.constants.js';

// doctor-exam P3 (#393) — hằng của phần khám bệnh. Không có mã test case riêng trong PLAN (hỗ trợ): chặn gõ sai mã lỗi ở PLAN 5.14 (Frontend chọn thông báo theo MÃ),
// mã mới trùng mã của module khác (hai nghĩa một chuỗi), và chuẩn bị cho HDK-06 (loại sự kiện mới KHÁC bốn loại của booking nên worker thư của booking bỏ qua).
// Danh sách mong đợi viết RIÊNG ở đây theo PLAN 5.14, không đọc lại từ hằng. Giá trị `[đề xuất]` (Q2, Q7, Q8) KHÔNG khẳng định số cụ thể, chỉ khẳng định quan hệ.
const EXPECTED_ERROR_CODES = [
  'KHONG_THE_GHI_HO_SO_KHAM',
  'HO_SO_KHAM_DA_THAY_DOI',
  'LICH_HEN_CHUA_HOAN_THANH',
  'DA_DANH_GIA',
  'DANH_GIA_DA_AN',
];
const EXPECTED_FIELD_CODES = [
  'BAT_BUOC',
  'QUA_DAI',
  'NGAY_KHONG_HOP_LE',
  'SO_SAO_BAT_BUOC',
  'SO_SAO_KHONG_HOP_LE',
  'LY_DO_BAT_BUOC',
  'LY_DO_QUA_NGAN',
  'LY_DO_QUA_DAI',
];

const values = (record: Record<string, string>) => Object.values(record);
/** Giá trị có ở cả hai nhóm mã. */
const shared = (a: Record<string, string>, b: Record<string, string>) =>
  values(a).filter((code) => values(b).includes(code));

describe('mã lỗi của phần khám bệnh (PLAN 5.14)', () => {
  it('đúng năm mã mới của bảng 5.14, không thừa không thiếu', () => {
    expect(values(EXAM_ERROR_CODES).toSorted()).toEqual(
      [...EXPECTED_ERROR_CODES].toSorted(),
    );
  });

  it('đúng tám mã trường của loi[].ma', () => {
    expect(values(EXAM_FIELD_ERROR_CODES).toSorted()).toEqual(
      [...EXPECTED_FIELD_CODES].toSorted(),
    );
  });

  it('mọi mã khớp mẫu mã ổn định (chữ HOA, số, gạch dưới, bắt đầu bằng chữ) và không mã nào lặp trong cùng nhóm', () => {
    for (const group of [EXAM_ERROR_CODES, EXAM_FIELD_ERROR_CODES]) {
      for (const code of values(group))
        expect(code).toMatch(ERROR_CODE_PATTERN);
      expect(new Set(values(group)).size).toBe(values(group).length);
    }
  });

  it('mã lỗi mới không trùng mã của booking, mã chung, nghỉ phép hay duyệt nghỉ phép (mỗi mã một nghĩa)', () => {
    for (const other of [
      BOOKING_ERROR_CODES,
      COMMON_ERROR_CODES,
      LEAVE_ERROR_CODES,
      APPROVAL_ERROR_CODES,
    ])
      expect(shared(EXAM_ERROR_CODES, other)).toEqual([]);
  });

  it('bộ so trùng thật sự bắt được: nhóm có chung một mã thì báo đúng mã đó (ca đột biến của chính bộ so)', () => {
    expect(shared({ A: 'DA_DANH_GIA', B: 'X' }, { C: 'DA_DANH_GIA' })).toEqual([
      'DA_DANH_GIA',
    ]);
    expect(shared({ A: 'X' }, { B: 'Y' })).toEqual([]);
  });
});

describe('sự kiện thông báo (PLAN 5.12; HDK-06 phần chuẩn bị)', () => {
  it('loại sự kiện hoàn thành ca khám khác cả bốn loại của booking (worker thư của booking chỉ quét bốn loại đó nên bỏ qua loại này)', () => {
    expect(Object.values(BOOKING_NOTIFICATION_EVENTS)).toHaveLength(4);
    expect(Object.values(BOOKING_NOTIFICATION_EVENTS)).not.toContain(
      EXAM_NOTIFICATION_EVENTS.COMPLETED,
    );
  });

  it('vừa cột thong_bao.loai_su_kien (varchar 100), viết dạng PascalCase như các loại của booking', () => {
    const event: string = EXAM_NOTIFICATION_EVENTS.COMPLETED;
    expect(event.length).toBeGreaterThan(0);
    expect(event.length).toBeLessThanOrEqual(100);
    expect(event).toMatch(/^[A-Z][A-Za-z]+$/);
  });
});

describe('giới hạn (quan hệ với schema, không khẳng định số [đề xuất])', () => {
  it('số sao đúng CHECK chk_danh_gia_so_sao (1 đến 5) và nội dung thông báo đúng varchar(500)', () => {
    expect([RATING_MIN, RATING_MAX]).toEqual([1, 5]);
    expect(NOTIFICATION_MAX_LENGTH).toBe(500);
  });

  it('lý do ẩn: nhỏ nhất ≥ 1, nhỏ nhất ≤ lớn nhất, lớn nhất ≤ 255 (cột ly_do_an là varchar(255))', () => {
    expect(HIDE_REASON_MIN_LENGTH).toBeGreaterThanOrEqual(1);
    expect(HIDE_REASON_MIN_LENGTH).toBeLessThanOrEqual(HIDE_REASON_MAX_LENGTH);
    expect(HIDE_REASON_MAX_LENGTH).toBeLessThanOrEqual(255);
  });

  it('chữ hồ sơ và nhận xét: dương, và dù toàn ký tự 4 byte vẫn vừa cột text (65.535 byte); ngày tái khám tối đa là số nguyên dương', () => {
    for (const limit of [EXAM_TEXT_MAX_LENGTH, RATING_COMMENT_MAX_LENGTH]) {
      expect(Number.isInteger(limit)).toBe(true);
      expect(limit).toBeGreaterThan(0);
      expect(limit * 4).toBeLessThanOrEqual(65_535);
    }
    expect(Number.isInteger(FOLLOW_UP_MAX_DAYS)).toBe(true);
    expect(FOLLOW_UP_MAX_DAYS).toBeGreaterThan(0);
  });
});
