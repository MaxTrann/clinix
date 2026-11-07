import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  failureOf,
  snapshotTables,
} from '../testing/profile-update-helpers.js';
import {
  detailsOf,
  expectLocksReleased,
  expectOtherRowsUnchanged,
  appointmentAt,
} from '../testing/relatives-deactivate-helpers.js';
import {
  insertRelativeRow,
  removePatientRows,
  storedRows,
  UNTOUCHED_TABLES,
  withAutoIncrement,
} from '../testing/relatives-helpers.js';
import {
  changedStoredColumns,
  expectAppException,
  storedRow,
  useProcessTimeZone,
  useRelativesIntegration,
} from '../testing/relatives-update-helpers.js';
import { RelativesRepository } from './relatives.repository.js';

// Task B5 — POST …/deactivate ở tầng dịch vụ và kho trên MySQL 8.4 THẬT: chỉ MỘT cột của MỘT hàng đổi, lịch hẹn không bị đụng, tập trạng thái chặn, thứ tự và nội dung của `chiTiet`,
// idempotent, không lộ sự tồn tại, hoàn tác và khoá đã nhả, id BIGINT lớn hơn 2^53, múi giờ tiến trình. Đua nhau và khoá: ...deactivate.concurrency.int-spec.ts.
// HTTP thật: test/patient-relatives-deactivate.e2e-spec.ts. Mã ca RDI-nn là [đề xuất] (TRACKING patient B5-G). Dữ liệu cá nhân giả (đuôi .invalid), không CCCD thật.
const repository = new RelativesRepository();
const ctx = useRelativesIntegration(repository);

const activeRelative = (owner: string, hoTen = 'Tên Gốc Giả') =>
  insertRelativeRow(ctx.db, owner, { hoTen, active: true });
const stoppedRelative = (owner: string, hoTen = 'Đã ngừng sẵn') =>
  insertRelativeRow(ctx.db, owner, { hoTen, active: false });
// Giờ Việt Nam (+07:00) cho các khung giờ của một ngày; ISO UTC tương ứng nhỏ hơn 7 giờ
const at = (hhmm: string) => `2026-11-02T${hhmm}:00+07:00`;
const iso = (value: string) => new Date(value).toISOString();
const DONE = { trangThaiHieuLuc: false };
const BLOCKING: TrangThaiLichHen[] = ['ChoThanhToan', 'DaXacNhan', 'DaTiepDon'];
const DETAIL_KEYS = ['bacSi', 'chiNhanh', 'maLichHen', 'thoiGian', 'trangThai'];

