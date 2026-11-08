import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { insertBenhNhan } from '../../auth/entities/testing/auth-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { RelativesRepository } from '../relatives/relatives.repository.js';
import {
  addManyPatients,
  addPatient,
  addPatientWithLinkedData,
  addUnverifiedPatient,
  idsOf,
  ITEM_KEYS,
  LOOKUP_UNREAD_TABLES,
  LOOKUP_UNTOUCHED_TABLES,
  namesOf,
  PAGE_KEYS,
  readCounts,
  sortedCopy,
  withAccountAutoIncrement,
} from '../testing/patient-lookup-helpers.js';
import { snapshotTables } from '../testing/profile-update-helpers.js';
import { BIG_ID } from '../testing/relatives-helpers.js';
import { useProcessTimeZone } from '../testing/relatives-update-helpers.js';
import type { PatientLookupQuery } from './patient-lookup.dto.js';
import { PatientLookupRepository } from './patient-lookup.repository.js';
import { PatientLookupService } from './patient-lookup.service.js';

// Task B6 — tra cứu bệnh nhân ở tầng dịch vụ và kho trên MySQL 8.4 THẬT: tìm không dấu và chữ đ, SĐT, email, escape LIKE, đúng tập bệnh nhân, phân trang,
// phạm vi toàn hệ thống, chỉ đọc, không đọc bảng khác. HTTP thật: test/patient-lookup.e2e-spec.ts. Mã ca PLI-nn là [đề xuất] (TRACKING patient B6-G).
// Dữ liệu cá nhân giả (email đuôi .invalid), không CCCD thật.
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

// Đầu vào giống DTO đã kiểm: offset = (page - 1) * pageSize
const ask = (q: string, page = 1, pageSize = 20): PatientLookupQuery => ({
  q,
  page,
  pageSize,
  offset: (page - 1) * pageSize,
});
const search = (q: string, page = 1, pageSize = 20) =>
  service.search(ask(q, page, pageSize));
const namesFor = async (q: string) => sortedCopy(namesOf(await search(q)));

