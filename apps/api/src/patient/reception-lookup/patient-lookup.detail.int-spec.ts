import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  addDetailPatient,
  addNotFoundBranches,
  addRelative,
  addTwoRelatives,
  DETAIL_KEYS,
  DETAIL_RELATIVE_KEYS,
  DETAIL_UNREAD_TABLES,
  NOT_FOUND_TEXT,
} from '../testing/patient-detail-helpers.js';
import {
  addManyPatients,
  addPatientWithLinkedData,
  LOOKUP_UNTOUCHED_TABLES,
  readCounts,
  withAccountAutoIncrement,
} from '../testing/patient-lookup-helpers.js';
import {
  failureOf,
  snapshotTables,
} from '../testing/profile-update-helpers.js';
import { BIG_ID } from '../testing/relatives-helpers.js';
import { useProcessTimeZone } from '../testing/relatives-update-helpers.js';
import { RelativesRepository } from '../relatives/relatives.repository.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';
import { PatientLookupService } from './patient-lookup.service.js';

// Task B7 — chi tiết một bệnh nhân ở tầng dịch vụ và kho trên MySQL 8.4 THẬT: đủ trường Q18, người thân cả hai trạng thái (đang dùng trước), 404 cùng thân, phạm vi toàn
// hệ thống, chỉ đọc, không đọc bảng khác, thoiDiemTao đúng khoảnh khắc ở nhiều múi giờ. HTTP thật: test/patient-lookup-detail.e2e-spec.ts. Mã ca PDI-nn là [đề xuất]
// (TRACKING patient B7-G). Dữ liệu cá nhân giả (email đuôi .invalid), không CCCD thật. File MỚI (không sửa patient-lookup.int-spec.ts của B6).
let db: DataSource;
let fx: AdminFixtures;
let service: PatientLookupService;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new AdminFixtures(testDb);
  service = new PatientLookupService(
    testDb,
    new PatientLookupRepository(),
    new RelativesRepository(),
  );
});

const FULL = {
  hoTen: 'Nguyễn Văn Thử',
  email: 'thu@mail-d.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Đường Giả, Quận Giả',
  thoiDiemTaoVN: '2026-11-08 08:00:00',
  soLanVangMat: 2,
};

