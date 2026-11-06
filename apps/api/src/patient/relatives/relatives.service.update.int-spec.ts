import { vi } from 'vitest';
import { MOI_QUAN_HE_NGUOI_THAN } from '../../admin/entities/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
import { todayVN } from '../../common/time/time.js';
import {
  failureOf,
  snapshotTables,
} from '../testing/profile-update-helpers.js';
import {
  insertRelativeRow,
  RELATIVE_KEYS,
  storedRows,
  UNTOUCHED_TABLES,
  withAutoIncrement,
} from '../testing/relatives-helpers.js';
import {
  appointmentForRelative,
  changedStoredColumns,
  expectAppException,
  storedRow,
  UPDATE_A,
  UPDATE_B,
  UPDATED_COLUMNS,
  useProcessTimeZone,
  useRelativesIntegration,
} from '../testing/relatives-update-helpers.js';
import {
  RelativesRepository,
  type NewRelative,
} from './relatives.repository.js';

// Task B4 — PUT /patient/relatives/:id ở tầng dịch vụ và kho trên MySQL 8.4 THẬT: đúng năm cột đổi, bảng khác giữ nguyên, PUT giống hệt, hồ sơ đã ngừng,
// không lộ sự tồn tại, id BIGINT lớn hơn 2^53, sửa khi có lịch hẹn, ngày biên ở nhiều múi giờ, hoàn tác. Đua nhau và khoá: ...concurrency.int-spec.ts.
// HTTP thật: test/patient-relatives-update.e2e-spec.ts. Mã ca RUI-nn là [đề xuất] (TRACKING patient B4-G). Dữ liệu cá nhân giả (đuôi .invalid), không CCCD thật.
const repository = new RelativesRepository();
const ctx = useRelativesIntegration(repository);

const activeRelative = (owner: string, hoTen = 'Tên Gốc Giả') =>
  insertRelativeRow(ctx.db, owner, { hoTen, active: true });
// Hàng do insertRelativeRow chèn: Con, Nam, 2000-01-01, SĐT NULL (dia_chi NULL)
const ORIGINAL: NewRelative = {
  hoTen: 'Tên Gốc Giả',
  moiQuanHe: 'Con',
  gioiTinh: 'Nam',
  ngaySinh: '2000-01-01',
  soDienThoai: null,
};

function expect404Alike(errors: unknown[]): void {
  for (const error of errors) {
    expectAppException(error, 404, 'KHONG_TIM_THAY');
    expect((error as AppException).getResponse()).toStrictEqual(
      (errors[0] as AppException).getResponse(),
    );
  }
}

