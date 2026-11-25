import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOOKING_NOTIFICATION_EVENTS,
  RESCHEDULE_NOTIFICATION_EVENTS,
} from '../../appointments/appointments.constants.js';
import { MAIL_EVENTS } from '../../appointments/notifications/email-outbox.query.js';
import { baseEventOf } from '../../appointments/notifications/email-outbox.service.js';
import { NOTIFICATION_MAX_LENGTH as BOOKING_MAX } from '../../appointments/notifications/notification-text.js';
import { LOAI_TAI_KHOAN } from '../../auth/entities/enums.js';
import {
  EXAM_NOTIFICATION_EVENTS,
  NOTIFICATION_MAX_LENGTH as EXAM_MAX,
} from '../../doctor/examination/examination.constants.js';
import {
  LEAVE_EVENTS,
  LEAVE_NOTIFICATION_MAX_LENGTH,
} from '../../doctor/notifications/leave-notifier.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { TOPUP_NOTIFICATION_EVENTS } from '../../payment/payment.constants.js';
import {
  NOTIFICATION_MAX_LENGTH as WALLET_MAX,
  REFUND_NOTIFICATION_EVENTS,
  WITHDRAWAL_NOTIFICATION_EVENTS,
} from '../../wallet/wallet.constants.js';
import { BRANCH_CHANGE_EVENTS } from '../branch-change-events.js';
import { THONG_BAO_MAX_LENGTH } from '../branch-change-text.js';
import {
  CHO_MODULE,
  DEFAULT_TITLE,
  EVENT_CODE_MAX,
  NOTIFICATION_CATALOG,
  NOTIFICATION_CONTENT_MAX,
  TITLE_MAX,
  baseCodeOf,
  findCatalogEntry,
} from './notification-catalog.js';

// notification B1 — danh mục mã sự kiện: DMS-01…DMS-07, DMS-13 (đối chiếu với hằng của module ghi), HTB-07 (chiều phụ thuộc).
// Hằng của module khác CHỈ được import ở file spec này, không ở mã chạy của danh mục.

/** Tám tập hằng mã của các nơi ghi `thong_bao` (PLAN 5.3 kể bảy; reschedule B3 thêm tập thứ tám). */
const SOURCE_EVENT_SETS = {
  BOOKING_NOTIFICATION_EVENTS,
  RESCHEDULE_NOTIFICATION_EVENTS,
  EXAM_NOTIFICATION_EVENTS,
  LEAVE_EVENTS,
  TOPUP_NOTIFICATION_EVENTS,
  WITHDRAWAL_NOTIFICATION_EVENTS,
  REFUND_NOTIFICATION_EVENTS,
  BRANCH_CHANGE_EVENTS,
} as const;

/** Hằng `*_EVENTS` khác đã biết: tập con hay hợp của tám tập trên, phục vụ worker thư, không phải nguồn mã mới. */
const KNOWN_DERIVED_SETS = [
  'MAIL_EVENTS',
  'PAYMENT_MAIL_EVENTS',
  'BRANCH_CHANGE_MAIL_EVENTS',
  'EXAM_MAIL_EVENTS', // notification B4: bản chữ của EXAM_NOTIFICATION_EVENTS cho worker thư
];

const sourceCodes: string[] = Object.values(SOURCE_EVENT_SETS).flatMap((set) =>
  Object.values(set),
);
const catalogCodes = NOTIFICATION_CATALOG.map((entry) => entry.ma);
const API_SRC = fileURLToPath(new URL('../../', import.meta.url));

describe('DMS-01 mọi mã của tám nơi ghi đều có trong danh mục', () => {
  it.each(Object.entries(SOURCE_EVENT_SETS))('%s', (_name, set) => {
    const missing = Object.values(set).filter(
      (code) => !catalogCodes.includes(code),
    );
    // Thiếu thì báo đúng mã thiếu để người sửa biết khai mục nào
    expect(missing).toEqual([]);
  });
});