describe('PatientLookupService.getDetail trên MySQL thật — nội dung', () => {
  it('PDI-01 (TC-11) hai người thân (một đang dùng, một đã ngừng): đủ trường Q18 của bản thân, người thân đang dùng TRƯỚC (dù tạo sau), đúng mười khoá ở gốc và sáu khoá mỗi phần tử', async () => {
    const id = await addDetailPatient(db, fx, FULL);
    const expected = await addTwoRelatives(db, id);

    const detail = await service.getDetail(id);

    expect(detail).toStrictEqual({
      hoTen: 'Nguyễn Văn Thử',
      email: 'thu@mail-d.invalid',
      soDienThoai: '0901234567',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-15',
      diaChi: '12 Đường Giả, Quận Giả',
      thoiDiemTao: '2026-11-08T01:00:00.000Z',
      trangThai: 'DangHoatDong',
      soLanVangMat: 2,
      nguoiThan: expected,
    });
    expect(Object.keys(detail).sort()).toStrictEqual(DETAIL_KEYS);
    expect(detail.nguoiThan.map((r) => r.trangThaiHieuLuc)).toStrictEqual([
      true,
      false,
    ]);
    for (const relative of detail.nguoiThan) {
      expect(Object.keys(relative).sort()).toStrictEqual(DETAIL_RELATIVE_KEYS);
    }
  });

  it('PDI-04 (Q17) Bệnh nhân NgungHoatDong vẫn xem được, kèm trangThai là mã NgungHoatDong và cả hai người thân', async () => {
    const id = await addDetailPatient(db, fx, {
      ...FULL,
      trangThai: 'NgungHoatDong',
    });
    await addTwoRelatives(db, id);

    const detail = await service.getDetail(id);

    expect(detail.trangThai).toBe('NgungHoatDong');
    expect(detail.nguoiThan).toHaveLength(2);
  });

  it('PDI-05 Bệnh nhân không có người thân ⇒ nguoiThan là mảng rỗng (không null, không thiếu khoá)', async () => {
    const id = await addDetailPatient(db, fx, FULL);

    const detail = await service.getDetail(id);

    expect(detail.nguoiThan).toStrictEqual([]);
    expect(Object.keys(detail).sort()).toStrictEqual(DETAIL_KEYS);
  });

  it('PDI-06 giới tính, ngày sinh, địa chỉ chưa nhập ra null; người thân không có SĐT ra null; ngày sinh 1900-01-01 của bản thân và người thân không lệch ngày', async () => {
    const bare = await addDetailPatient(db, fx, {});
    const early = await addDetailPatient(db, fx, { ngaySinh: '1900-01-01' });
    await addRelative(db, early, {
      hoTen: 'Cụ Ông Giả',
      moiQuanHe: 'OngBa',
      gioiTinh: 'Nam',
      ngaySinh: '1900-01-01',
      soDienThoai: null,
    });

    const bareDetail = await service.getDetail(bare);
    const earlyDetail = await service.getDetail(early);

    expect(bareDetail).toMatchObject({
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
      soLanVangMat: 0,
    });
    expect(earlyDetail.ngaySinh).toBe('1900-01-01');
    expect(earlyDetail.nguoiThan).toStrictEqual([
      {
        hoTen: 'Cụ Ông Giả',
        moiQuanHe: 'OngBa',
        gioiTinh: 'Nam',
        ngaySinh: '1900-01-01',
        soDienThoai: null,
        trangThaiHieuLuc: true,
      },
    ]);
  });

  it('PDI-08 soLanVangMat đúng giá trị của so_lan_no_show và là SỐ (không chuỗi); mặc định 0', async () => {
    const seven = await addDetailPatient(db, fx, { soLanVangMat: 7 });
    const none = await addDetailPatient(db, fx, {});

    const sevenDetail = await service.getDetail(seven);
    const noneDetail = await service.getDetail(none);

    expect(sevenDetail.soLanVangMat).toBe(7);
    expect(noneDetail.soLanVangMat).toBe(0);
    expect(typeof sevenDetail.soLanVangMat).toBe('number');
  });

  it('PDI-13 (H3) người thân của Bệnh nhân khác không lẫn vào: mỗi Bệnh nhân chỉ thấy người thân của chính mình', async () => {
    const a = await addDetailPatient(db, fx, { hoTen: 'Bệnh Nhân A' });
    const b = await addDetailPatient(db, fx, { hoTen: 'Bệnh Nhân B' });
    const sample = {
      moiQuanHe: 'Con',
      gioiTinh: 'Nu',
      ngaySinh: '2018-03-04',
      soDienThoai: null,
    } as const;
    await addRelative(db, a, { ...sample, hoTen: 'Con Của A' });
    await addRelative(db, b, { ...sample, hoTen: 'Con Của B' });
    await addRelative(db, b, { ...sample, hoTen: 'Con Thứ Hai Của B' }, false);

    const detailA = await service.getDetail(a);
    const detailB = await service.getDetail(b);

    expect(detailA.nguoiThan.map((r) => r.hoTen)).toStrictEqual(['Con Của A']);
    expect(detailB.nguoiThan.map((r) => r.hoTen)).toStrictEqual([
      'Con Của B',
      'Con Thứ Hai Của B',
    ]);
  });

  it('PDI-07 (H3) id BIGINT lớn hơn 2^53: đúng người và đúng người thân, không bị đổi chữ số cuối (ép Number sẽ trỏ sang id khác và ra 404)', async () => {
    await withAccountAutoIncrement(db, BIG_ID, async () => {
      const [first, second] = await addManyPatients(db, 2, 'Id Rất Lớn');
      expect([first, second]).toStrictEqual([BIG_ID, '9007199254740994']);
      const sample = {
        moiQuanHe: 'Con',
        gioiTinh: 'Nam',
        ngaySinh: '2018-03-04',
        soDienThoai: null,
      } as const;
      await addRelative(db, BIG_ID, { ...sample, hoTen: 'Con Của Số Một' });
      await addRelative(db, '9007199254740994', {
        ...sample,
        hoTen: 'Con Của Số Hai',
      });

      const one = await service.getDetail(BIG_ID);
      const two = await service.getDetail('9007199254740994');

      expect(one.nguoiThan.map((r) => r.hoTen)).toStrictEqual([
        'Con Của Số Một',
      ]);
      expect(two.nguoiThan.map((r) => r.hoTen)).toStrictEqual([
        'Con Của Số Hai',
      ]);
      // 2^53 + 2 và 2^53 đều có thể biểu diễn bằng Number nhưng không phải bệnh nhân nào
      await expect(
        service.getDetail('9007199254740992'),
      ).rejects.toBeInstanceOf(AppException);
    });
  });
});