describe('PatientLookupService.search trên MySQL thật — họ tên', () => {
  it('PLI-01 (TC-01) không dấu, khác hoa thường, một phần: nguyen, NGUYEN, nguy, Nguyễn, nguyên đều khớp Nguyễn Văn A và không khớp ai khác', async () => {
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });
    await addPatient(fx, { hoTen: 'Lê Văn Tám' });
    await addPatient(fx, { hoTen: 'Trần Thị Bình' });

    for (const q of ['nguyen', 'NGUYEN', 'nguy', 'Nguyễn', 'nguyên', 'văn a']) {
      expect(await namesFor(q), q).toStrictEqual(['Nguyễn Văn A']);
    }
    expect(await namesFor('van')).toStrictEqual(['Lê Văn Tám', 'Nguyễn Văn A']);
  });

  it('PLI-01b (TC-01, bẫy 1) chữ đ khoá CẢ HAI chiều: dang khớp Đặng, ĐẶNG, đặng (viết thường) và Dang; đặng và ĐẶNG khớp cả Dang; do khớp Đỗ; dao khớp Đào; dung khớp Dũng', async () => {
    await addPatient(fx, { hoTen: 'Đặng Văn Hùng' });
    await addPatient(fx, { hoTen: 'ĐẶNG MINH' });
    await addPatient(fx, { hoTen: 'Dang Van Binh' });
    // Tên lưu toàn chữ thường: chữ đ thường phải được gấp riêng với Đ hoa (REPLACE phân biệt hoa thường)
    await addPatient(fx, { hoTen: 'đặng thị mai' });
    await addPatient(fx, { hoTen: 'Đỗ Thị Lan' });
    await addPatient(fx, { hoTen: 'Trần Thị Đào' });
    await addPatient(fx, { hoTen: 'Lê Văn Dũng' });
    await addPatient(fx, { hoTen: 'Phạm Văn Tám' });
    const dang = [
      'Dang Van Binh',
      'ĐẶNG MINH',
      'Đặng Văn Hùng',
      'đặng thị mai',
    ];

    for (const q of ['dang', 'DANG', 'đặng', 'Đặng', 'ĐẶNG', 'đang']) {
      expect(await namesFor(q), q).toStrictEqual(dang);
    }
    expect(await namesFor('do')).toStrictEqual(['Đỗ Thị Lan']);
    expect(await namesFor('đỗ')).toStrictEqual(['Đỗ Thị Lan']);
    expect(await namesFor('dao')).toStrictEqual(['Trần Thị Đào']);
    expect(await namesFor('đào')).toStrictEqual(['Trần Thị Đào']);
    expect(await namesFor('dung')).toStrictEqual(['Lê Văn Dũng']);
  });

  it('PLI-01c (bẫy 1) chữ đ chỉ gấp ở HỌ TÊN: email chứa "đ" tương đương không bị gấp (email là ASCII), và SĐT không bị ảnh hưởng', async () => {
    await addPatient(fx, {
      hoTen: 'Một Người',
      email: 'dang.van@mail-x.invalid',
    });
    await addPatient(fx, { hoTen: 'Người Khác', email: 'khac@mail-y.invalid' });

    // "đang" gấp thành "dang" ở họ tên, nhưng mẫu email giữ nguyên "đang" nên không khớp "dang.van"
    expect(await namesFor('đang.v')).toStrictEqual([]);
    expect(await namesFor('dang.v')).toStrictEqual(['Một Người']);
  });

  it('PLI-05 (TC-05) %, _, \\, ! là ký tự thường ở họ tên: chỉ khớp tên chứa đúng ký tự đó, không khớp mọi thứ', async () => {
    await addPatient(fx, { hoTen: 'Phạm 100% Thật' });
    await addPatient(fx, { hoTen: 'Võ_Thị Mai' });
    await addPatient(fx, { hoTen: 'Hồ!Văn Tám' });
    await addPatient(fx, { hoTen: 'Bùi\\Văn Chín' });
    await addPatient(fx, { hoTen: 'Lê Văn Bình' });

    expect(await namesFor('0%')).toStrictEqual(['Phạm 100% Thật']);
    expect(await namesFor('%%')).toStrictEqual([]);
    expect(await namesFor('õ_')).toStrictEqual(['Võ_Thị Mai']);
    expect(await namesFor('__')).toStrictEqual([]);
    // Không escape thì "_" khớp dấu cách và "%" khớp "Văn ": hai ca này chỉ đúng khi ký tự đặc biệt là ký tự thường
    expect(await namesFor('Lê_Văn')).toStrictEqual([]);
    expect(await namesFor('Lê%Bình')).toStrictEqual([]);
    expect(await namesFor('ồ!V')).toStrictEqual(['Hồ!Văn Tám']);
    expect(await namesFor('ồ!!V')).toStrictEqual([]);
    expect(await namesFor('i\\V')).toStrictEqual(['Bùi\\Văn Chín']);
    expect(await namesFor('\\\\')).toStrictEqual([]);
    expect(await namesFor('n\\v')).toStrictEqual([]);
  });

  it('PLI-05b (TC-05) %, _, ! cũng là ký tự thường ở email và SĐT-không-phải: email chứa dấu gạch dưới chỉ khớp khi q có đúng dấu đó', async () => {
    await addPatient(fx, { hoTen: 'Có Gạch', email: 'co_gach@mail-z.invalid' });
    await addPatient(fx, {
      hoTen: 'Không Gạch',
      email: 'cogach@mail-z.invalid',
    });

    expect(await namesFor('co_g')).toStrictEqual(['Có Gạch']);
    expect(await namesFor('co%g')).toStrictEqual([]);
    expect(await namesFor('cogach')).toStrictEqual(['Không Gạch']);
  });

  it('PLI-15 chuỗi kiểu tấn công SQL chỉ là từ khoá: không khớp, không lỗi, bảng còn nguyên', async () => {
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });
    const payloads = [
      "' OR '1'='1",
      "a'; DROP TABLE tai_khoan; --",
      "\\' OR 1=1 --",
      '"; DELETE FROM benh_nhan; --',
      "%' OR 'x' LIKE '%",
    ];

    for (const q of payloads) {
      const result = await search(q);
      expect(result, q).toStrictEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
    }
    expect(await namesFor('nguyen')).toStrictEqual(['Nguyễn Văn A']);
    const rows: { n: string }[] = await db.query(
      'SELECT CAST(COUNT(*) AS CHAR) AS n FROM benh_nhan',
    );
    expect(rows[0]?.n).toBe('1');
  });

  it('PLI-14 họ tên đúng 100 điểm mã (chữ nhiều byte) tìm được bằng chính nó; bằng nửa đầu; không khớp tên khác', async () => {
    const hundred = 'Đặng'.repeat(25);
    expect(Array.from(hundred)).toHaveLength(100);
    await addPatient(fx, { hoTen: hundred });
    await addPatient(fx, { hoTen: 'Đặng Văn Hùng' });

    expect(await namesFor(hundred)).toStrictEqual([hundred]);
    expect(await namesFor(hundred.slice(0, 50))).toStrictEqual([hundred]);
    expect(await namesFor('dangdangdang')).toStrictEqual([hundred]);
  });
});