describe('DMS-02 không có mục "CoMa" mồ côi', () => {
  it('mỗi mục CoMa có trong một tập hằng của module nguồn', () => {
    const orphans = NOTIFICATION_CATALOG.filter(
      (entry) => entry.trangThai === 'CoMa' && !sourceCodes.includes(entry.ma),
    ).map((entry) => entry.ma);
    expect(orphans).toEqual([]);
  });

  it('mục ChoModule được phép chưa có hằng (LichHenDaTiepDon chờ notification B6)', () => {
    const waiting = NOTIFICATION_CATALOG.filter(
      (entry) => entry.trangThai === 'ChoModule',
    ).map((entry) => entry.ma);
    expect(waiting).toEqual(['LichHenDaTiepDon']);
  });
});

describe('DMS-03 mã duy nhất và đúng dạng', () => {
  it('không trùng kể cả khi so không phân biệt hoa thường (collation utf8mb4_unicode_ci)', () => {
    const lower = catalogCodes.map((code) => code.toLowerCase());
    expect(new Set(lower).size).toBe(catalogCodes.length);
  });

  it('PascalCase ASCII, không chứa dấu ":" (hậu tố chỉ gắn lúc ghi)', () => {
    for (const code of catalogCodes) expect(code).toMatch(/^[A-Z][A-Za-z]+$/);
  });

  it('≤ 100 ký tự kể cả hậu tố phiên bản (ca biên: chừa chỗ cho ":v999999")', () => {
    for (const entry of NOTIFICATION_CATALOG) {
      const longest = entry.coPhienBan ? `${entry.ma}:v999999` : entry.ma;
      expect(longest.length).toBeLessThanOrEqual(EVENT_CODE_MAX);
    }
  });

  it('cờ coPhienBan đúng bốn mã có phiên bản của admin C4', () => {
    const versioned = NOTIFICATION_CATALOG.filter((e) => e.coPhienBan)
      .map((e) => e.ma)
      .sort();
    expect(versioned).toEqual(
      [
        BRANCH_CHANGE_EVENTS.AFFECTED,
        BRANCH_CHANGE_EVENTS.RESCHEDULED,
        BRANCH_CHANGE_EVENTS.RESCHEDULE_RESULT,
        BRANCH_CHANGE_EVENTS.OVERDUE,
      ].sort(),
    );
  });
});

describe('DMS-04 tập "có thư" khớp MAIL_EVENTS của worker thư', () => {
  it('bằng nhau (hiện 18 loại sau notification B4; B5 nâng lên 21)', () => {
    const withMail = NOTIFICATION_CATALOG.filter((e) => e.coThu)
      .map((e) => e.ma)
      .sort();
    expect(withMail).toEqual([...MAIL_EVENTS].sort());
    expect(withMail).toHaveLength(18);
  });
});

describe('DMS-05 tiêu đề, nhóm, liên kết và người nhận hợp lệ', () => {
  const GROUPS = ['LichHen', 'DoiLich', 'NghiPhep', 'Vi', 'ChiNhanh'];
  const LINKS = ['LichHen', 'Vi', 'NghiPhep', 'ThayDoiChiNhanh', null];

  it.each(NOTIFICATION_CATALOG.map((e) => [e.ma, e] as const))(
    '%s',
    (_ma, entry) => {
      expect(entry.tieuDe.trim()).not.toBe('');
      expect(entry.tieuDe.length).toBeLessThanOrEqual(TITLE_MAX);
      // Không ký tự điều khiển, không xuống dòng
      expect(entry.tieuDe).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
      expect(GROUPS).toContain(entry.nhom);
      expect(LINKS).toContain(entry.lienKet);
      expect(entry.nguoiNhan.length).toBeGreaterThan(0);
      for (const role of entry.nguoiNhan)
        expect(LOAI_TAI_KHOAN).toContain(role);
    },
  );
});

