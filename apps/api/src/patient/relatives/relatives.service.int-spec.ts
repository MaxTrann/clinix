import { HttpException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { todayVN } from '../../common/time/time.js';
import { snapshotTables } from '../testing/profile-update-helpers.js';
import {
  BIG_ID,
  insertRelativeRow,
  NEW_RELATIVE,
  nextAutoIncrement,
  RELATIVE_KEYS,
  relativeInput,
  removePatientRows,
  storedRows,
  UNTOUCHED_TABLES,
  withAutoIncrement,
} from '../testing/relatives-helpers.js';
import { RelativesRepository } from './relatives.repository.js';
import { RelativesService } from './relatives.service.js';

// Task B3 — GET và POST /patient/relatives ở tầng dịch vụ và kho trên MySQL 8.4 THẬT: hàng mới đúng giá trị, bảng khác giữ nguyên, danh sách theo chủ sở hữu,
// thứ tự, id BIGINT lớn hơn 2^53, ngày biên ở nhiều múi giờ, lỗi khoá ngoại, rollback. HTTP thật: test/patient-relatives.e2e-spec.ts.
// Mã ca RLI-nn là [đề xuất] (TRACKING patient B3-G). Dữ liệu cá nhân giả (đuôi .invalid), không CCCD thật.
const repository = new RelativesRepository();
let db: DataSource;
let fx: AdminFixtures;
let service: RelativesService;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new AdminFixtures(testDb);
  service = new RelativesService(testDb, repository);
});

const newPatient = async () => (await fx.patient()).account.taiKhoanId;