describe('PatientLookupService.search trên MySQL thật — SĐT và email', () => {
  it('PLI-02 (TC-02) SĐT đầy đủ, một phần, ở giữa; có dấu cách hoặc chấm; hai chữ số', async () => {
    const a = await addPatient(fx, {
      hoTen: 'Người A',
      soDienThoai: '0901234567',
    });
    const b = await addPatient(fx, {
      hoTen: 'Người B',
      soDienThoai: '0901234568',
    });
    const c = await addPatient(fx, {
      hoTen: 'Người C',
      soDienThoai: '0912345678',
    });
    await addPatient(fx, { hoTen: 'Người D', soDienThoai: '0387654321' });
    const idsFor = async (q: string) => sortedCopy(idsOf(await search(q)));

    expect(await idsFor('0901234567')).toStrictEqual([a]);
    expect(await idsFor('0901 234 567')).toStrictEqual([a]);
    expect(await idsFor('0901.234.567')).toStrictEqual([a]);
    expect(await idsFor('0901 . 234 567')).toStrictEqual([a]);
    expect(await idsFor('090123')).toStrictEqual(sortedCopy([a, b]));
    expect(await idsFor('12345')).toStrictEqual(sortedCopy([a, b, c]));
    // 0912345678 cũng chứa 4567 (ở giữa)
    expect(await idsFor('4567')).toStrictEqual(sortedCopy([a, c]));
    expect(await idsFor('09')).toStrictEqual(sortedCopy([a, b, c]));
    expect(await idsFor('0387654321')).toHaveLength(1);
  });

  it('PLI-02b (TC-02) nhánh SĐT chỉ bật khi toàn chữ số sau khi bỏ dấu cách và chấm, và còn ≥ 2 chữ số: "0." và "0901a" không tìm theo SĐT dù có SĐT chứa chúng', async () => {
    await addPatient(fx, { hoTen: 'Người A', soDienThoai: '0901234567' });

    for (const q of ['0.', '0901a', '0901-234', '+84901234567', '. .']) {
      expect(namesOf(await search(q)), q).toStrictEqual([]);
    }
    expect(namesOf(await search('0 9'))).toStrictEqual(['Người A']);
  });

  it('PLI-02c (TC-02) q toàn chữ số khớp CẢ họ tên và email chứa chữ số (nhóm OR), cùng SĐT chứa chúng', async () => {
    const inName = await addPatient(fx, { hoTen: 'Nguyễn 2024' });
    const inEmail = await addPatient(fx, {
      hoTen: 'Người Email',
      email: 'u2024@mail-w.invalid',
    });
    const inPhone = await addPatient(fx, {
      hoTen: 'Người Phone',
      soDienThoai: '0920245678',
    });
    await addPatient(fx, { hoTen: 'Không Liên Quan' });

    expect(sortedCopy(idsOf(await search('2024')))).toStrictEqual(
      sortedCopy([inName, inEmail, inPhone]),
    );
  });

  it('PLI-03 (TC-03) email đầy đủ, một phần, khác hoa thường, phần tên miền', async () => {
    const a = await addPatient(fx, {
      hoTen: 'Người A',
      email: 'an.nguyen@mail-a.invalid',
    });
    await addPatient(fx, {
      hoTen: 'Người B',
      email: 'binh.tran@mail-b.invalid',
    });

    for (const q of [
      'an.nguyen@mail-a.invalid',
      'an.nguyen',
      'AN.NGUYEN',
      '@mail-a',
      'mail-a.inv',
    ]) {
      expect(idsOf(await search(q)), q).toStrictEqual([a]);
    }
    expect(await namesFor('mail-')).toStrictEqual(['Người A', 'Người B']);
  });

  it('PLI-04 (TC-04) từ khoá không khớp ai ⇒ { items: [], total: 0, page: 1, pageSize: 20 }, không ném', async () => {
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });

    await expect(search('khong-ai-ten-nhu-vay')).resolves.toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });
});