describe('PatientLookupService.getDetail trên MySQL thật — 404 và phạm vi', () => {
  it('PDI-02 (TC-12, Q27) không tồn tại, Lễ tân, Bác sĩ, Quản trị viên (hai phạm vi), Bệnh nhân chưa xác minh và dòng benh_nhan hỏng của Bác sĩ ⇒ CÙNG một AppException 404 KHONG_TIM_THAY, thân giống từng ký tự', async () => {
    const branches = await addNotFoundBranches(db, fx);
    // Đối chứng: một Bệnh nhân thật KHÔNG bị 404 (để ca không xanh giả vì mọi id đều 404)
    const real = await addDetailPatient(db, fx, FULL);
    await expect(service.getDetail(real)).resolves.toMatchObject({
      hoTen: 'Nguyễn Văn Thử',
    });

    expect(Object.keys(branches)).toHaveLength(7);
    for (const [label, id] of Object.entries(branches)) {
      const error = await failureOf(() => service.getDetail(id));
      expect(error, label).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus(), label).toBe(404);
      expect((error as AppException).maLoi, label).toBe('KHONG_TIM_THAY');
      expect(JSON.stringify((error as AppException).getResponse()), label).toBe(
        NOT_FOUND_TEXT,
      );
    }
  });

  it('PDI-03 (TC-13, Q16) phạm vi toàn hệ thống: Bệnh nhân không có lịch hẹn nào, và Bệnh nhân chỉ có lịch ở chi nhánh KHÁC chi nhánh của Lễ tân, đều xem được chi tiết', async () => {
    const receptionBranch = await fx.branch();
    await fx.receptionist(receptionBranch);
    const otherBranch = await fx.branch();
    const noAppointment = await addDetailPatient(db, fx, {
      hoTen: 'Không Có Lịch Hẹn',
    });
    const elsewhere = await addDetailPatient(db, fx, {
      hoTen: 'Chỉ Có Lịch Chi Nhánh Khác',
    });
    const doctor = await fx.doctor(otherBranch);
    const slot = await fx.slot(await fx.shift(doctor.profile));
    await fx.appointment(doctor.profile, slot, elsewhere, {
      trangThai: 'DaXacNhan',
    });

    await expect(service.getDetail(noAppointment)).resolves.toMatchObject({
      hoTen: 'Không Có Lịch Hẹn',
    });
    await expect(service.getDetail(elsewhere)).resolves.toMatchObject({
      hoTen: 'Chỉ Có Lịch Chi Nhánh Khác',
    });
  });
});