describe('DMS-06 tra cứu theo mã đã lưu', () => {
  it('mã có hậu tố phiên bản ra mục gốc', () => {
    expect(findCatalogEntry('ThayDoiChiNhanhAnhHuongLichHen:v3')?.ma).toBe(
      'ThayDoiChiNhanhAnhHuongLichHen',
    );
  });

  it('mã không hậu tố ra đúng mục', () => {
    expect(findCatalogEntry('LichHenDaHuy')?.tieuDe).toBe('Lịch hẹn đã huỷ');
  });

  it.each(['MaLa', '', ':v1', 'lichhendahuy'])(
    'mã lạ "%s" ra null (người gọi dùng tiêu đề mặc định)',
    (code) => {
      expect(findCatalogEntry(code)).toBeNull();
    },
  );

  it('tiêu đề mặc định không rỗng', () => {
    expect(DEFAULT_TITLE).toBe('Thông báo');
  });

  it.each([
    'ThayDoiChiNhanhAnhHuongLichHen:v12',
    'LichHenDaXacNhan',
    'a:b:c',
    '',
  ])(
    'baseCodeOf("%s") cho cùng kết quả với baseEventOf của worker thư',
    (code) => {
      expect(baseCodeOf(code)).toBe(baseEventOf(code));
    },
  );
});

describe('DMS-07 năm hằng độ dài 500 của các module ghi bằng NOTIFICATION_CONTENT_MAX', () => {
  it.each([
    ['booking notification-text', BOOKING_MAX],
    ['doctor-exam', EXAM_MAX],
    ['doctor LEAVE_NOTIFICATION_MAX_LENGTH', LEAVE_NOTIFICATION_MAX_LENGTH],
    ['wallet', WALLET_MAX],
    ['admin THONG_BAO_MAX_LENGTH', THONG_BAO_MAX_LENGTH],
  ])('%s', (_name, max) => {
    // 500 = cột `thong_bao.noi_dung varchar(500)` của docs/database
    expect(max).toBe(NOTIFICATION_CONTENT_MAX);
    expect(NOTIFICATION_CONTENT_MAX).toBe(500);
  });
});

describe('DMS-13 nhắc khai mã khi module mới thêm sự kiện', () => {
  it('mục ChoModule chưa có hằng ở module nào (module thêm mã thì phải đổi sang CoMa)', () => {
    const shouldBeCoMa = NOTIFICATION_CATALOG.filter(
      (entry) =>
        entry.trangThai === 'ChoModule' && sourceCodes.includes(entry.ma),
    ).map((entry) => entry.ma);
    expect(shouldBeCoMa).toEqual([]);
  });

  it('không có hằng `*_EVENTS` nào ngoài các tập đã đối chiếu (waitlist, chat… thêm hằng thì khai vào danh mục và SOURCE_EVENT_SETS)', () => {
    const declared = listSourceFiles(API_SRC).flatMap((file) =>
      [
        ...stripComments(readSource(file)).matchAll(
          /export const (\w+_EVENTS)\b/g,
        ),
      ].map((match) => match[1]),
    );
    const known = [...Object.keys(SOURCE_EVENT_SETS), ...KNOWN_DERIVED_SETS];
    expect(declared.filter((name) => !known.includes(name))).toEqual([]);
  });

  it('các sự kiện chừa chỗ chưa có mã nên không nằm trong danh mục', () => {
    expect(CHO_MODULE.map((item) => item.module)).toEqual([
      'waitlist',
      'waitlist',
      'chat',
      'payment',
    ]);
  });
});

describe('HTB-07 chiều phụ thuộc', () => {
  it('mã chạy của notification/catalog không import module khác', () => {
    const files = listSourceFiles(join(API_SRC, 'notification', 'catalog'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const imports = [
        ...stripComments(readSource(file)).matchAll(/from\s+'([^']+)'/g),
      ].map((match) => match[1] ?? '');
      // Chỉ cho phép import trong chính thư mục catalog
      expect(imports.filter((path) => !path.startsWith('./'))).toEqual([]);
    }
  });

  it('mã chạy của appointments không import notification', () => {
    const offenders = listSourceFiles(join(API_SRC, 'appointments')).filter(
      (file) =>
        /from\s+'[^']*\/notification\//.test(stripComments(readSource(file))),
    );
    expect(offenders).toEqual([]);
  });
});