describe('RelativesService.create và list trên MySQL thật', () => {
  it('RLI-01 (NT-01) tạo hợp lệ, SĐT để trống: hàng mới trang_thai_hieu_luc 1, benh_nhan_id = người gọi, so_dien_thoai và dia_chi NULL; mọi bảng khác không đổi, ho_so_nguoi_than chỉ thêm đúng một hàng', async () => {
    const owner = await newPatient();
    const snapshot = await snapshotTables(db, UNTOUCHED_TABLES);
    expect(await storedRows(db)).toHaveLength(0);

    const created = await service.create(owner, NEW_RELATIVE);

    expect(await snapshotTables(db, UNTOUCHED_TABLES)).toEqual(snapshot);
    const rows = await storedRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toStrictEqual({
      ho_so_nguoi_than_id: created.hoSoNguoiThanId,
      benh_nhan_id: owner,
      ho_ten: NEW_RELATIVE.hoTen,
      ngay_sinh: NEW_RELATIVE.ngaySinh,
      gioi_tinh: NEW_RELATIVE.gioiTinh,
      dia_chi: null,
      moi_quan_he: NEW_RELATIVE.moiQuanHe,
      so_dien_thoai: null,
      trang_thai_hieu_luc: 1,
    });
  });

  it('RLI-02 (NT-01) tạo có SĐT: lưu 10 số liền; phản hồi đúng bảy khoá, đúng kiểu (id chuỗi, ngày chuỗi, trạng thái boolean), là hồ sơ đọc lại từ DB', async () => {
    const owner = await newPatient();

    const created = await service.create(owner, {
      ...NEW_RELATIVE,
      soDienThoai: '0901234567',
    });

    expect(Object.keys(created).sort()).toEqual(RELATIVE_KEYS);
    expect(typeof created.hoSoNguoiThanId).toBe('string');
    expect(created).toStrictEqual({
      hoSoNguoiThanId: created.hoSoNguoiThanId,
      hoTen: NEW_RELATIVE.hoTen,
      moiQuanHe: 'Con',
      gioiTinh: 'Nu',
      ngaySinh: '2018-03-04',
      soDienThoai: '0901234567',
      trangThaiHieuLuc: true,
    });
    expect((await storedRows(db, owner))[0]?.so_dien_thoai).toBe('0901234567');
    expect((await service.list(owner)).items).toStrictEqual([created]);
  });

  it('RLI-03 (NT-06) danh sách chỉ hồ sơ của người gọi (cả đang dùng và đã ngừng) dù DB có hồ sơ của Bệnh nhân khác; chưa có hồ sơ ⇒ mảng rỗng', async () => {
    const mine = await newPatient();
    const other = await newPatient();
    expect(await service.list(mine)).toStrictEqual({ items: [] });

    const a1 = await insertRelativeRow(db, mine, {
      hoTen: 'A đang dùng',
      active: true,
    });
    const a2 = await insertRelativeRow(db, mine, {
      hoTen: 'A đã ngừng',
      active: false,
    });
    const b1 = await insertRelativeRow(db, other, {
      hoTen: 'B đang dùng',
      active: true,
    });
    const b2 = await insertRelativeRow(db, other, {
      hoTen: 'B đã ngừng',
      active: false,
    });

    const mineIds = (await service.list(mine)).items.map(
      (r) => r.hoSoNguoiThanId,
    );
    const otherIds = (await service.list(other)).items.map(
      (r) => r.hoSoNguoiThanId,
    );
    expect(mineIds).toEqual([a1, a2]);
    expect(otherIds).toEqual([b1, b2]);
  });

  it('RLI-04 (NT-06) thứ tự: đang sử dụng trước rồi id tăng dần; hồ sơ đã ngừng (chèn thẳng SQL, xen kẽ) xuống cuối; id 9, 10, 11… xếp đúng số học; trangThaiHieuLuc là boolean', async () => {
    const owner = await newPatient();
    await withAutoIncrement(db, '9', async () => {
      const plan = [
        ['a1', true],
        ['b2', false],
        ['c3', true],
        ['d4', false],
        ['e5', true],
      ] as const;
      for (const [hoTen, active] of plan) {
        await insertRelativeRow(db, owner, { hoTen, active });
      }

      const items = (await service.list(owner)).items;

      expect(items.map((r) => r.hoTen)).toEqual(['a1', 'c3', 'e5', 'b2', 'd4']);
      expect(items.map((r) => r.hoSoNguoiThanId)).toEqual([
        '9',
        '11',
        '13',
        '10',
        '12',
      ]);
      expect(items.map((r) => r.trangThaiHieuLuc)).toEqual([
        true,
        true,
        true,
        false,
        false,
      ]);
    });
  });

  it('RLI-05 (NT-19, Q14) 30 hồ sơ cho một Bệnh nhân đều tạo được (không trần số lượng); hai hồ sơ trùng họ tên và ngày sinh đều tạo được với id khác nhau', async () => {
    const owner = await newPatient();
    const ids: string[] = [];
    for (let n = 1; n <= 30; n++) {
      ids.push((await service.create(owner, relativeInput(n))).hoSoNguoiThanId);
    }
    const twin = await service.create(owner, relativeInput(1));

    expect(twin.hoTen).toBe(relativeInput(1).hoTen);
    expect(twin.ngaySinh).toBe(relativeInput(1).ngaySinh);
    expect(ids).not.toContain(twin.hoSoNguoiThanId);
    const listed = (await service.list(owner)).items;
    expect(listed).toHaveLength(31);
    const asBig = listed.map((r) => BigInt(r.hoSoNguoiThanId));
    expect(asBig).toEqual(
      [...asBig].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)),
    );
  });

  it('RLI-06 (bẫy 1) id lớn hơn 2^53: tạo rồi đọc danh sách ra đúng chuỗi 9007199254740993; hồ sơ kế tiếp là 9007199254740994 (không bị sai chữ số)', async () => {
    const owner = await newPatient();
    await withAutoIncrement(db, BIG_ID, async () => {
      const first = await service.create(owner, relativeInput(1));
      const second = await service.create(owner, relativeInput(2));

      expect(first.hoSoNguoiThanId).toBe('9007199254740993');
      expect(second.hoSoNguoiThanId).toBe('9007199254740994');
      expect(
        (await service.list(owner)).items.map((r) => r.hoSoNguoiThanId),
      ).toEqual(['9007199254740993', '9007199254740994']);
      expect(
        (await storedRows(db, owner)).map((r) => r.ho_so_nguoi_than_id),
      ).toEqual(['9007199254740993', '9007199254740994']);
    });
  });

  it('RLI-06b (điều kiện dọn dẹp) withAutoIncrement trả AUTO_INCREMENT về 1 và xoá hàng KỂ CẢ khi work ném lỗi: ca đỏ không để lại id lớn', async () => {
    const owner = await newPatient();
    const boom = new Error('ca đỏ giả');

    await expect(
      withAutoIncrement(db, BIG_ID, async () => {
        await service.create(owner, relativeInput(1));
        expect(await nextAutoIncrement(db)).toBe('9007199254740994');
        throw boom;
      }),
    ).rejects.toBe(boom);

    // Sau TRUNCATE bộ đếm chưa khởi tạo (null) hoặc 1: tuyệt đối không còn id lớn; hồ sơ kế tiếp có id 1
    expect([null, '1']).toContain(await nextAutoIncrement(db));
    expect(await storedRows(db)).toHaveLength(0);
    const next = await service.create(await newPatient(), relativeInput(2));
    expect(next.hoSoNguoiThanId).toBe('1');
  });

  it('RLI-08 (H3, B7) findRelatives chỉ trả hồ sơ của benhNhanId được hỏi; findRelativeById với id của người khác ⇒ null (không phân biệt với không có); id chủ lạ ⇒ mảng rỗng', async () => {
    const a = await newPatient();
    const b = await newPatient();
    const a1 = await service.create(a, relativeInput(1));
    const a2 = await service.create(a, relativeInput(2));
    const b1 = await service.create(b, relativeInput(3));

    expect(
      (await repository.findRelatives(db.manager, a)).map(
        (r) => r.hoSoNguoiThanId,
      ),
    ).toEqual([a1.hoSoNguoiThanId, a2.hoSoNguoiThanId]);
    expect(await repository.findRelatives(db.manager, b)).toStrictEqual([b1]);
    expect(await repository.findRelatives(db.manager, '999999')).toStrictEqual(
      [],
    );
    expect(
      await repository.findRelativeById(db.manager, a, b1.hoSoNguoiThanId),
    ).toBeNull();
    expect(
      await repository.findRelativeById(db.manager, b, b1.hoSoNguoiThanId),
    ).toStrictEqual(b1);
    expect(
      await repository.findRelativeById(db.manager, a, '999999'),
    ).toBeNull();
  });

  it('RLI-09 (NT-01, mass assignment ở tầng kho) insertRelative bị nhét thêm diaChi, trangThaiHieuLuc false, benhNhanId của người khác ⇒ vẫn dia_chi NULL, trang_thai_hieu_luc 1, benh_nhan_id đúng tham số', async () => {
    const owner = await newPatient();
    const other = await newPatient();
    const tampered = {
      ...NEW_RELATIVE,
      diaChi: '12 Đường Nhét Thêm',
      trangThaiHieuLuc: false,
      benhNhanId: other,
    };

    await db.transaction((em) =>
      repository.insertRelative(em, owner, tampered),
    );

    expect(await storedRows(db, other)).toHaveLength(0);
    const [row] = await storedRows(db, owner);
    expect(row).toMatchObject({
      benh_nhan_id: owner,
      dia_chi: null,
      trang_thai_hieu_luc: 1,
    });
  });

  it('RLI-10 (H13, BM-03) Bệnh nhân bị xoá vi_noi_bo và benh_nhan (hoặc mã không có thật) ⇒ 403 KHONG_DU_QUYEN, không hàng nào được chèn', async () => {
    const orphan = await newPatient();
    await removePatientRows(db, orphan);

    for (const accountId of [orphan, '999999']) {
      const error: unknown = await service
        .create(accountId, NEW_RELATIVE)
        .catch((e) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
      expect((error as { maLoi?: string }).maLoi).toBe('KHONG_DU_QUYEN');
    }
    expect(await storedRows(db)).toHaveLength(0);
  });

  it('RLI-11 (BM-02) đọc lại ném lỗi DB sau khi INSERT ⇒ lỗi đi nguyên và giao dịch HOÀN TÁC: không có hàng mới (giao dịch bao cả hai câu)', async () => {
    const owner = await newPatient();
    const failure = new Error('mất kết nối');
    vi.spyOn(repository, 'findRelativeById').mockRejectedValueOnce(failure);

    await expect(service.create(owner, NEW_RELATIVE)).rejects.toBe(failure);

    expect(await storedRows(db)).toHaveLength(0);
  });

  it('RLI-12 giới hạn lưu: họ tên 100 ký tự có dấu và SĐT 10 số được lưu nguyên vẹn (không "Data too long")', async () => {
    const owner = await newPatient();
    const hoTen = 'Đặng Ánh Ơ'.padEnd(100, 'ê');

    const created = await service.create(owner, {
      ...NEW_RELATIVE,
      hoTen,
      soDienThoai: '0999999999',
    });

    expect(created.hoTen).toHaveLength(100);
    expect(created.hoTen).toBe(hoTen);
    expect((await storedRows(db, owner))[0]).toMatchObject({
      ho_ten: hoTen,
      so_dien_thoai: '0999999999',
    });
  });

  it.each([
    'Cha',
    'Me',
    'Vo',
    'Chong',
    'Con',
    'AnhChiEm',
    'OngBa',
    'Khac',
  ] as const)(
    'RLI-13 (NT-03) moiQuanHe %s ghi và đọc đúng',
    async (moiQuanHe) => {
      const owner = await newPatient();

      const created = await service.create(owner, {
        ...NEW_RELATIVE,
        moiQuanHe,
      });

      expect(created.moiQuanHe).toBe(moiQuanHe);
      expect((await storedRows(db, owner))[0]?.moi_quan_he).toBe(moiQuanHe);
    },
  );

  it('RLI-14 (QP-06) tạo cho A thì hàng của B không đổi một cột nào', async () => {
    const a = await newPatient();
    const b = await newPatient();
    await service.create(b, relativeInput(7));
    const before = await storedRows(db, b);

    await service.create(a, relativeInput(8));
    await service.create(a, relativeInput(9));

    expect(await storedRows(db, b)).toStrictEqual(before);
    expect(await storedRows(db, a)).toHaveLength(2);
  });
});