describe('PatientLookupService.getDetail trên MySQL thật — chỉ đọc', () => {
  it('PDI-10 (TC-14) nhiều lần xem (200, NgungHoatDong, 404) không đổi một hàng nào của mười bảng liên quan', async () => {
    const owner = await addPatientWithLinkedData(db, fx, {
      hoTen: 'Chủ Hồ Sơ',
    });
    await addTwoRelatives(db, owner);
    const stopped = await addDetailPatient(db, fx, {
      trangThai: 'NgungHoatDong',
    });
    const before = await snapshotTables(db, LOOKUP_UNTOUCHED_TABLES);

    await service.getDetail(owner);
    await service.getDetail(owner);
    await service.getDetail(stopped);
    await failureOf(() => service.getDetail('987654321'));

    expect(await snapshotTables(db, LOOKUP_UNTOUCHED_TABLES)).toEqual(before);
  });

  it('PDI-11 (TC-16, Q20 = A) xem chi tiết không thêm dòng nhat_ky_hanh_dong nào', async () => {
    const id = await addDetailPatient(db, fx, FULL);
    const count = async () => {
      const rows: { n: string }[] = await db.query(
        'SELECT CAST(COUNT(*) AS CHAR) AS n FROM nhat_ky_hanh_dong',
      );
      return rows[0]?.n;
    };
    const before = await count();

    await service.getDetail(id);
    await failureOf(() => service.getDetail('987654321'));

    expect(before).toBe('0');
    expect(await count()).toBe(before);
  });

  it('PDI-12 (không đọc bảng khác) MySQL tự đếm lượt đọc: một lần xem chỉ làm tai_khoan, benh_nhan và ho_so_nguoi_than tăng; lich_hen, le_tan, vi_noi_bo, ma_xac_thuc, phien_dang_nhap đứng yên', async () => {
    const id = await addPatientWithLinkedData(db, fx, { hoTen: 'Chủ Hồ Sơ' });
    await addTwoRelatives(db, id);
    const read = ['tai_khoan', 'benh_nhan', 'ho_so_nguoi_than'];
    const tables = [...DETAIL_UNREAD_TABLES, ...read];
    const before = await readCounts(db, tables);

    await service.getDetail(id);

    const after = await readCounts(db, tables);
    expect(DETAIL_UNREAD_TABLES).toStrictEqual([
      'lich_hen',
      'le_tan',
      'vi_noi_bo',
      'ma_xac_thuc',
      'phien_dang_nhap',
    ]);
    for (const table of DETAIL_UNREAD_TABLES) {
      expect(after[table], table).toBe(before[table]);
    }
    for (const table of read) {
      expect(after[table], table).toBeGreaterThan(before[table]!);
    }
  });

  it('PDI-12b khi performance_schema bị tắt thì máy dò NÉM LỖI rõ ràng, không im lặng bỏ qua (nên PDI-12 đỏ chứ không xanh giả)', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce([{ enabled: 0 }]);

    await expect(readCounts(db, ['tai_khoan'])).rejects.toThrow(
      /performance_schema đang tắt/,
    );
  });
});

// Ba múi giờ tiến trình: America/New_York (getTimezoneOffset 240 vào tháng 7), Pacific/Kiritimati (-840), Asia/Ho_Chi_Minh (-420, đối chứng).
// Khác +07:00 của DB ở hai múi đầu nên ca không xanh giả (đã đo ở TRACKING B7-C: đặt process.env.TZ lúc chạy có hiệu lực trong worker của Vitest).
describe.each<[string, number]>([
  ['America/New_York', 240],
  ['Pacific/Kiritimati', -840],
  ['Asia/Ho_Chi_Minh', -420],
])(
  'PatientLookupService.getDetail trên MySQL thật — múi giờ tiến trình %s',
  (zone, julyOffset) => {
    useProcessTimeZone(zone);

    it('PDI-09 (thoiDiemTao, B7-C) thoiDiemTao đúng KHOẢNH KHẮC ở mọi múi giờ: 08:00 giờ VN ⇒ 01:00Z, nửa đêm giờ VN ⇒ 17:00Z của ngày hôm trước, 23:59:59 giờ VN; ngày sinh không lệch ngày', async () => {
      expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(
        julyOffset,
      );
      const cases: [string, string][] = [
        ['2026-11-08 08:00:00', '2026-11-08T01:00:00.000Z'],
        ['2026-11-08 00:00:00', '2026-11-07T17:00:00.000Z'],
        ['2026-11-08 23:59:59', '2026-11-08T16:59:59.000Z'],
        ['2026-01-01 00:00:00', '2025-12-31T17:00:00.000Z'],
      ];
      for (const [local, expected] of cases) {
        const id = await addDetailPatient(db, fx, {
          ngaySinh: '1990-05-15',
          thoiDiemTaoVN: local,
        });
        await addRelative(db, id, {
          hoTen: 'Cha Giả',
          moiQuanHe: 'Cha',
          gioiTinh: 'Nam',
          ngaySinh: '1960-12-31',
          soDienThoai: null,
        });

        const detail = await service.getDetail(id);

        expect(detail.thoiDiemTao, local).toBe(expected);
        expect(detail.ngaySinh).toBe('1990-05-15');
        expect(detail.nguoiThan[0]?.ngaySinh).toBe('1960-12-31');
      }
    });
  },
);