describe('RelativesService.deactivate trên MySQL thật', () => {
  it('RDI-01 (NT-10, QP-06) không lịch ⇒ 200; hàng sau so với trước chỉ khác ĐÚNG cột trang_thai_hieu_luc (1 ⇒ 0); hồ sơ khác của cùng người, của người khác và bảng khác không đổi; số hàng không đổi; khoá đã nhả', async () => {
    const owner = await ctx.newPatient();
    const other = await ctx.newPatient();
    const id = await activeRelative(owner);
    await activeRelative(owner, 'Anh chị em cùng chủ');
    await stoppedRelative(owner);
    await insertRelativeRow(ctx.db, other, {
      hoTen: 'Của người khác',
      active: true,
    });
    const before = await storedRows(ctx.db);
    const beforeRow = await storedRow(ctx.db, id);
    const snapshot = await snapshotTables(ctx.db, UNTOUCHED_TABLES);

    const result = await ctx.service.deactivate(owner, id);

    expect(result).toStrictEqual(DONE);
    const after = await storedRows(ctx.db);
    expect(after).toHaveLength(before.length);
    const afterRow = await storedRow(ctx.db, id);
    expect(changedStoredColumns(beforeRow, afterRow)).toEqual([
      'trang_thai_hieu_luc',
    ]);
    expect(beforeRow.trang_thai_hieu_luc).toBe(1);
    expect(afterRow.trang_thai_hieu_luc).toBe(0);
    expectOtherRowsUnchanged(before, after, id);
    expect(await snapshotTables(ctx.db, UNTOUCHED_TABLES)).toEqual(snapshot);
    await expectLocksReleased(ctx.db, owner, id);
  });

  it('RDI-02 (NT-11) chỉ có lịch HoanThanh, DaHuy, VangMat, DaDoiLich ⇒ 200 và hồ sơ ngừng; SELECT * FROM lich_hen trước và sau GIỐNG HỆT từng cột (ngừng không đụng lịch hẹn cũ)', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const past: TrangThaiLichHen[] = [
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ];
    for (const [index, trangThai] of past.entries()) {
      await appointmentAt(ctx.fx, owner, id, trangThai, {
        thoiGian: at(['07:00', '08:00', '09:00', '10:00'][index] ?? '11:00'),
      });
    }
    const lichHen = await snapshotTables(ctx.db, ['lich_hen']);
    expect(lichHen[0]).toHaveLength(4);

    const result = await ctx.service.deactivate(owner, id);

    expect(result).toStrictEqual(DONE);
    expect((await storedRow(ctx.db, id)).trang_thai_hieu_luc).toBe(0);
    expect(await snapshotTables(ctx.db, ['lich_hen'])).toEqual(lichHen);
  });

  it.each(BLOCKING)(
    'RDI-03 (NT-12, Q11) đúng một lịch %s ⇒ 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN; chiTiet có ĐÚNG lịch đó với đúng năm khoá và đúng giá trị (mã lịch, ISO UTC, trạng thái, tên bác sĩ, tên chi nhánh); hồ sơ vẫn hiệu lực; lich_hen không đổi; khoá đã nhả',
    async (trangThai) => {
      const owner = await ctx.newPatient();
      const id = await activeRelative(owner);
      const made = await appointmentAt(ctx.fx, owner, id, trangThai, {
        thoiGian: at('08:00'),
        doctorName: 'Bác Sĩ Chữa Thử',
        branchName: `Chi nhánh Thử ${trangThai}`,
      });
      const before = await storedRow(ctx.db, id);
      const lichHen = await snapshotTables(ctx.db, ['lich_hen']);

      const error = await failureOf(() => ctx.service.deactivate(owner, id));

      expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN');
      const details = detailsOf(error) as Record<string, string>[];
      expect(details).toStrictEqual([
        {
          maLichHen: made.appointment.maLichHen,
          thoiGian: '2026-11-02T01:00:00.000Z',
          trangThai,
          bacSi: 'Bác Sĩ Chữa Thử',
          chiNhanh: `Chi nhánh Thử ${trangThai}`,
        },
      ]);
      expect(Object.keys(details[0] ?? {}).sort()).toEqual(DETAIL_KEYS);
      expect(await storedRow(ctx.db, id)).toStrictEqual(before);
      expect(await snapshotTables(ctx.db, ['lich_hen'])).toEqual(lichHen);
      await expectLocksReleased(ctx.db, owner, id);
    },
  );

  it('RDI-04 (NT-13, Q11) nhiều lịch chặn tạo KHÔNG theo thứ tự thời gian (và thứ tự thời gian NGƯỢC thứ tự enum) cộng lịch không chặn ⇒ chiTiet đủ mọi lịch chặn, sắp theo thời gian tăng dần (cùng giờ thì theo lich_hen_id), không có lịch không chặn', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const latest = await appointmentAt(ctx.fx, owner, id, 'ChoThanhToan', {
      thoiGian: at('10:00'),
    });
    const earliest = await appointmentAt(ctx.fx, owner, id, 'DaTiepDon', {
      thoiGian: at('08:00'),
    });
    const middle = await appointmentAt(ctx.fx, owner, id, 'DaXacNhan', {
      thoiGian: at('09:00'),
    });
    // Cùng giờ với `earliest` nhưng tạo SAU (lich_hen_id lớn hơn)
    const sameTime = await appointmentAt(ctx.fx, owner, id, 'DaXacNhan', {
      thoiGian: at('08:00'),
    });
    // Hai lịch không chặn, sớm hơn mọi lịch chặn: nếu lọt vào thì đứng đầu
    await appointmentAt(ctx.fx, owner, id, 'HoanThanh', {
      thoiGian: at('07:00'),
    });
    await appointmentAt(ctx.fx, owner, id, 'DaDoiLich', {
      thoiGian: at('07:30'),
    });

    const error = await failureOf(() => ctx.service.deactivate(owner, id));

    expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN');
    const codes = (detailsOf(error) as { maLichHen: string }[]).map(
      (d) => d.maLichHen,
    );
    expect(codes).toEqual([
      earliest.appointment.maLichHen,
      sameTime.appointment.maLichHen,
      middle.appointment.maLichHen,
      latest.appointment.maLichHen,
    ]);
    expect((await storedRow(ctx.db, id)).trang_thai_hieu_luc).toBe(1);
  });

  it('RDI-05 (NT-14) lịch chặn của BẢN THÂN (ho_so_nguoi_than_id NULL), của người thân KHÁC cùng Bệnh nhân và của Bệnh nhân khác ⇒ KHÔNG chặn hồ sơ đang ngừng ⇒ 200; các hồ sơ và lịch kia không đổi', async () => {
    const owner = await ctx.newPatient();
    const other = await ctx.newPatient();
    const target = await activeRelative(owner, 'Hồ sơ cần ngừng');
    const sibling = await activeRelative(owner, 'Người thân khác');
    const othersRelative = await activeRelative(other, 'Của người khác');
    await appointmentAt(ctx.fx, owner, null, 'DaXacNhan', {
      thoiGian: at('08:00'),
    });
    await appointmentAt(ctx.fx, owner, sibling, 'DaTiepDon', {
      thoiGian: at('09:00'),
    });
    await appointmentAt(ctx.fx, other, null, 'ChoThanhToan', {
      thoiGian: at('10:00'),
    });
    await appointmentAt(ctx.fx, other, othersRelative, 'DaXacNhan', {
      thoiGian: at('11:00'),
    });
    const lichHen = await snapshotTables(ctx.db, ['lich_hen']);
    const siblingBefore = await storedRow(ctx.db, sibling);

    const result = await ctx.service.deactivate(owner, target);

    expect(result).toStrictEqual(DONE);
    expect((await storedRow(ctx.db, target)).trang_thai_hieu_luc).toBe(0);
    expect(await storedRow(ctx.db, sibling)).toStrictEqual(siblingBefore);
    expect(await snapshotTables(ctx.db, ['lich_hen'])).toEqual(lichHen);
  });

  it('RDI-06 (NT-15, Q10) ngừng hồ sơ đã ngừng ⇒ 200 { trangThaiHieuLuc: false }, mọi bảng giống hệt; kể cả hồ sơ đã ngừng (dữ liệu bất thường) còn lịch chặn ⇒ vẫn 200 không đụng gì (nhánh idempotent đứng trước nhánh lịch hẹn); làm lại lần nữa vẫn thế', async () => {
    const owner = await ctx.newPatient();
    const quiet = await stoppedRelative(owner);
    const odd = await stoppedRelative(owner, 'Đã ngừng nhưng còn lịch');
    await appointmentAt(ctx.fx, owner, odd, 'DaXacNhan', {
      thoiGian: at('08:00'),
    });
    const rows = await storedRows(ctx.db);
    const tables = await snapshotTables(ctx.db, UNTOUCHED_TABLES);

    const first = await ctx.service.deactivate(owner, quiet);
    const second = await ctx.service.deactivate(owner, quiet);
    const third = await ctx.service.deactivate(owner, odd);

    expect([first, second, third]).toStrictEqual([DONE, DONE, DONE]);
    expect(await storedRows(ctx.db)).toStrictEqual(rows);
    expect(await snapshotTables(ctx.db, UNTOUCHED_TABLES)).toEqual(tables);
    await expectLocksReleased(ctx.db, owner, quiet);
  });

  it('RDI-07 (NT-16) lỗi giả lập SAU khi đã khoá, trước UPDATE ⇒ lời gọi từ chối đúng lỗi đó; hoàn tác (hồ sơ vẫn hiệu lực, lịch hẹn và bảng khác nguyên); không khoá treo', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const before = await storedRow(ctx.db, id);
    const tables = await snapshotTables(ctx.db, UNTOUCHED_TABLES);
    const failure = new Error('giả lập: mất kết nối sau khi đã khoá');
    vi.spyOn(repository, 'deactivateRelative').mockRejectedValueOnce(failure);

    const error = await failureOf(() => ctx.service.deactivate(owner, id));

    expect(error).toBe(failure);
    expect(await storedRow(ctx.db, id)).toStrictEqual(before);
    expect(await snapshotTables(ctx.db, UNTOUCHED_TABLES)).toEqual(tables);
    await expectLocksReleased(ctx.db, owner, id);
    // Sau lỗi, lần gọi thật kế tiếp vẫn thành công (giao dịch không bị kẹt)
    expect(await ctx.service.deactivate(owner, id)).toStrictEqual(DONE);
  });

  it('RDI-08 UPDATE báo 0 hàng khớp (không thể xảy ra khi đang giữ khoá) ⇒ Error thường (không AppException), hoàn tác, hồ sơ vẫn hiệu lực, khoá đã nhả', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const before = await storedRow(ctx.db, id);
    vi.spyOn(repository, 'deactivateRelative').mockResolvedValueOnce(0);

    const error = await failureOf(() => ctx.service.deactivate(owner, id));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(await storedRow(ctx.db, id)).toStrictEqual(before);
    await expectLocksReleased(ctx.db, owner, id);
  });

  const notMine = [
    {
      label: 'id không tồn tại',
      prepare: async (owner: string) => ({ caller: owner, id: '99999' }),
    },
    {
      label: 'hồ sơ ĐANG DÙNG của Bệnh nhân khác',
      prepare: async (owner: string) => {
        const other = await ctx.newPatient();
        return { caller: owner, id: await activeRelative(other, 'Của B') };
      },
    },
    {
      label: 'hồ sơ ĐÃ NGỪNG của Bệnh nhân khác',
      prepare: async (owner: string) => {
        const other = await ctx.newPatient();
        return { caller: owner, id: await stoppedRelative(other, 'Của B') };
      },
    },
    {
      label: 'tài khoản không có dòng benh_nhan',
      prepare: async () => {
        const orphan = await ctx.newPatient();
        await removePatientRows(ctx.db, orphan);
        return { caller: orphan, id: '1' };
      },
    },
  ];

  it.each(notMine)(
    'RDI-09 (NT-08, QP-06, H3) $label ⇒ 404 KHONG_TIM_THAY CÙNG thân; DB không đổi; khoá đã nhả',
    async ({ prepare }) => {
      const owner = await ctx.newPatient();
      await activeRelative(owner, 'Hồ sơ của người gọi');
      const { caller, id } = await prepare(owner);
      const rows = await storedRows(ctx.db);
      const tables = await snapshotTables(ctx.db, UNTOUCHED_TABLES);

      const error = await failureOf(() => ctx.service.deactivate(caller, id));

      expectAppException(error, 404, 'KHONG_TIM_THAY');
      expect((error as AppException).getResponse()).toStrictEqual({
        maLoi: 'KHONG_TIM_THAY',
        thongBao: 'Không tìm thấy dữ liệu.',
      });
      expect(await storedRows(ctx.db)).toStrictEqual(rows);
      expect(await snapshotTables(ctx.db, UNTOUCHED_TABLES)).toEqual(tables);
      await expectLocksReleased(ctx.db, caller, id);
    },
  );

  it('RDI-10 (NT-08, NT-12) id BIGINT lớn hơn 2^53: ngừng đúng …993 mà không đụng …992; cả nhánh 409 chỉ thấy lịch của đúng hồ sơ …993 (id đi bằng chuỗi, không qua Number)', async () => {
    await withAutoIncrement(ctx.db, '9007199254740992', async () => {
      const owner = await ctx.newPatient();
      const r92 = await activeRelative(owner, 'Hồ sơ …992');
      const r93 = await activeRelative(owner, 'Hồ sơ …993');
      expect([r92, r93]).toEqual(['9007199254740992', '9007199254740993']);
      const made = await appointmentAt(ctx.fx, owner, r93, 'DaXacNhan', {
        thoiGian: at('08:00'),
      });

      // …992 không có lịch: ngừng được, và lịch của …993 không làm nó bị chặn
      expect(await ctx.service.deactivate(owner, r92)).toStrictEqual(DONE);
      expect((await storedRow(ctx.db, r92)).trang_thai_hieu_luc).toBe(0);
      expect((await storedRow(ctx.db, r93)).trang_thai_hieu_luc).toBe(1);

      const error = await failureOf(() => ctx.service.deactivate(owner, r93));

      expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN');
      expect(
        (detailsOf(error) as { maLichHen: string }[]).map((d) => d.maLichHen),
      ).toEqual([made.appointment.maLichHen]);
      expect((await storedRow(ctx.db, r93)).trang_thai_hieu_luc).toBe(1);
    });
  });
});

// Đổi múi giờ CỦA TIẾN TRÌNH (không chỉ của MySQL): `thoiGian` trong `chiTiet` phải vẫn là cùng một thời điểm ISO UTC.
describe('RelativesService.deactivate với múi giờ tiến trình America/New_York', () => {
  useProcessTimeZone('America/New_York');

  it('RDI-11 (NT-12) thoiGian của lịch chặn vẫn là đúng mốc ISO UTC của khung giờ 08:00 +07:00', async () => {
    // Đảm bảo ca không "xanh giả": múi giờ phải thật sự là New York (UTC-5 vào tháng 11, offset 300 phút)
    expect(new Date('2026-11-06T12:00:00Z').getTimezoneOffset()).toBe(300);
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    await appointmentAt(ctx.fx, owner, id, 'DaXacNhan', {
      thoiGian: at('08:00'),
    });

    const error = await failureOf(() => ctx.service.deactivate(owner, id));

    expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN');
    expect(
      (detailsOf(error) as { thoiGian: string }[]).map((d) => d.thoiGian),
    ).toEqual([iso(at('08:00'))]);
  });
});