describe('PatientLookupService.search trên MySQL thật — tập kết quả', () => {
  it('PLI-06 (TC-07) chỉ Bệnh nhân ĐÃ xác minh: Bác sĩ, Lễ tân, Quản trị viên (hai phạm vi), Bệnh nhân chưa xác minh và một dòng benh_nhan của tài khoản Bác sĩ cùng khớp từ khoá nhưng không xuất hiện', async () => {
    const keyword = 'Trùng Khoá';
    const branch = await fx.branch();
    const wanted = await addPatient(fx, { hoTen: `${keyword} Bệnh Nhân` });
    await fx.doctor(
      branch,
      {},
      { hoTen: `${keyword} Bác Sĩ`, email: 'bs@mail-q.invalid' },
    );
    await fx.receptionist(branch, {
      hoTen: `${keyword} Lễ Tân`,
      email: 'lt@mail-q.invalid',
    });
    await fx.admin(undefined, {
      hoTen: `${keyword} QTV Toàn`,
      email: 'qtv1@mail-q.invalid',
    });
    await fx.admin(branch, {
      hoTen: `${keyword} QTV Chi Nhánh`,
      email: 'qtv2@mail-q.invalid',
    });
    await addUnverifiedPatient(db, {
      hoTen: `${keyword} Chưa Xác Minh`,
      email: 'cxm@mail-q.invalid',
    });
    // Dữ liệu hỏng: khoá ngoại của benh_nhan không bắt tài khoản phải là Bệnh nhân. Chỉ loai_tai_khoan loại được dòng này
    const doctorWithPatientRow = await fx.doctor(
      branch,
      {},
      {
        hoTen: `${keyword} Bác Sĩ Có Dòng benh_nhan`,
        email: 'bs2@mail-q.invalid',
      },
    );
    await insertBenhNhan(db, doctorWithPatientRow.account.taiKhoanId);

    const result = await search(keyword);

    expect(idsOf(result)).toStrictEqual([wanted]);
    expect(result.total).toBe(1);
    // Cùng ca, tìm bằng email: Bác sĩ có dòng benh_nhan vẫn không xuất hiện
    expect(await search('mail-q')).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
  });

  it('PLI-07 (TC-08) Bệnh nhân NgungHoatDong vẫn xuất hiện kèm trangThai là MÃ; DangHoatDong kèm DangHoatDong; mỗi dòng đúng năm khoá', async () => {
    const stopped = await addPatient(fx, {
      hoTen: 'Ngừng Hoạt Động',
      trangThai: 'NgungHoatDong',
    });
    const active = await addPatient(fx, { hoTen: 'Đang Hoạt Động' });

    const result = await search('hoạt động');

    expect(result.items.map((i) => [i.taiKhoanId, i.trangThai])).toStrictEqual([
      [active, 'DangHoatDong'],
      [stopped, 'NgungHoatDong'],
    ]);
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);
    }
  });

  it('PLI-09 (TC-13, Q16) phạm vi toàn hệ thống: Bệnh nhân không có lịch hẹn và Bệnh nhân chỉ có lịch ở chi nhánh KHÁC chi nhánh của Lễ tân đều xuất hiện', async () => {
    const reception = await fx.branch();
    await fx.receptionist(reception);
    const other = await fx.branch();
    const noAppointment = await addPatient(fx, { hoTen: 'Không Có Lịch Hẹn' });
    const elsewhere = await addPatient(fx, {
      hoTen: 'Chỉ Có Lịch Chi Nhánh Khác',
    });
    const doctor = await fx.doctor(other);
    const slot = await fx.slot(await fx.shift(doctor.profile));
    await fx.appointment(doctor.profile, slot, elsewhere, {
      trangThai: 'DaXacNhan',
    });

    const result = await search('lịch');

    expect(sortedCopy(idsOf(result))).toStrictEqual(
      sortedCopy([noAppointment, elsewhere]),
    );
    expect(result.total).toBe(2);
  });
});