describe('RelativesService.update trên MySQL thật', () => {
  it('RUI-01 (NT-07, Q8) sửa hợp lệ hồ sơ của mình (có dia_chi sẵn): hàng sau so với trước chỉ khác ĐÚNG năm cột; benh_nhan_id, dia_chi, trang_thai_hieu_luc giữ nguyên; hồ sơ khác của cùng người và của người khác không đổi; bảng khác không đổi; số hàng không đổi', async () => {
    const owner = await ctx.newPatient();
    const other = await ctx.newPatient();
    const id = await activeRelative(owner);
    await ctx.db.query(
      "UPDATE ho_so_nguoi_than SET dia_chi = 'Địa chỉ cũ giả' WHERE ho_so_nguoi_than_id = ?",
      [id],
    );
    await activeRelative(owner, 'Anh chị em cùng chủ');
    await insertRelativeRow(ctx.db, other, {
      hoTen: 'Của người khác',
      active: true,
    });
    await insertRelativeRow(ctx.db, owner, {
      hoTen: 'Đã ngừng cùng chủ',
      active: false,
    });
    const before = await storedRows(ctx.db);
    const beforeRow = await storedRow(ctx.db, id);
    const snapshot = await snapshotTables(ctx.db, UNTOUCHED_TABLES);

    const result = await ctx.service.update(owner, id, UPDATE_A);

    const after = await storedRows(ctx.db);
    expect(after).toHaveLength(before.length);
    const afterRow = await storedRow(ctx.db, id);
    expect(changedStoredColumns(beforeRow, afterRow)).toEqual(UPDATED_COLUMNS);
    expect(afterRow).toStrictEqual({
      ho_so_nguoi_than_id: id,
      benh_nhan_id: owner,
      ho_ten: UPDATE_A.hoTen,
      ngay_sinh: UPDATE_A.ngaySinh,
      gioi_tinh: UPDATE_A.gioiTinh,
      dia_chi: 'Địa chỉ cũ giả',
      moi_quan_he: UPDATE_A.moiQuanHe,
      so_dien_thoai: UPDATE_A.soDienThoai,
      trang_thai_hieu_luc: 1,
    });
    expect(after.filter((r) => r.ho_so_nguoi_than_id !== id)).toStrictEqual(
      before.filter((r) => r.ho_so_nguoi_than_id !== id),
    );
    expect(await snapshotTables(ctx.db, UNTOUCHED_TABLES)).toEqual(snapshot);
    expect(Object.keys(result).sort()).toEqual(RELATIVE_KEYS);
    expect(result).toStrictEqual({
      hoSoNguoiThanId: id,
      ...UPDATE_A,
      trangThaiHieuLuc: true,
    });
  });

  it('RUI-02 (NT-07, bẫy 1) PUT GIỐNG HỆT dữ liệu cũ ⇒ thành công (không 404, không 409), làm lại vẫn thành công, dữ liệu nguyên; SQL thô báo [affectedRows, changedRows] = [1, 0] (khoá phụ thuộc cờ FOUND_ROWS của mysql2)', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const before = await storedRows(ctx.db);

    const first = await ctx.service.update(owner, id, ORIGINAL);
    const second = await ctx.service.update(owner, id, ORIGINAL);

    expect(second).toStrictEqual(first);
    expect(first).toStrictEqual({
      hoSoNguoiThanId: id,
      ...ORIGINAL,
      trangThaiHieuLuc: true,
    });
    expect(await storedRows(ctx.db)).toStrictEqual(before);
    // Cờ FOUND_ROWS: câu UPDATE không đổi gì vẫn "khớp" 1 hàng. Nếu ai tắt cờ này, affectedRows thành 0 và RUI-02 trên đây đỏ vì 404/409 oan
    const raw = await ctx.db.query<{
      affectedRows: number;
      changedRows: number;
    }>('UPDATE ho_so_nguoi_than SET ho_ten = ? WHERE ho_so_nguoi_than_id = ?', [
      ORIGINAL.hoTen,
      id,
    ]);
    expect([raw.affectedRows, raw.changedRows]).toEqual([1, 0]);
    expect(
      await ctx.db.transaction((em) =>
        repository.updateRelative(em, owner, id, ORIGINAL),
      ),
    ).toBe(1);
  });

  it('RUI-03 (NT-04) soDienThoai null xoá SĐT về NULL; từ NULL sang số; SĐT 10 số lưu nguyên', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);

    const withPhone = await ctx.service.update(owner, id, UPDATE_A);
    expect(withPhone.soDienThoai).toBe('0911000001');
    expect((await storedRow(ctx.db, id)).so_dien_thoai).toBe('0911000001');

    const cleared = await ctx.service.update(owner, id, {
      ...UPDATE_A,
      soDienThoai: null,
    });
    expect(cleared.soDienThoai).toBeNull();
    expect((await storedRow(ctx.db, id)).so_dien_thoai).toBeNull();

    const again = await ctx.service.update(owner, id, UPDATE_B);
    expect(again.soDienThoai).toBe('0922000002');
  });

  it('RUI-04 (NT-09) hồ sơ ĐÃ NGỪNG của chính mình ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG, bảng ho_so_nguoi_than không đổi', async () => {
    const owner = await ctx.newPatient();
    const id = await insertRelativeRow(ctx.db, owner, {
      hoTen: 'Đã ngừng',
      active: false,
    });
    const before = await storedRows(ctx.db);

    const error = await failureOf(() =>
      ctx.service.update(owner, id, UPDATE_A),
    );

    expectAppException(error, 409, 'HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(await storedRows(ctx.db)).toStrictEqual(before);
  });

  it('RUI-05 (NT-08, H3, bẫy 4) hồ sơ hiệu lực của Bệnh nhân khác, id không tồn tại, hồ sơ ĐÃ NGỪNG của Bệnh nhân khác ⇒ cả ba cùng AppException 404 KHONG_TIM_THAY với thân BẰNG NHAU từng chữ (ca thứ ba không ra 409); DB không đổi', async () => {
    const caller = await ctx.newPatient();
    const stranger = await ctx.newPatient();
    const activeOfStranger = await activeRelative(
      stranger,
      'Người lạ đang dùng',
    );
    const inactiveOfStranger = await insertRelativeRow(ctx.db, stranger, {
      hoTen: 'Người lạ đã ngừng',
      active: false,
    });
    const before = await storedRows(ctx.db);

    const errors = [
      await failureOf(() =>
        ctx.service.update(caller, activeOfStranger, UPDATE_A),
      ),
      await failureOf(() => ctx.service.update(caller, '424242', UPDATE_A)),
      await failureOf(() =>
        ctx.service.update(caller, inactiveOfStranger, UPDATE_A),
      ),
    ];

    expect404Alike(errors);
    expect(await storedRows(ctx.db)).toStrictEqual(before);
  });

  it('RUI-06 (bẫy 2) AUTO_INCREMENT 2^53 với ba hồ sơ …992, …993, …994: sửa …993 ⇒ chỉ …993 đổi, phản hồi hoSoNguoiThanId là chuỗi 9007199254740993', async () => {
    await withAutoIncrement(ctx.db, '9007199254740992', async () => {
      const owner = await ctx.newPatient();
      const ids = [
        await activeRelative(owner, 'H992'),
        await activeRelative(owner, 'H993'),
        await activeRelative(owner, 'H994'),
      ];
      expect(ids).toEqual([
        '9007199254740992',
        '9007199254740993',
        '9007199254740994',
      ]);

      const result = await ctx.service.update(owner, ids[1] ?? '', UPDATE_A);

      expect(result.hoSoNguoiThanId).toBe('9007199254740993');
      expect(
        (await storedRows(ctx.db, owner)).map((r) => [
          r.ho_so_nguoi_than_id,
          r.ho_ten,
        ]),
      ).toEqual([
        ['9007199254740992', 'H992'],
        ['9007199254740993', UPDATE_A.hoTen],
        ['9007199254740994', 'H994'],
      ]);
    });
  });

  it('RUI-06b (bẫy 2) id lớn nhất của BIGINT (9223372036854775807) sửa được và không đụng hồ sơ liền trước', async () => {
    await withAutoIncrement(ctx.db, '9223372036854775806', async () => {
      const owner = await ctx.newPatient();
      const before = await activeRelative(owner, 'M806');
      const max = await activeRelative(owner, 'M807');
      expect(max).toBe('9223372036854775807');

      const result = await ctx.service.update(owner, max, UPDATE_B);

      expect(result.hoSoNguoiThanId).toBe(max);
      expect((await storedRow(ctx.db, before)).ho_ten).toBe('M806');
      expect((await storedRow(ctx.db, max)).ho_ten).toBe(UPDATE_B.hoTen);
    });
  });

  it.each(['ChoThanhToan', 'DaXacNhan', 'DaTiepDon', 'HoanThanh'] as const)(
    'RUI-07 (Q9) hồ sơ đang có lịch hẹn %s vẫn sửa được: 200 với dữ liệu mới, lich_hen chụp ảnh SELECT * trước và sau GIỐNG HỆT, lịch hẹn hiện thông tin mới qua khoá tham chiếu',
    async (trangThai) => {
      const owner = await ctx.newPatient();
      const id = await activeRelative(owner);
      const appointment = await appointmentForRelative(
        ctx.fx,
        owner,
        id,
        trangThai,
      );
      expect(appointment.hoSoNguoiThanId).toBe(id);
      const lichHenBefore = await snapshotTables(ctx.db, ['lich_hen']);
      expect(lichHenBefore[0]).toHaveLength(1);

      const result = await ctx.service.update(owner, id, UPDATE_A);

      expect(result.hoTen).toBe(UPDATE_A.hoTen);
      expect(await snapshotTables(ctx.db, ['lich_hen'])).toEqual(lichHenBefore);
      const shown = await ctx.db.query<{ ho_ten: string }[]>(
        `SELECT h.ho_ten FROM lich_hen l
         JOIN ho_so_nguoi_than h ON h.ho_so_nguoi_than_id = l.ho_so_nguoi_than_id AND h.benh_nhan_id = l.benh_nhan_id
         WHERE l.lich_hen_id = ?`,
        [appointment.lichHenId],
      );
      expect(shown.map((r) => r.ho_ten)).toEqual([UPDATE_A.hoTen]);
    },
  );

  it('RUI-08 (BM-02) findRelativeById ném lỗi SAU câu UPDATE ⇒ hoàn tác: hàng nguyên như trước (chứng minh giao dịch bao cả hai câu)', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const before = await storedRows(ctx.db);
    vi.spyOn(repository, 'findRelativeById').mockRejectedValueOnce(
      new Error('mất kết nối khi đọc lại'),
    );

    await expect(ctx.service.update(owner, id, UPDATE_A)).rejects.toThrow(
      'mất kết nối khi đọc lại',
    );

    expect(await storedRows(ctx.db)).toStrictEqual(before);
  });

  it.each(MOI_QUAN_HE_NGUOI_THAN)(
    'RUI-09 (NT-03) sửa mối quan hệ sang %s: ghi và đọc đúng',
    async (moiQuanHe) => {
      const owner = await ctx.newPatient();
      const id = await activeRelative(owner);

      const result = await ctx.service.update(owner, id, {
        ...UPDATE_A,
        moiQuanHe,
      });

      expect(result.moiQuanHe).toBe(moiQuanHe);
      expect((await storedRow(ctx.db, id)).moi_quan_he).toBe(moiQuanHe);
    },
  );

  it('RUI-11 giới hạn lưu: họ tên 100 ký tự có dấu lưu nguyên vẹn khi sửa (không "Data too long")', async () => {
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);
    const hoTen = 'Ạ'.repeat(100);

    const result = await ctx.service.update(owner, id, { ...UPDATE_A, hoTen });

    expect(result.hoTen).toBe(hoTen);
    expect((await storedRow(ctx.db, id)).ho_ten).toBe(hoTen);
  });
});

