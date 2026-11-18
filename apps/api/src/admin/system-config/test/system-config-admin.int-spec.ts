import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { waitUntilWaiting } from '../../../appointments/testing/lock-wait.js';
import type { AuditEntry } from '../../../audit/audit-entry.js';
import { AuditError } from '../../../audit/audit-error.js';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import { CONFIG_DEMO } from '../../../database/seeds/catalog-data.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { CauHinhHeThong } from '../../entities/cau-hinh-he-thong.entity.js';
import { NhatKyHanhDong } from '../../entities/nhat-ky-hanh-dong.entity.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { SystemConfigAdminRepository } from '../system-config-admin.repository.js';
import { SystemConfigAdminService } from '../system-config-admin.service.js';
import type { UpdateSystemConfigDto } from '../system-config.dto.js';
import { SystemConfigRepository } from '../system-config.repository.js';
import { SystemConfigService } from '../system-config.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const REQUIRED_SEVEN = {
  soLichHenToiDaMoiHoSo: 3,
  soLanTuDoiLichToiDa: 2,
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  soNgayBaoTruocDoiGioLam: 3,
  trongSoW1: 0.6,
  trongSoW2: 0.4,
};
const COLUMNS = [
  'thoi_gian_giu_cho',
  'thoi_diem_nhac_lich',
  'so_lich_hen_toi_da_moi_ho_so',
  'so_lan_tu_doi_lich_toi_da',
  'check_in_truoc_phut',
  'check_in_sau_phut',
  'thoi_han_phan_hoi_loi_moi',
  'so_muc_cho_toi_da',
  'nguong_no_show',
  'so_ngay_bao_truoc_doi_gio_lam',
  'trong_so_w1',
  'trong_so_w2',
];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Quá hạn thì FAIL ngay với nhãn rõ (thay vì treo tới hết `testTimeout`): bằng chứng "bên này bị chặn" khi giả thuyết về khoá sai
function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`quá ${String(ms)} ms: ${label}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

describe('B5 CH — cập nhật cấu hình trên MySQL thật', () => {
  let db: DataSource;
  let fixtures: AdminFixtures;
  let repo: SystemConfigAdminRepository;
  let reader: SystemConfigService;
  let auditRepository: AuditRepository;
  let service: SystemConfigAdminService;
  let actorId: string;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    fixtures = new AdminFixtures(db);
    repo = new SystemConfigAdminRepository(db);
    reader = new SystemConfigService(new SystemConfigRepository(db));
    auditRepository = new AuditRepository();
    service = new SystemConfigAdminService(
      reader,
      repo,
      new AuditService(auditRepository),
      new BranchAccessPolicy(),
    );
  });
  beforeEach(async () => {
    await resetTables(db);
    actorId = (await fixtures.admin()).account.taiKhoanId;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => db?.destroy());

  const seed = (overrides: Partial<CauHinhHeThong> = {}) =>
    db.getRepository(CauHinhHeThong).insert({ ...CONFIG_DEMO, ...overrides });
  const put = (values: Record<string, unknown>, lyDo = 'Lý do thử') =>
    service.update(system, actorId, {
      lyDo,
      ...values,
    } as unknown as UpdateSystemConfigDto);
  const logs = () =>
    db
      .getRepository(NhatKyHanhDong)
      .find({ order: { nhatKyHanhDongId: 'ASC' } });
  const row = () => db.getRepository(CauHinhHeThong).findOneByOrFail({ id: 1 });
  const rowCount = () => db.getRepository(CauHinhHeThong).count();

  // Giữ giao dịch ĐẦU TIÊN gọi `lockRow` ngay sau khi nó đọc (và khoá) xong, cho tới khi `open()`; các lần gọi sau chạy thẳng.
  function holdFirstTransactionAfterLock() {
    const reached = deferred();
    const release = deferred();
    const original = repo.lockRow.bind(repo);
    let calls = 0;
    vi.spyOn(repo, 'lockRow').mockImplementation(async (manager) => {
      const found = await original(manager);
      calls += 1;
      if (calls === 1) {
        reached.resolve();
        await release.promise;
      }
      return found;
    });
    return { reached: reached.promise, open: release.resolve };
  }

  // Chạy `inspect` khi giao dịch ĐẦU TIÊN đang bị giữ. Dù `inspect` thành công hay ném lỗi (ví dụ đột biến làm B không bị chặn), luôn mở cổng và đợi các
  // việc đang chạy xong: không để giao dịch treo giữ khoá siêu dữ liệu làm `resetTables` của ca sau bị kẹt. Lỗi của việc chạy (nếu có) vẫn ra ở `await` của người gọi.
  async function whileHeld<T>(
    hold: ReturnType<typeof holdFirstTransactionAfterLock>,
    pending: Promise<unknown>[],
    inspect: () => Promise<T>,
  ): Promise<T> {
    try {
      return await inspect();
    } finally {
      hold.open();
      await Promise.allSettled(pending);
    }
  }

  const recordLocksOnConfigTable = async () => {
    const rows: { n: string | number }[] = await db.query(
      `SELECT COUNT(*) AS n FROM performance_schema.data_locks
       WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME = 'cau_hinh_he_thong' AND LOCK_TYPE = 'RECORD'`,
    );
    return Number(rows[0]?.n ?? 0);
  };

  describe('cập nhật khi đã có dòng', () => {
    it('CH-01: sửa MỘT tham số ⇒ cấu hình đổi và đúng MỘT dòng nhật ký đủ trường, cùng giao dịch', async () => {
      await seed();
      const result = await put({ thoiGianGiuCho: 20 }, 'Tăng giờ giữ chỗ');
      expect(result).toMatchObject({ chuaCauHinh: false, thoiGianGiuCho: 20 });
      expect((await row()).thoiGianGiuCho).toBe(20);
      const [log, ...rest] = await logs();
      expect(rest).toHaveLength(0);
      expect(log).toMatchObject({
        taiKhoanId: actorId,
        chiNhanhId: null,
        hanhDong: 'CapNhatCauHinh',
        loaiDoiTuong: 'cau_hinh_he_thong',
        ketQua: 'ThanhCong',
        chiTietThayDoi: {
          truoc: { thoi_gian_giu_cho: 15 },
          sau: { thoi_gian_giu_cho: 20 },
          ly_do: 'Tăng giờ giữ chỗ',
        },
      });
      expect(String(log!.maDoiTuong)).toBe('1');
      // Thời điểm là một mốc hợp lệ gần hiện tại (không kiểm giây: phụ thuộc múi giờ máy)
      expect(Math.abs(Date.now() - log!.thoiDiem.getTime())).toBeLessThan(
        24 * 3600 * 1000,
      );
    });

    it('CH-02: sửa NHIỀU tham số ⇒ MỘT dòng nhật ký gom, truoc và sau chỉ gồm tham số đổi, cùng tập khoá', async () => {
      await seed();
      await put({
        thoiGianGiuCho: 20,
        nguongNoShow: 5,
        thoiDiemNhacLich: [12, 48],
        trongSoW1: 0.7,
        trongSoW2: 0.3,
        soMucChoToiDa: 2, // không đổi: không được vào nhật ký
      });
      const saved = await row();
      expect(saved).toMatchObject({
        thoiGianGiuCho: 20,
        nguongNoShow: 5,
        thoiDiemNhacLich: [48, 12], // lưu giảm dần
        trongSoW1: '0.70',
        trongSoW2: '0.30',
        soMucChoToiDa: 2,
      });
      const all = await logs();
      expect(all).toHaveLength(1);
      const detail = all[0]!.chiTietThayDoi as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
      };
      expect(Object.keys(detail.truoc).sort()).toEqual(
        Object.keys(detail.sau).sort(),
      );
      expect(Object.keys(detail.sau).sort()).toEqual(
        [
          'nguong_no_show',
          'thoi_diem_nhac_lich',
          'thoi_gian_giu_cho',
          'trong_so_w1',
          'trong_so_w2',
        ].sort(),
      );
      expect(detail.truoc).toMatchObject({
        thoi_diem_nhac_lich: [72, 24, 2],
        trong_so_w1: 0.6,
        trong_so_w2: 0.4,
      });
      expect(detail.sau).toMatchObject({
        thoi_diem_nhac_lich: [48, 12],
        trong_so_w1: 0.7,
        trong_so_w2: 0.3,
      });
    });

    it('CH-03: không đổi gì ⇒ KHONG_CO_THAY_DOI, bảng cấu hình nguyên vẹn, 0 dòng nhật ký', async () => {
      await seed();
      for (const values of [
        {},
        { thoiGianGiuCho: 15 },
        { thoiDiemNhacLich: [2, 24, 72] },
        { trongSoW1: 0.6, trongSoW2: 0.4 },
      ])
        await expect(put(values)).rejects.toMatchObject({
          status: 400,
          maLoi: 'KHONG_CO_THAY_DOI',
        });
      expect(await row()).toEqual(CONFIG_DEMO);
      expect(await logs()).toHaveLength(0);
    });

    it('CH-13: gọi kiểu "tạo" (đủ bảy cột) khi đã có dòng ⇒ xử lý như cập nhật, không lỗi 1062', async () => {
      await seed();
      const result = await put({ ...REQUIRED_SEVEN, soLanTuDoiLichToiDa: 4 });
      expect(result.soLanTuDoiLichToiDa).toBe(4);
      expect(await rowCount()).toBe(1);
      const all = await logs();
      expect(all).toHaveLength(1);
      expect(all[0]!.chiTietThayDoi).toMatchObject({
        truoc: { so_lan_tu_doi_lich_toi_da: 2 },
        sau: { so_lan_tu_doi_lich_toi_da: 4 },
      });
    });

    it('CHB5-12: dòng cũ có giá trị NGOÀI miền service (DB cho phép): đọc trả nguyên, sửa tham số khác vẫn được và giữ nguyên giá trị cũ', async () => {
      await seed({ thoiGianGiuCho: 120 });
      expect((await service.read()).thoiGianGiuCho).toBe(120);
      await put({ nguongNoShow: 5 });
      expect(await row()).toMatchObject({
        thoiGianGiuCho: 120,
        nguongNoShow: 5,
      });
      expect((await logs())[0]!.chiTietThayDoi).toMatchObject({
        truoc: { nguong_no_show: 3 },
        sau: { nguong_no_show: 5 },
      });
    });

    it('CH-17 (một phần): đổi cấu hình không đụng bảng nào khác; yêu cầu thay đổi chi nhánh đã duyệt giữ so_ngay_bao_truoc đã chụp', async () => {
      await seed({ soNgayBaoTruocDoiGioLam: 3 });
      const branch = await fixtures.branch();
      await db.query(
        `INSERT INTO yeu_cau_thay_doi_chi_nhanh
          (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau, trang_thai,
           nguoi_duyet_id, thoi_diem_duyet, so_ngay_bao_truoc, hieu_luc_tu)
         VALUES (?, ?, JSON_OBJECT('ten', 'Cu'), JSON_OBJECT('ten', 'Moi'), 'DaDuyet',
           ?, '2026-11-01 09:00:00', 3, '2026-11-10 09:00:00')`,
        [branch.chiNhanhId, actorId, actorId],
      );
      const snapshot = () =>
        Promise.all([
          db.query('SELECT * FROM yeu_cau_thay_doi_chi_nhanh'),
          db.query('SELECT * FROM chi_nhanh'),
          db.query('SELECT COUNT(*) AS n FROM tai_khoan'),
        ]);
      const before = await snapshot();
      await put({ soNgayBaoTruocDoiGioLam: 5 });
      expect(await snapshot()).toEqual(before);
      const requests: { so_ngay_bao_truoc: number }[] = await db.query(
        'SELECT so_ngay_bao_truoc FROM yeu_cau_thay_doi_chi_nhanh',
      );
      expect(requests.map((r) => r.so_ngay_bao_truoc)).toEqual([3]);
      expect((await row()).soNgayBaoTruocDoiGioLam).toBe(5);
    });

    it('CH-18: khoá nhật ký là tên cột, giá trị là SỐ (w là DOUBLE, không chuỗi), nhắc lịch là mảng; không khoá thừa, không bí mật', async () => {
      await seed();
      await put({
        thoiGianGiuCho: 20,
        thoiDiemNhacLich: [48, 12],
        trongSoW1: 0.7,
        trongSoW2: 0.3,
      });
      const [log] = await logs();
      const detail = log!.chiTietThayDoi as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
        ly_do: unknown;
      };
      expect(Object.keys(detail).sort()).toEqual(['ly_do', 'sau', 'truoc']);
      expect(typeof detail.ly_do).toBe('string');
      for (const side of [detail.truoc, detail.sau])
        for (const [key, value] of Object.entries(side)) {
          expect(COLUMNS).toContain(key);
          expect(
            typeof value === 'number' ||
              (Array.isArray(value) &&
                value.every((item) => typeof item === 'number')),
            key,
          ).toBe(true);
        }
      // Kiểu JSON thật trong MySQL, không chỉ kiểu sau khi đọc về JS
      const types: Record<string, string>[] = await db.query(
        `SELECT JSON_TYPE(JSON_EXTRACT(chi_tiet_thay_doi, '$.sau.thoi_gian_giu_cho')) AS giu_cho,
                JSON_TYPE(JSON_EXTRACT(chi_tiet_thay_doi, '$.sau.trong_so_w1')) AS w1,
                JSON_TYPE(JSON_EXTRACT(chi_tiet_thay_doi, '$.sau.thoi_diem_nhac_lich')) AS nhac_lich
         FROM nhat_ky_hanh_dong`,
      );
      expect(types).toEqual([
        { giu_cho: 'INTEGER', w1: 'DOUBLE', nhac_lich: 'ARRAY' },
      ]);
    });
  });

  describe('đọc', () => {
    it('CH-10: chưa có dòng ⇒ chuaCauHinh = true, mười hai null; getOrThrow ⇒ HE_THONG_CHUA_CAU_HINH; có dòng thì GET trả giá trị thật', async () => {
      expect(await reader.get()).toBeNull();
      const empty = await service.read();
      expect(empty.chuaCauHinh).toBe(true);
      expect(Object.entries(empty).filter(([, v]) => v !== null)).toEqual([
        ['chuaCauHinh', true],
      ]);
      await expect(reader.getOrThrow()).rejects.toMatchObject({
        status: 409,
        maLoi: 'HE_THONG_CHUA_CAU_HINH',
      });
      expect(await rowCount()).toBe(0);
      await seed();
      expect(await service.read()).toMatchObject({
        chuaCauHinh: false,
        thoiGianGiuCho: 15,
        trongSoW1: 0.6,
        trongSoW2: 0.4,
        thoiDiemNhacLich: [72, 24, 2],
      });
    });

    it('CHB5-10: trong lúc một giao dịch đang GIỮ khoá hàng, người ĐỌC vẫn nhận giá trị đã commit NGAY (không chờ); sau commit thấy giá trị mới', async () => {
      await seed();
      const hold = holdFirstTransactionAfterLock();
      const writer = put({ thoiGianGiuCho: 20 });
      await hold.reached;
      const during = await whileHeld(hold, [writer], () =>
        withTimeout(reader.get(), 3000, 'người đọc bị chặn bởi giao dịch ghi'),
      );
      expect(during!.thoiGianGiuCho).toBe(15);
      await writer;
      expect((await reader.getOrThrow()).thoiGianGiuCho).toBe(20);
    });
  });

  describe('tạo lần đầu (Q35)', () => {
    it('CH-11 và CHB5-06: đủ bảy cột ⇒ tạo dòng, DB điền 5 cột DEFAULT, nhật ký truoc = null và sau đủ 12 giá trị thật', async () => {
      const result = await put(REQUIRED_SEVEN, 'Cấu hình lần đầu');
      expect(result.chuaCauHinh).toBe(false);
      expect(await row()).toEqual({
        id: 1,
        thoiGianGiuCho: 15,
        thoiDiemNhacLich: [72, 24, 2],
        soLichHenToiDaMoiHoSo: 3,
        soLanTuDoiLichToiDa: 2,
        checkInTruocPhut: 30,
        checkInSauPhut: 15,
        thoiHanPhanHoiLoiMoi: 60,
        soMucChoToiDa: 2,
        nguongNoShow: 3,
        soNgayBaoTruocDoiGioLam: 3,
        trongSoW1: '0.60',
        trongSoW2: '0.40',
      });
      const all = await logs();
      expect(all).toHaveLength(1);
      const detail = all[0]!.chiTietThayDoi as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
        ly_do: string;
      };
      expect(Object.keys(detail.truoc).sort()).toEqual([...COLUMNS].sort());
      expect(Object.values(detail.truoc).every((v) => v === null)).toBe(true);
      expect(detail.sau).toEqual({
        thoi_gian_giu_cho: 15,
        thoi_diem_nhac_lich: [72, 24, 2],
        so_lich_hen_toi_da_moi_ho_so: 3,
        so_lan_tu_doi_lich_toi_da: 2,
        check_in_truoc_phut: 30,
        check_in_sau_phut: 15,
        thoi_han_phan_hoi_loi_moi: 60,
        so_muc_cho_toi_da: 2,
        nguong_no_show: 3,
        so_ngay_bao_truoc_doi_gio_lam: 3,
        trong_so_w1: 0.6,
        trong_so_w2: 0.4,
      });
      expect(detail.ly_do).toBe('Cấu hình lần đầu');
    });

    it('CHB5-06: gửi kèm cột có DEFAULT thì ghi giá trị người dùng gửi (nhắc lịch lưu giảm dần)', async () => {
      await put({
        ...REQUIRED_SEVEN,
        thoiGianGiuCho: 30,
        thoiDiemNhacLich: [12, 48],
        soMucChoToiDa: 0,
      });
      expect(await row()).toMatchObject({
        thoiGianGiuCho: 30,
        thoiDiemNhacLich: [48, 12],
        soMucChoToiDa: 0,
        thoiHanPhanHoiLoiMoi: 60,
      });
    });

    it('CH-12: thiếu MỘT cột bắt buộc (lần lượt từng cột trong bảy) ⇒ 400 nêu đúng cột đó, không MySQL 1364, 0 dòng cấu hình, 0 nhật ký', async () => {
      for (const missing of Object.keys(REQUIRED_SEVEN)) {
        const values = Object.fromEntries(
          Object.entries(REQUIRED_SEVEN).filter(([key]) => key !== missing),
        );
        await expect(put(values)).rejects.toMatchObject({
          status: 400,
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          response: {
            loi: [{ truong: missing, ma: 'CAU_HINH_THIEU_GIA_TRI' }],
          },
        });
      }
      await expect(put({})).rejects.toMatchObject({ status: 400 });
      expect(await rowCount()).toBe(0);
      expect(await logs()).toHaveLength(0);
    });

    it('tạo lần đầu với w1 + w2 ≠ 1,00 ⇒ 400, không tạo gì', async () => {
      await expect(
        put({ ...REQUIRED_SEVEN, trongSoW1: 0.5, trongSoW2: 0.4 }),
      ).rejects.toMatchObject({ status: 400, maLoi: 'DU_LIEU_KHONG_HOP_LE' });
      expect(await rowCount()).toBe(0);
      expect(await logs()).toHaveLength(0);
    });

    it('CHB5-07 (TẤT ĐỊNH): người A đọc "chưa có dòng" rồi dừng; người B tạo trọn; A INSERT ⇒ 1062 ⇒ chạy lại thấy dòng và cập nhật; không ai thấy lỗi', async () => {
      const attempts = vi.spyOn(repo, 'transaction');
      const hold = holdFirstTransactionAfterLock();
      const a = put({ ...REQUIRED_SEVEN, thoiGianGiuCho: 20 }, 'A tạo');
      await hold.reached;
      // `READ COMMITTED`: A không giữ khoá nào nên B chạy trọn, không bị chặn. Nếu A giữ khoá khoảng trống (REPEATABLE READ) thì B đứng chờ ở INSERT:
      // quá 5 giây ⇒ FAIL với nhãn rõ (không treo), rồi `whileHeld` nhả A và đợi hai bên xong (InnoDB phát hiện deadlock ngay).
      const b = put({ ...REQUIRED_SEVEN, thoiGianGiuCho: 25 }, 'B tạo');
      await whileHeld(hold, [a, b], () =>
        withTimeout(b, 5000, 'B bị chặn bởi A (khoá khoảng trống?)'),
      );
      const resultA = await withTimeout(a, 10000, 'A không xong');
      expect(resultA.thoiGianGiuCho).toBe(20);
      expect(attempts).toHaveBeenCalledTimes(3); // A lần 1, B, A chạy lại
      expect(await rowCount()).toBe(1);
      expect((await row()).thoiGianGiuCho).toBe(20);
      const all = await logs();
      expect(
        all.map((l) => (l.chiTietThayDoi as { ly_do: string }).ly_do),
      ).toEqual(['B tạo', 'A tạo']);
      const [first, second] = all.map(
        (l) =>
          l.chiTietThayDoi as {
            truoc: Record<string, unknown>;
            sau: Record<string, unknown>;
          },
      );
      expect(Object.values(first!.truoc).every((v) => v === null)).toBe(true);
      expect(Object.keys(first!.sau)).toHaveLength(12);
      expect(second).toMatchObject({
        truoc: { thoi_gian_giu_cho: 25 },
        sau: { thoi_gian_giu_cho: 20 },
      });
    });

    it('CHB5-07b (ĐO KHOÁ): READ COMMITTED không giữ khoá nào khi khoá hàng chưa có; đối chứng dương: hàng đã có thì CÓ khoá bản ghi', async () => {
      // Đối chứng: phép đo thấy được khoá khi có hàng
      await seed();
      const withRow = holdFirstTransactionAfterLock();
      const first = put({ thoiGianGiuCho: 20 });
      await withRow.reached;
      await whileHeld(withRow, [first], async () => {
        expect(await recordLocksOnConfigTable()).toBeGreaterThanOrEqual(1);
      });
      await first;
      vi.restoreAllMocks();

      // Chưa có dòng: không khoá bản ghi (không gap lock)
      await db.getRepository(CauHinhHeThong).clear();
      const empty = holdFirstTransactionAfterLock();
      const second = put(REQUIRED_SEVEN);
      await empty.reached;
      await whileHeld(empty, [second], async () => {
        expect(await recordLocksOnConfigTable()).toBe(0);
      });
      await second;
      expect(await rowCount()).toBe(1);
    });

    it('CHB5-07c: 30 vòng hai người tạo lần đầu cùng lúc (đua tự do) ⇒ luôn cả hai thành công, một tạo một cập nhật, 2 dòng nhật ký, không 1062/1213', async () => {
      const attempts = vi.spyOn(repo, 'transaction');
      for (let round = 1; round <= 30; round += 1) {
        await db.query('DELETE FROM nhat_ky_hanh_dong');
        await db.query('DELETE FROM cau_hinh_he_thong');
        const results = await Promise.allSettled([
          put(
            { ...REQUIRED_SEVEN, thoiGianGiuCho: 20 },
            `A vòng ${String(round)}`,
          ),
          put(
            { ...REQUIRED_SEVEN, thoiGianGiuCho: 25 },
            `B vòng ${String(round)}`,
          ),
        ]);
        expect(
          results.map((r) => r.status),
          `vòng ${String(round)}: ${JSON.stringify(results)}`,
        ).toEqual(['fulfilled', 'fulfilled']);
        expect(await rowCount()).toBe(1);
        const all = await logs();
        expect(all, `vòng ${String(round)}`).toHaveLength(2);
        const [created, updated] = all.map(
          (l) => (l.chiTietThayDoi as { truoc: Record<string, unknown> }).truoc,
        );
        expect(Object.values(created!).every((v) => v === null)).toBe(true);
        expect(Object.keys(updated!)).toEqual(['thoi_gian_giu_cho']);
      }
      // Số lần chạy lại thật (tối thiểu 2 giao dịch mỗi vòng): ghi ra để Đại thấy tần suất đua
      console.info(
        `CHB5-07c: ${String(attempts.mock.calls.length)} giao dịch cho 30 vòng (60 = không vòng nào phải chạy lại)`,
      );
    });
  });

  describe('đua khi cập nhật (CH-16)', () => {
    it('CH-16: hai người sửa CÙNG tham số ⇒ tuần tự theo khoá hàng; truoc của lần sau = sau của lần trước; không mất cập nhật', async () => {
      await seed();
      const hold = holdFirstTransactionAfterLock();
      const a = put({ thoiGianGiuCho: 20 }, 'A');
      await hold.reached; // A đã khoá hàng
      const b = put({ thoiGianGiuCho: 30 }, 'B');
      // B phải ĐỨNG CHỜ khoá hàng (đo bằng performance_schema.data_lock_waits; quá hạn ⇒ FAIL, không treo)
      await whileHeld(hold, [a, b], () =>
        waitUntilWaiting(db, 'cau_hinh_he_thong', 1),
      );
      await Promise.all([a, b]);
      expect((await row()).thoiGianGiuCho).toBe(30);
      const all = await logs();
      expect(all.map((l) => l.chiTietThayDoi)).toEqual([
        {
          truoc: { thoi_gian_giu_cho: 15 },
          sau: { thoi_gian_giu_cho: 20 },
          ly_do: 'A',
        },
        {
          truoc: { thoi_gian_giu_cho: 20 },
          sau: { thoi_gian_giu_cho: 30 },
          ly_do: 'B',
        },
      ]);
    });

    it('CHB5-08: hai người sửa tham số KHÁC nhau cùng lúc ⇒ cả hai thay đổi đều còn (không mất cập nhật)', async () => {
      await seed();
      const hold = holdFirstTransactionAfterLock();
      const a = put({ thoiGianGiuCho: 20 }, 'A');
      await hold.reached;
      const b = put({ nguongNoShow: 5 }, 'B');
      await whileHeld(hold, [a, b], () =>
        waitUntilWaiting(db, 'cau_hinh_he_thong', 1),
      );
      await Promise.all([a, b]);
      expect(await row()).toMatchObject({
        thoiGianGiuCho: 20,
        nguongNoShow: 5,
      });
      const all = await logs();
      expect(all.map((l) => l.chiTietThayDoi)).toEqual([
        {
          truoc: { thoi_gian_giu_cho: 15 },
          sau: { thoi_gian_giu_cho: 20 },
          ly_do: 'A',
        },
        {
          truoc: { nguong_no_show: 3 },
          sau: { nguong_no_show: 5 },
          ly_do: 'B',
        },
      ]);
    });
  });

  describe('lỗi ghi nhật ký ⇒ rollback cả cấu hình (A4)', () => {
    it('CH-14: AuditService lỗi khi SỬA ⇒ báo lỗi, cấu hình giữ nguyên, 0 nhật ký; thử lại được', async () => {
      await seed();
      vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(
        new AuditError('AUDIT_WRITE_FAILED'),
      );
      await expect(put({ thoiGianGiuCho: 20 })).rejects.toThrow(
        'AUDIT_WRITE_FAILED',
      );
      expect((await row()).thoiGianGiuCho).toBe(15);
      expect(await logs()).toHaveLength(0);
      // Thử lại: lần này ghi nhật ký thật
      await put({ thoiGianGiuCho: 20 });
      expect((await row()).thoiGianGiuCho).toBe(20);
      expect(await logs()).toHaveLength(1);
    });

    it('CH-14: AuditService lỗi khi TẠO lần đầu ⇒ không để lại dòng cấu hình nào; thử lại tạo được', async () => {
      vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(
        new AuditError('AUDIT_WRITE_FAILED'),
      );
      await expect(put(REQUIRED_SEVEN)).rejects.toThrow('AUDIT_WRITE_FAILED');
      expect(await rowCount()).toBe(0);
      expect(await logs()).toHaveLength(0);
      await put(REQUIRED_SEVEN);
      expect(await rowCount()).toBe(1);
      expect(await logs()).toHaveLength(1);
    });

    it('CH-15: CHECK chk_nhat_ky_cap_nhat_cau_hinh của DB từ chối (ly_do rỗng ép ở tầng thấp) ⇒ rollback cấu hình', async () => {
      await seed();
      const original = auditRepository.insert.bind(auditRepository);
      vi.spyOn(auditRepository, 'insert').mockImplementationOnce(
        (manager, entry, at) =>
          original(
            manager,
            {
              ...entry,
              changes: { ...entry.changes, ly_do: '' },
            } as unknown as AuditEntry,
            at,
          ),
      );
      await expect(put({ thoiGianGiuCho: 20 })).rejects.toThrow(
        'AUDIT_WRITE_FAILED',
      );
      expect((await row()).thoiGianGiuCho).toBe(15);
      expect(await logs()).toHaveLength(0);
    });
  });
});