// Đổi múi giờ CỦA TIẾN TRÌNH (không chỉ của MySQL): một cách chuyển ngày bằng `Date` sẽ lệch một ngày ở New York dù đúng ở +07:00 hay UTC.
describe('RelativesService với múi giờ tiến trình America/New_York', () => {
  let originalTz: string | undefined;

  beforeAll(() => {
    originalTz = process.env['TZ'];
    process.env['TZ'] = 'America/New_York';
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env['TZ'];
    else process.env['TZ'] = originalTz;
  });

  it('RLI-07 (bẫy 2) ngày sinh biên 1900-01-01, hôm nay (giờ VN), 2024-02-29, 1999-12-31, 2000-01-01: tạo rồi đọc ra ĐÚNG chuỗi đã gửi', async () => {
    // Đảm bảo ca không "xanh giả": múi giờ phải thật sự là New York (UTC-5 vào tháng 11, offset 300 phút)
    expect(new Date('2026-11-06T12:00:00Z').getTimezoneOffset()).toBe(300);
    const owner = await newPatient();
    const days = [
      '1900-01-01',
      todayVN(),
      '2024-02-29',
      '1999-12-31',
      '2000-01-01',
    ];

    for (const [index, ngaySinh] of days.entries()) {
      const created = await service.create(owner, {
        ...relativeInput(index + 1),
        ngaySinh,
      });
      expect(created.ngaySinh).toBe(ngaySinh);
    }

    expect((await service.list(owner)).items.map((r) => r.ngaySinh)).toEqual(
      days,
    );
    expect((await storedRows(db, owner)).map((r) => r.ngay_sinh)).toEqual(days);
  });
});
