import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { APPOINTMENT_CODE_PATTERN } from '../../appointments/appointment-code.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import { PasswordHasher } from '../../auth/password/password-hasher.service.js';
import { assertExamInvariants } from '../../doctor/examination/testing/exam-invariants.js';
import { BranchHoursReader } from '../../scheduling/branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../../scheduling/leave/leave.reader.js';
import { AvailableSlotsReader } from '../../scheduling/slots/available-slots.reader.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import { DoctorDemoRepository } from './doctor-demo.repository.js';
import {
  COMMENT_EMOJI_AT_CUT,
  COMMENT_LONGEST,
  DEV_PATIENT_EMAIL,
  EXAM_DEMO_PATIENTS,
  examDemoCode,
} from './exam-demo-data.js';
import { ExamDemoRepository } from './exam-demo.repository.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { seedTransaction } from './seed-runner.js';
import { runSeed } from './seed.service.js';

// doctor-exam B10: seed exam-demo. Phủ EDS-01 đến EDS-11, EDS-13, EDS-15, EDS-16 (EDS-12 ở seed-config.spec, EDS-14 ở exam-demo-data.spec).
// `now` ghim qua constructor của repository: thứ Tư 10:00 giờ VN ngày 18/11/2026 và Chủ nhật 22/11/2026.
const NOW = new Date('2026-11-18T03:00:00.000Z');
const NOW_TEXT = '2026-11-18 10:00:00';
const SUNDAY = new Date('2026-11-22T03:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const TABLES = [
  'tai_khoan',
  'benh_nhan',
  'vi_noi_bo',
  'ho_so_nguoi_than',
  'lich_lam_viec',
  'khung_gio',
  'lich_hen',
  'ho_so_kham',
  'danh_gia_bac_si',
  'nhat_ky_hanh_dong',
] as const;