describe('PatientLookupService.search trên MySQL thật — phân trang và thứ tự', () => {
  it('PLI-08 (TC-09) 25 hàng cùng họ tên: trang 1 đủ 20, trang 2 còn 5, hợp hai trang đủ 25 mã không trùng không thiếu, thứ tự tăng theo mã khi trùng tên, total 25', async () => {
    const all = await addManyPatients(db, 25, 'Cùng Họ Tên');

    const first = await search('cùng họ tên');
    const second = await search('cùng họ tên', 2);

    expect(first.items).toHaveLength(20);
    expect(second.items).toHaveLength(5);
    expect(first.total).toBe(25);
    expect(second.total).toBe(25);
    expect([...idsOf(first), ...idsOf(second)]).toStrictEqual(all);
    expect(first).toMatchObject({ page: 1, pageSize: 20 });
    expect(second).toMatchObject({ page: 2, pageSize: 20 });
  });

  it('PLI-08b (TC-09) pageSize 100 với 105 hàng ra 100 rồi 5; pageSize nhỏ chia đúng; không hàng nào trùng giữa các trang', async () => {
    const all = await addManyPatients(db, 105, 'Hàng Loạt');

    const first = await search('hàng loạt', 1, 100);
    const second = await search('hàng loạt', 2, 100);

    expect(first.items).toHaveLength(100);
    expect(second.items).toHaveLength(5);
    expect([...idsOf(first), ...idsOf(second)]).toStrictEqual(all);
    const seen = new Set<string>();
    for (let page = 1; page <= 11; page += 1) {
      for (const id of idsOf(await search('hàng loạt', page, 10))) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(seen.size).toBe(105);
  });

  it('PLI-08c (TC-09) trang vượt cuối ⇒ items [] mà total vẫn đúng; page = 9223372036854775807 (offset ≈ 1,8·10^20) ⇒ 200 rỗng, KHÔNG ném (MySQL báo 1064 nếu OFFSET đó được gửi đi)', async () => {
    await addManyPatients(db, 25, 'Cùng Họ Tên');

    await expect(search('cùng họ tên', 3)).resolves.toStrictEqual({
      items: [],
      total: 25,
      page: 3,
      pageSize: 20,
    });
    const huge = Number('9223372036854775807');
    expect((huge - 1) * 20 > Number.MAX_SAFE_INTEGER).toBe(true);
    await expect(
      service.search({
        q: 'cùng họ tên',
        page: huge,
        pageSize: 20,
        offset: (huge - 1) * 20,
      }),
    ).resolves.toStrictEqual({
      items: [],
      total: 25,
      page: huge,
      pageSize: 20,
    });
    await expect(search('khong-ai', 5)).resolves.toMatchObject({
      items: [],
      total: 0,
      page: 5,
    });
  });

  it('PLI-08d (TC-09) sắp theo họ tên theo collation rồi theo mã tài khoản: An, Ân, an (bằng nhau, theo thứ tự tạo) rồi Ba rồi Bình', async () => {
    const an = await addPatient(fx, { hoTen: 'Tên An' });
    const anHat = await addPatient(fx, { hoTen: 'Tên Ân' });
    const ba = await addPatient(fx, { hoTen: 'Tên Ba' });
    const anLower = await addPatient(fx, { hoTen: 'tên an' });
    const binh = await addPatient(fx, { hoTen: 'Tên Bình' });

    expect(idsOf(await search('tên'))).toStrictEqual([
      an,
      anHat,
      anLower,
      ba,
      binh,
    ]);
  });

  it('PLI-13 id BIGINT lớn hơn 2^53 ra đúng chuỗi, không đổi chữ số cuối; hai id liền kề phân biệt được', async () => {
    const ids = await withAccountAutoIncrement(db, BIG_ID, async () => {
      const created = await addManyPatients(db, 2, 'Id Rất Lớn');
      const result = await search('id rất lớn');
      expect(idsOf(result)).toStrictEqual(created);
      return created;
    });

    expect(ids).toStrictEqual([BIG_ID, '9007199254740994']);
  });
});

describe('PatientLookupService.search trên MySQL thật — chỉ đọc', () => {
  it('PLI-10 (TC-14) nhiều lần tìm (có kết quả, rỗng, trang vượt cuối, theo SĐT, theo email) không đổi một hàng nào của mười bảng liên quan', async () => {
    await addPatientWithLinkedData(db, fx, {
      hoTen: 'Chủ Hồ Sơ',
      soDienThoai: '0901234567',
    });
    const before = await snapshotTables(db, LOOKUP_UNTOUCHED_TABLES);

    await search('chủ hồ sơ');
    await search('0901 234');
    await search('mail-');
    await search('khong-ai');
    await search('chủ', 9);
    await search('người thân');

    expect(await snapshotTables(db, LOOKUP_UNTOUCHED_TABLES)).toEqual(before);
  });

  it('PLI-11 (TC-16, Q20 = A) tìm không thêm dòng nhat_ky_hanh_dong nào', async () => {
    await addPatient(fx, { hoTen: 'Nguyễn Văn A' });
    const count = async () => {
      const rows: { n: string }[] = await db.query(
        'SELECT CAST(COUNT(*) AS CHAR) AS n FROM nhat_ky_hanh_dong',
      );
      return rows[0]?.n;
    };
    const before = await count();

    await search('nguyen');
    await search('khong-ai');

    expect(before).toBe('0');
    expect(await count()).toBe(before);
  });

  it('PLI-12 (không đọc bảng khác) MySQL tự đếm lượt đọc: một lần tìm chỉ làm tai_khoan và benh_nhan tăng; lich_hen, le_tan, vi_noi_bo, ma_xac_thuc, phien_dang_nhap, ho_so_nguoi_than đứng yên', async () => {
    await addPatientWithLinkedData(db, fx, { hoTen: 'Chủ Hồ Sơ' });
    const tables = [...LOOKUP_UNREAD_TABLES, 'tai_khoan', 'benh_nhan'];
    const before = await readCounts(db, tables);

    await search('chủ hồ sơ');
    await search('0300');

    const after = await readCounts(db, tables);
    for (const table of LOOKUP_UNREAD_TABLES) {
      expect(after[table], table).toBe(before[table]);
    }
    expect(after['tai_khoan']).toBeGreaterThan(before['tai_khoan']!);
    expect(after['benh_nhan']).toBeGreaterThan(before['benh_nhan']!);
  });

  it('PLI-12b khi performance_schema bị tắt thì máy dò NÉM LỖI rõ ràng, không im lặng bỏ qua (nên PLI-12 đỏ chứ không xanh giả)', async () => {
    vi.spyOn(db, 'query').mockResolvedValueOnce([{ enabled: 0 }]);

    await expect(readCounts(db, ['tai_khoan'])).rejects.toThrow(
      /performance_schema đang tắt/,
    );
  });
});

describe('PatientLookupService.search trên MySQL thật — múi giờ tiến trình', () => {
  useProcessTimeZone('America/New_York');

  it('PLI-16 dưới múi giờ America/New_York của tiến trình kết quả vẫn y hệt và không có khoá ngày giờ nào (B6 không trả cột DATE hay thời điểm)', async () => {
    // Mùa hè New York là UTC-4 ⇒ getTimezoneOffset() = 240; khác +07:00 của máy phát triển nên ca này không xanh giả
    expect(new Date('2026-07-01T12:00:00Z').getTimezoneOffset()).toBe(240);
    const id = await addPatient(fx, {
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
    });

    const result = await search('nguyen');

    expect(result.items).toHaveLength(1);
    expect(Object.keys(result).sort()).toStrictEqual(PAGE_KEYS);
    expect(result.items[0]).toStrictEqual({
      taiKhoanId: id,
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901234567',
      email: expect.stringMatching(/@example\.invalid$/) as string,
      trangThai: 'DangHoatDong',
    });
  });
});