// Đổi múi giờ CỦA TIẾN TRÌNH (không chỉ của MySQL): một cách chuyển ngày bằng `Date` sẽ lệch một ngày ở New York dù đúng ở +07:00 hay UTC.
describe('RelativesService.update với múi giờ tiến trình America/New_York', () => {
  useProcessTimeZone('America/New_York');

  it('RUI-10 (bẫy 2) sửa ngày sinh sang 1900-01-01, hôm nay (giờ VN), 2024-02-29, 1999-12-31, 2000-01-01: đọc ra ĐÚNG chuỗi đã gửi', async () => {
    // Đảm bảo ca không "xanh giả": múi giờ phải thật sự là New York (UTC-5 vào tháng 11, offset 300 phút)
    expect(new Date('2026-11-06T12:00:00Z').getTimezoneOffset()).toBe(300);
    const owner = await ctx.newPatient();
    const id = await activeRelative(owner);

    for (const ngaySinh of [
      '1900-01-01',
      todayVN(),
      '2024-02-29',
      '1999-12-31',
      '2000-01-01',
    ]) {
      const result = await ctx.service.update(owner, id, {
        ...UPDATE_A,
        ngaySinh,
      });

      expect(result.ngaySinh).toBe(ngaySinh);
      expect((await storedRow(ctx.db, id)).ngay_sinh).toBe(ngaySinh);
    }
  });
});