describe('doctor-exam B10 — seed exam-demo (MySQL thật)', () => {
  let db: DataSource;
  let hash: string;
  const settings = readTestDbSettings();
  const password = `${randomBytes(16).toString('hex')}1!`;
  const config = (command: SeedCommand): SeedConfig => ({
    command,
    database: settings,
    password,
  });
  beforeAll(async () => {
    db = await createTestDataSource(settings);
    hash = await new PasswordHasher().hash(password);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  const prerequisites = async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('dev-accounts'));
    await runSeed(db, config('search-demo'));
  };
  const seed = (now: Date = NOW) =>
    seedTransaction(db, async (manager) => {
      const demo = new ExamDemoRepository(manager, now);
      await demo.run(hash);
      return demo.counts;
    });
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);
  const snapshot = async () => {
    const rows: Record<string, number> = {};
    for (const table of TABLES)
      rows[table] = await count(`SELECT COUNT(*) AS n FROM ${table}`);
    return rows;
  };
  const thoiGianOf = async (n: number) =>
    (
      await db.query<{ t: string }[]>(
        `SELECT DATE_FORMAT(thoi_gian, '%Y-%m-%d %H:%i:%s') AS t FROM lich_hen WHERE ma_lich_hen = ?`,
        [examDemoCode(n)],
      )
    )[0]!.t;

  it('EDS-01 tạo đúng số hàng từng bảng: 34 lịch (3 DaTiepDon, 31 HoanThanh), 29 hồ sơ, 29 đánh giá (4 ẩn), 4 nhật ký, 6 bệnh nhân, 3 người thân, 34 ca; created = 151', async () => {
    await prerequisites();
    const before = await snapshot();
    const result = await seed();
    expect(result).toEqual({ created: 151, skipped: 0 });
    const after = await snapshot();
    const grew = (table: (typeof TABLES)[number]) =>
      after[table]! - before[table]!;
    expect(grew('tai_khoan')).toBe(6);
    expect(grew('benh_nhan')).toBe(6);
    expect(grew('vi_noi_bo')).toBe(6);
    expect(grew('ho_so_nguoi_than')).toBe(3);
    expect(grew('lich_lam_viec')).toBe(34);
    expect(grew('lich_hen')).toBe(34);
    expect(grew('ho_so_kham')).toBe(29);
    expect(grew('danh_gia_bac_si')).toBe(29);
    expect(grew('nhat_ky_hanh_dong')).toBe(4);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM khung_gio WHERE trang_thai = 'DaDat'`,
      ),
    ).toBe(34);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaTiepDon'`,
      ),
    ).toBe(3);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'HoanThanh'`,
      ),
    ).toBe(31);
    expect(
      await count(`SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE bi_an = 1`),
    ).toBe(4);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM nhat_ky_hanh_dong WHERE hanh_dong = 'AnDanhGia' AND ket_qua = 'ThanhCong'`,
      ),
    ).toBe(4);
  });

  it('EDS-01 qua runSeed (đồng hồ thật, CLI): băm Argon2id mật khẩu bệnh nhân mẫu, created = 151, không bác sĩ nào bị tạo thêm', async () => {
    await prerequisites();
    const doctors = await count('SELECT COUNT(*) AS n FROM bac_si');
    const result = await runSeed(db, config('exam-demo'));
    expect(result).toEqual({ created: 151, skipped: 0 });
    expect(await count('SELECT COUNT(*) AS n FROM bac_si')).toBe(doctors);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM tai_khoan WHERE email LIKE 'benhnhan0%@example.invalid' AND mat_khau_bam LIKE '$argon2id$%'`,
      ),
    ).toBe(6);
  });

  it('EDS-02 chạy hai lần không trùng: lần hai created = 0, skipped = created lần một, số hàng mọi bảng giữ nguyên', async () => {
    await prerequisites();
    const first = await seed();
    const shot = await snapshot();
    const second = await seed();
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created + first.skipped);
    expect(await snapshot()).toEqual(shot);
  });

  it('EDS-03 ngày trôi: chạy lại sau 3 ngày và sau 40 ngày vẫn không thêm gì (khoá là mã lịch, không phải ngày)', async () => {
    await prerequisites();
    await seed();
    const shot = await snapshot();
    for (const days of [3, 40]) {
      const again = await seed(new Date(NOW.getTime() + days * DAY_MS));
      expect(again.created).toBe(0);
      expect(await snapshot()).toEqual(shot);
    }
  });

  it('EDS-04 bất biến: IVK-01 đến IVK-05 của khám bệnh và INV khung giờ của booking sạch trên dữ liệu seed', async () => {
    await prerequisites();
    await seed();
    await expect(assertExamInvariants(db)).resolves.toBeUndefined();
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
  });

  it('EDS-17 (MOC-24) mốc từng bước của lịch mẫu (booking B19, dữ liệu giả): HoanThanh đủ ba mốc, DaTiepDon có xác nhận và tiếp đón và KHÔNG có hoàn thành; thứ tự tạo ≤ xác nhận ≤ tiếp đón ≤ hoàn thành; không mốc nào vượt giờ chạy seed; chạy lại không đổi mốc', async () => {
    await prerequisites();
    await seed();
    const read = () =>
      db.query<
        {
          trangThai: string;
          tao: string;
          xn: string | null;
          td: string | null;
          ht: string | null;
          conTuongLai: string;
        }[]
      >(
        `SELECT trang_thai AS trangThai, DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS tao,
                DATE_FORMAT(thoi_diem_xac_nhan, '%Y-%m-%d %H:%i:%s') AS xn, DATE_FORMAT(thoi_diem_tiep_don, '%Y-%m-%d %H:%i:%s') AS td,
                DATE_FORMAT(thoi_diem_hoan_thanh, '%Y-%m-%d %H:%i:%s') AS ht,
                (thoi_diem_xac_nhan > ? OR thoi_diem_tiep_don > ? OR thoi_diem_hoan_thanh > ?) AS conTuongLai
           FROM lich_hen ORDER BY lich_hen_id`,
        [NOW_TEXT, NOW_TEXT, NOW_TEXT],
      );
    const rows = await read();
    expect(rows).toHaveLength(34);
    for (const row of rows) {
      expect(row.xn, 'xác nhận').toBe(row.tao);
      expect(row.td, 'tiếp đón').not.toBeNull();
      expect(row.tao <= (row.xn ?? ''), 'tạo ≤ xác nhận').toBe(true);
      expect((row.xn ?? '') <= (row.td ?? ''), 'xác nhận ≤ tiếp đón').toBe(
        true,
      );
      expect(Number(row.conTuongLai), 'không vượt giờ chạy seed').toBe(0);
      if (row.trangThai === 'HoanThanh') {
        expect(row.ht, 'hoàn thành').not.toBeNull();
        expect((row.td ?? '') <= (row.ht ?? ''), 'tiếp đón ≤ hoàn thành').toBe(
          true,
        );
      } else {
        expect(row.trangThai).toBe('DaTiepDon');
        expect(row.ht, 'DaTiepDon chưa có mốc hoàn thành').toBeNull();
      }
    }
    expect(rows.filter((row) => row.trangThai === 'DaTiepDon')).toHaveLength(3);
    // Chạy lại: không đổi mốc nào (khoá là mã lịch)
    await seed();
    expect(await read()).toEqual(rows);
  });

  it('EDS-05 hình dạng lịch: mã đúng mẫu, ô DaDat khớp lịch, giờ và chi nhánh và dịch vụ khớp bác sĩ, ca đúng ngày chi nhánh mở và đủ số ô', async () => {
    await prerequisites();
    await seed();
    const codes = await db.query<{ code: string }[]>(
      'SELECT ma_lich_hen AS code FROM lich_hen ORDER BY lich_hen_id',
    );
    expect(codes).toHaveLength(34);
    expect(codes.every((row) => APPOINTMENT_CODE_PATTERN.test(row.code))).toBe(
      true,
    );
    // Mỗi lịch: ô là DaDat, cột sinh khung_gio_dang_giu trỏ đúng ô, thoi_gian = ngay_gio, chi nhánh/dịch vụ/giá khớp bác sĩ, ca thuộc đúng bác sĩ và ngày.
    expect(
      await count(
        `SELECT COUNT(*) AS n
           FROM lich_hen l
           JOIN khung_gio k ON k.khung_gio_id = l.khung_gio_id
           JOIN lich_lam_viec s ON s.lich_lam_viec_id = k.lich_lam_viec_id
           JOIN bac_si b ON b.tai_khoan_id = l.bac_si_id
           JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = l.dich_vu_kham_id
          WHERE k.trang_thai = 'DaDat' AND k.giu_cho_den IS NULL
            AND l.khung_gio_dang_giu = k.khung_gio_id AND l.thoi_gian = k.ngay_gio
            AND l.chi_nhanh_id = b.chi_nhanh_id AND l.dich_vu_kham_id = b.dich_vu_kham_id
            AND l.gia_snapshot = dv.gia_mac_dinh AND l.tien_coc_snapshot = 0
            AND s.bac_si_id = l.bac_si_id AND s.chi_nhanh_id = l.chi_nhanh_id AND DATE(k.ngay_gio) = s.ngay`,
      ),
    ).toBe(34);
    // Ca nằm ở ngày chi nhánh nhận khám ca đó, và đủ số ô của cửa sổ ca (ô DaDat nằm TRÊN lưới: nếu lệch lưới thì thừa một ô).
    const badShifts = await db.query<{ id: string }[]>(
      `SELECT s.lich_lam_viec_id AS id
         FROM lich_lam_viec s
         JOIN bac_si b ON b.tai_khoan_id = s.bac_si_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
         LEFT JOIN chi_nhanh_lich_hoat_dong h
                ON h.chi_nhanh_id = s.chi_nhanh_id AND h.thu_trong_tuan = WEEKDAY(s.ngay) + 1 AND h.hoat_dong = 1
         LEFT JOIN khung_gio k ON k.lich_lam_viec_id = s.lich_lam_viec_id
        GROUP BY s.lich_lam_viec_id, s.ca, dv.thoi_luong, h.chi_nhanh_id,
                 h.gio_bat_dau_sang, h.gio_ket_thuc_sang, h.gio_bat_dau_chieu, h.gio_ket_thuc_chieu
       HAVING h.chi_nhanh_id IS NULL
           OR COUNT(k.khung_gio_id) <> (CASE s.ca
                WHEN 'CaSang' THEN TIME_TO_SEC(h.gio_ket_thuc_sang) - TIME_TO_SEC(h.gio_bat_dau_sang)
                ELSE TIME_TO_SEC(h.gio_ket_thuc_chieu) - TIME_TO_SEC(h.gio_bat_dau_chieu) END) DIV (dv.thoi_luong * 60)`,
    );
    expect(badShifts).toEqual([]);
  });

  it('EDS-06 đánh giá và hồ sơ: đủ 1 đến 5 sao (10, 8, 5, 3, 3), 4 đánh giá ẩn đều có lý do, chưa ẩn không có lý do, nhận xét 1.000 và emoji khứ hồi nguyên vẹn, giờ ghi sau giờ khám và không vượt bây giờ', async () => {
    await prerequisites();
    await seed();
    const stars = await db.query<{ s: number; n: string }[]>(
      'SELECT so_sao AS s, COUNT(*) AS n FROM danh_gia_bac_si GROUP BY so_sao ORDER BY so_sao DESC',
    );
    expect(stars.map((row) => [Number(row.s), Number(row.n)])).toEqual([
      [5, 10],
      [4, 8],
      [3, 5],
      [2, 3],
      [1, 3],
    ]);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE bi_an = 1 AND CHAR_LENGTH(ly_do_an) BETWEEN 10 AND 255`,
      ),
    ).toBe(4);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE bi_an = 0 AND ly_do_an IS NOT NULL',
      ),
    ).toBe(0);
    expect(
      await count(
        'SELECT MAX(CHAR_LENGTH(nhan_xet)) AS n FROM danh_gia_bac_si',
      ),
    ).toBe(1000);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE nhan_xet IS NULL',
      ),
    ).toBe(6);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM danh_gia_bac_si WHERE INSTR(nhan_xet, CHAR(10)) > 0',
      ),
    ).toBe(1);
    const text = async (n: number) =>
      (
        await db.query<{ t: string }[]>(
          `SELECT d.nhan_xet AS t FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id WHERE l.ma_lich_hen = ?`,
          [examDemoCode(n)],
        )
      )[0]!.t;
    expect(await text(11)).toBe(COMMENT_LONGEST);
    expect(await text(15)).toBe(COMMENT_EMOJI_AT_CUT);
    // Giờ ghi: đánh giá và hồ sơ của lịch HoanThanh sau giờ khám; mọi giờ ghi không vượt bây giờ (kể cả hồ sơ của lịch DaTiepDon hôm nay).
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id
          WHERE d.thoi_diem_tao < l.thoi_gian OR d.thoi_diem_tao > ?`,
        [NOW_TEXT],
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM ho_so_kham h JOIN lich_hen l ON l.lich_hen_id = h.lich_hen_id
          WHERE h.cap_nhat_lan_cuoi > ? OR (l.trang_thai = 'HoanThanh' AND h.cap_nhat_lan_cuoi < l.thoi_gian)`,
        [NOW_TEXT],
      ),
    ).toBe(0);
  });

  it('EDS-07 phủ kịch bản kiểm tay: HoanThanh không hồ sơ, có hồ sơ chưa đánh giá, DaTiepDon có và không hồ sơ, lịch người thân (một hồ sơ ngừng), đánh giá ở 4 chi nhánh và Admin chi nhánh chỉ thấy 14', async () => {
    await prerequisites();
    await seed();
    const completed = (extra: string) =>
      count(
        `SELECT COUNT(*) AS n FROM lich_hen l
          LEFT JOIN ho_so_kham h ON h.lich_hen_id = l.lich_hen_id
          LEFT JOIN danh_gia_bac_si d ON d.lich_hen_id = l.lich_hen_id
          WHERE l.trang_thai = 'HoanThanh' AND ${extra}`,
      );
    expect(
      await completed(
        'h.ho_so_kham_id IS NULL AND d.danh_gia_bac_si_id IS NULL',
      ),
    ).toBe(1);
    expect(
      await completed(
        'h.ho_so_kham_id IS NOT NULL AND d.danh_gia_bac_si_id IS NULL',
      ),
    ).toBe(1);
    expect(
      await completed(
        'h.ho_so_kham_id IS NULL AND d.danh_gia_bac_si_id IS NOT NULL',
      ),
    ).toBe(2);
    const received = (extra: string) =>
      count(
        `SELECT COUNT(*) AS n FROM lich_hen l LEFT JOIN ho_so_kham h ON h.lich_hen_id = l.lich_hen_id
          WHERE l.trang_thai = 'DaTiepDon' AND ${extra}`,
      );
    expect(await received('h.ho_so_kham_id IS NULL')).toBe(2);
    expect(await received('h.ho_so_kham_id IS NOT NULL')).toBe(1);
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM lich_hen WHERE ho_so_nguoi_than_id IS NOT NULL',
      ),
    ).toBe(3);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lich_hen l JOIN ho_so_nguoi_than r ON r.ho_so_nguoi_than_id = l.ho_so_nguoi_than_id
          WHERE r.trang_thai_hieu_luc = 0`,
      ),
    ).toBe(1);
    const perBranch = await db.query<{ n: string }[]>(
      `SELECT COUNT(*) AS n FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id
        JOIN chi_nhanh c ON c.chi_nhanh_id = l.chi_nhanh_id GROUP BY c.chi_nhanh_id ORDER BY c.chi_nhanh_id`,
    );
    expect(perBranch.map((row) => Number(row.n))).toEqual([14, 5, 5, 5]);
    // Admin Chi nhánh (dev-accounts) được gán chi nhánh mẫu 1: truy vấn phạm vi chi nhánh của kiểm duyệt thấy đúng 14 đánh giá.
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id
          JOIN quan_tri_vien q ON q.chi_nhanh_id = l.chi_nhanh_id
          JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id WHERE t.email = 'admin.branch@example.invalid'`,
      ),
    ).toBe(14);
  });

  it('EDS-08 thiếu tiền đề thì từ chối bằng mã rõ ràng và rollback toàn bộ: chưa có dev-accounts ⇒ SEED_DEV_ACCOUNTS_REQUIRED; chưa có search-demo ⇒ SEED_DOCTORS_REQUIRED; thiếu admin.system ⇒ SEED_DEV_ACCOUNTS_REQUIRED', async () => {
    await runSeed(db, config('catalog'));
    const bare = await snapshot();
    await expect(seed()).rejects.toMatchObject({
      code: 'SEED_DEV_ACCOUNTS_REQUIRED',
    });
    expect(await snapshot()).toEqual(bare);

    await runSeed(db, config('dev-accounts'));
    const withDev = await snapshot();
    await expect(seed()).rejects.toMatchObject({
      code: 'SEED_DOCTORS_REQUIRED',
    });
    expect(await snapshot()).toEqual(withDev);

    // Đủ bệnh nhân và bác sĩ nhưng thiếu Admin toàn hệ thống (người ẩn đánh giá trong nhật ký) ⇒ cũng SEED_DEV_ACCOUNTS_REQUIRED, không lỗi lạ.
    await runSeed(db, config('search-demo'));
    await db.query(
      `DELETE q FROM quan_tri_vien q JOIN tai_khoan t ON t.tai_khoan_id = q.tai_khoan_id WHERE t.email = 'admin.system@example.invalid'`,
    );
    await db.query(
      `DELETE FROM tai_khoan WHERE email = 'admin.system@example.invalid'`,
    );
    const withoutAdmin = await snapshot();
    await expect(seed()).rejects.toMatchObject({
      code: 'SEED_DEV_ACCOUNTS_REQUIRED',
    });
    expect(await snapshot()).toEqual(withoutAdmin);
  });

  it('EDS-09 không ghi đè: sửa tay một đánh giá, một hồ sơ và hoàn thành một lịch DaTiepDon rồi chạy lại thì giữ nguyên các thay đổi đó', async () => {
    await prerequisites();
    await seed();
    await db.query(
      `UPDATE danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id SET d.so_sao = 2 WHERE l.ma_lich_hen = ?`,
      [examDemoCode(3)],
    );
    await db.query(
      `UPDATE ho_so_kham h JOIN lich_hen l ON l.lich_hen_id = h.lich_hen_id SET h.chan_doan_so_bo = 'Đã sửa tay' WHERE l.ma_lich_hen = ?`,
      [examDemoCode(3)],
    );
    await db.query(
      `UPDATE lich_hen SET trang_thai = 'HoanThanh' WHERE ma_lich_hen = ?`,
      [examDemoCode(1)],
    );
    const shot = await snapshot();
    const again = await seed();
    expect(again.created).toBe(0);
    expect(await snapshot()).toEqual(shot);
    expect(
      await count(
        `SELECT d.so_sao AS n FROM danh_gia_bac_si d JOIN lich_hen l ON l.lich_hen_id = d.lich_hen_id WHERE l.ma_lich_hen = ?`,
        [examDemoCode(3)],
      ),
    ).toBe(2);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM ho_so_kham h JOIN lich_hen l ON l.lich_hen_id = h.lich_hen_id
          WHERE l.ma_lich_hen = ? AND h.chan_doan_so_bo = 'Đã sửa tay'`,
        [examDemoCode(3)],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lich_hen WHERE ma_lich_hen = ? AND trang_thai = 'HoanThanh'`,
        [examDemoCode(1)],
      ),
    ).toBe(1);
  });

  it('EDS-10 email bệnh nhân mẫu đã dùng cho tài khoản khác loại ⇒ SEED_ACCOUNT_CONFLICT và rollback (hai bệnh nhân tạo trước đó cũng không còn)', async () => {
    await prerequisites();
    await db.query(
      `INSERT INTO tai_khoan (ho_ten, so_dien_thoai, email, mat_khau_bam, trang_thai, da_xac_minh_email, loai_tai_khoan)
       VALUES ('Lễ tân trùng email', '0900000999', ?, 'khong-dung-de-dang-nhap', 'DangHoatDong', 1, 'LeTan')`,
      [EXAM_DEMO_PATIENTS[2]!.email],
    );
    const shot = await snapshot();
    await expect(seed()).rejects.toMatchObject({
      code: 'SEED_ACCOUNT_CONFLICT',
    });
    expect(await snapshot()).toEqual(shot);
  });

  it('EDS-11 ca của doctor-demo có sẵn hôm nay: DaTiepDon lùi về ngày chưa có ca, không ô nào của doctor-demo bị đổi, bất biến khung giờ sạch', async () => {
    await prerequisites();
    // doctor-demo chạy từ hôm qua ⇒ phân công 18/11 đến 01/12: hôm nay (18/11) đã có ca của mọi bác sĩ.
    await seedTransaction(db, async (manager) => {
      await new DoctorDemoRepository(
        manager,
        new Date(NOW.getTime() - DAY_MS),
      ).run();
    });
    const slotsBefore = await db.query<{ id: string; s: string }[]>(
      'SELECT khung_gio_id AS id, trang_thai AS s FROM khung_gio ORDER BY khung_gio_id',
    );
    const shiftsBefore = await count('SELECT COUNT(*) AS n FROM lich_lam_viec');
    expect(slotsBefore.every((row) => row.s === 'ConTrong')).toBe(true);

    expect((await seed()).created).toBe(151);
    for (const n of [1, 2, 13])
      expect((await thoiGianOf(n)).slice(0, 10) < '2026-11-18').toBe(true);
    const slotsAfter = await db.query<{ id: string; s: string }[]>(
      `SELECT khung_gio_id AS id, trang_thai AS s FROM khung_gio WHERE khung_gio_id <= ? ORDER BY khung_gio_id`,
      [slotsBefore.at(-1)!.id],
    );
    expect(slotsAfter).toEqual(slotsBefore);
    expect(await count('SELECT COUNT(*) AS n FROM lich_lam_viec')).toBe(
      shiftsBefore + 34,
    );
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
    await expect(assertExamInvariants(db)).resolves.toBeUndefined();
  });

  it('EDS-13 chạy vào Chủ nhật: lịch DaTiepDon của chi nhánh nghỉ Chủ nhật lùi về thứ Bảy 21/11, vẫn đủ 34 lịch và bất biến sạch', async () => {
    await prerequisites();
    expect(await seed(SUNDAY)).toMatchObject({ created: 151 });
    for (const n of [1, 2, 13])
      expect((await thoiGianOf(n)).slice(0, 10)).toBe('2026-11-21');
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaTiepDon' AND DAYOFWEEK(thoi_gian) = 1`,
      ),
    ).toBe(0);
    expect(await count('SELECT COUNT(*) AS n FROM lich_hen')).toBe(34);
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
    await expect(assertExamInvariants(db)).resolves.toBeUndefined();
  });

  it('EDS-15 bệnh nhân mẫu cùng hình dạng với bệnh nhân của dev-accounts: tai_khoan, benh_nhan, vi_noi_bo giống từng cột; hồ sơ người thân đủ cột bắt buộc và đúng chủ', async () => {
    await prerequisites();
    await seed();
    const shape = (email: string) =>
      db.query(
        `SELECT t.loai_tai_khoan, t.trang_thai, t.da_xac_minh_email, t.so_lan_dang_nhap_sai, t.khoa_dang_nhap_den,
                t.ngay_sinh, t.gioi_tinh, t.dia_chi, t.anh_dai_dien, (t.mat_khau_bam IS NOT NULL) AS co_mat_khau,
                b.so_lan_no_show, b.khoa_dat_lich_do_no_show, v.so_du, v.so_tien_dang_giu
           FROM tai_khoan t
           JOIN benh_nhan b ON b.tai_khoan_id = t.tai_khoan_id
           JOIN vi_noi_bo v ON v.benh_nhan_id = t.tai_khoan_id
          WHERE t.email = ?`,
        [email],
      );
    const expected = await shape(DEV_PATIENT_EMAIL);
    expect(expected).toHaveLength(1);
    for (const patient of EXAM_DEMO_PATIENTS) {
      expect(patient.email.endsWith('@example.invalid')).toBe(true);
      expect(await shape(patient.email)).toEqual(expected);
    }
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM ho_so_nguoi_than r JOIN tai_khoan t ON t.tai_khoan_id = r.benh_nhan_id
          WHERE t.email = ? AND r.ngay_sinh IS NOT NULL AND r.gioi_tinh IN ('Nam', 'Nu') AND r.moi_quan_he IS NOT NULL`,
        [DEV_PATIENT_EMAIL],
      ),
    ).toBe(3);
  });

  it('EDS-16 ca và khung giờ quá khứ không làm hỏng bộ đọc khung giờ công khai: AvailableSlotsReader thật cho ngày quá khứ chỉ có HetHan, ngày hôm nay không có ô đã qua giờ ở trạng thái khác HetHan và ô DaDat của lịch mẫu không là ConTrong', async () => {
    await prerequisites();
    await seed();
    const reader = new AvailableSlotsReader(
      db,
      new BranchHoursReader(),
      new LeaveReader(),
    );
    const doctorId = (
      await db.query<{ id: string }[]>(
        `SELECT CAST(bac_si_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?`,
        [examDemoCode(8)],
      )
    )[0]!.id;
    // E0008 (bác sĩ dev, 1 ngày trước) nằm ở 17/11.
    const past = (await thoiGianOf(8)).slice(0, 10);
    expect(past).toBe('2026-11-17');
    const [pastDay] = await reader.listMany({
      bacSiIds: [doctorId],
      ngay: past,
      now: NOW,
    });
    expect(pastDay!.trangThaiNgay).toBe('CoLich');
    expect(pastDay!.khungGio.length).toBeGreaterThan(0);
    expect(pastDay!.khungGio.every((slot) => slot.trangThai === 'HetHan')).toBe(
      true,
    );

    // Hôm nay (18/11): ca của E0001 (08:00, đã qua giờ) và E0002 (ca chiều, còn ở tương lai).
    const [today] = await reader.listMany({
      bacSiIds: [doctorId],
      ngay: '2026-11-18',
      now: NOW,
    });
    expect(today!.trangThaiNgay).toBe('CoLich');
    for (const slot of today!.khungGio)
      if (new Date(slot.batDau).getTime() <= NOW.getTime())
        expect(slot.trangThai).toBe('HetHan');
    const bookedSlotId = (
      await db.query<{ id: string }[]>(
        `SELECT CAST(khung_gio_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?`,
        [examDemoCode(2)],
      )
    )[0]!.id;
    expect(
      today!.khungGio.find((slot) => slot.khungGioId === bookedSlotId)
        ?.trangThai,
    ).toBe('DaDat');
  });
});
