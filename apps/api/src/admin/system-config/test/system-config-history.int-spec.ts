import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../../audit/audit.repository.js';
import { AuditService } from '../../../audit/audit.service.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { SystemConfigAdminRepository } from '../system-config-admin.repository.js';
import { SystemConfigAdminService } from '../system-config-admin.service.js';
import { SystemConfigHistoryRepository } from '../system-config-history.repository.js';
import { SystemConfigHistoryService } from '../system-config-history.service.js';
import type { UpdateSystemConfigDto } from '../system-config.dto.js';
import { SystemConfigRepository } from '../system-config.repository.js';
import { SystemConfigService } from '../system-config.service.js';

// Lịch sử thay đổi cấu hình trên MySQL thật (admin B6; TRACKING 9A.4 mục 3): CHB6-10…15, CHB6-18. Chạy nối tiếp, DB riêng `*_test`.
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
// Mốc gốc cố định (UTC) để dòng chèn tay có thời điểm xác định
const T0 = Date.UTC(2026, 10, 10, 3, 0, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const page = (pageNo: number, pageSize: number) => ({
  page: pageNo,
  pageSize,
  offset: (pageNo - 1) * pageSize,
});

// JSON hợp lệ của một dòng `CapNhatCauHinh` (đúng khuôn CHECK `chk_nhat_ky_cap_nhat_cau_hinh`)
const change = (n: number) => ({
  truoc: { thoi_gian_giu_cho: n },
  sau: { thoi_gian_giu_cho: n + 1 },
  ly_do: `Lý do ${String(n)}`,
});

const errnoOf = (error: unknown): unknown => {
  if (typeof error !== 'object' || error === null) return undefined;
  const wrapped: unknown = Reflect.get(error, 'driverError');
  return Reflect.get(
    typeof wrapped === 'object' && wrapped !== null ? wrapped : error,
    'errno',
  );
};

describe('B6 CH-19 — lịch sử thay đổi cấu hình trên MySQL thật', () => {
  let db: DataSource;
  let fixtures: AdminFixtures;
  let configService: SystemConfigAdminService;
  let history: SystemConfigHistoryService;
  let actorId: string;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    fixtures = new AdminFixtures(db);
    configService = new SystemConfigAdminService(
      new SystemConfigService(new SystemConfigRepository(db)),
      new SystemConfigAdminRepository(db),
      new AuditService(new AuditRepository()),
      new BranchAccessPolicy(),
    );
    history = new SystemConfigHistoryService(
      new SystemConfigHistoryRepository(db),
      new BranchAccessPolicy(),
    );
  });
  beforeEach(async () => {
    await resetTables(db);
    actorId = (await fixtures.admin(undefined, { hoTen: 'Nguyễn Văn A' }))
      .account.taiKhoanId;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  afterAll(async () => db?.destroy());

  // Chèn thẳng một dòng nhật ký (bỏ qua AuditService) để dựng dòng mồi và thời điểm xác định
  async function insertLog(row: {
    at: Date;
    actor?: string;
    action?: string;
    target?: string;
    targetId?: string;
    result?: 'ThanhCong' | 'ThatBai';
    json?: unknown;
  }): Promise<string> {
    const result: { insertId: number | string } = await db.query(
      `INSERT INTO nhat_ky_hanh_dong
         (tai_khoan_id, chi_nhanh_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua, chi_tiet_thay_doi)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        row.actor ?? actorId,
        row.action ?? 'CapNhatCauHinh',
        row.target ?? 'cau_hinh_he_thong',
        row.targetId ?? '1',
        row.at,
        row.result ?? 'ThanhCong',
        JSON.stringify(row.json ?? change(1)),
      ],
    );
    return String(result.insertId);
  }

  const put = (
    values: Record<string, unknown>,
    lyDo: string,
    actor = actorId,
  ) =>
    configService.update(system, actor, {
      lyDo,
      ...values,
    } as unknown as UpdateSystemConfigDto);

  const ids = async (pageNo: number, pageSize: number) =>
    (await history.history(system, page(pageNo, pageSize))).items.map(
      (item) => item.id,
    );

  it('CHB6-10 (CH-19): chỉ CapNhatCauHinh thành công; dòng mồi cùng đối tượng, loại khác và ThatBai không lọt và total không đếm chúng', async () => {
    const a = await insertLog({ at: at(1), json: change(1) });
    const b = await insertLog({ at: at(2), json: change(2) });
    const c = await insertLog({ at: at(3), json: change(3) });
    // Dòng mồi: DB cho phép hành động khác mang đối tượng cau_hinh_he_thong/1; CHECK chỉ ép chiều ngược lại
    await insertLog({ at: at(4), action: 'DoiQuyen', json: { x: 1 } });
    await insertLog({
      at: at(5),
      action: 'OverrideLichHen',
      target: 'lich_hen',
      targetId: '1',
      json: { truoc: { trang_thai: 'DaXacNhan' } },
    });
    await insertLog({
      at: at(6),
      action: 'DoiChiNhanhBacSi',
      target: 'tai_khoan',
      targetId: '5',
      json: { truoc: { chi_nhanh_id: '1' }, sau: { chi_nhanh_id: '2' } },
    });
    // Cùng hành động, cùng đối tượng, nhưng một lần ghi THẤT BẠI (DB cho phép; B5 không bao giờ ghi)
    await insertLog({ at: at(7), result: 'ThatBai', json: change(9) });
    const result = await history.history(system, page(1, 20));
    expect(result.items.map((item) => item.id)).toStrictEqual([c, b, a]);
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.lyDo)).toStrictEqual([
      'Lý do 3',
      'Lý do 2',
      'Lý do 1',
    ]);
  });

  it('CHB6-11 (CH-19, CH-11, CH-18): lịch sử SINH bằng PUT của B5 (tạo lần đầu, một tham số, nhiều tham số) rồi đọc lại mới → cũ, đúng truoc/sau/lý do/người/thời điểm', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T03:00:00.000Z'));
    await put({ ...REQUIRED_SEVEN }, 'Khởi tạo cấu hình');
    vi.setSystemTime(new Date('2026-11-18T03:05:00.000Z'));
    await put({ thoiGianGiuCho: 20 }, 'Tăng giờ giữ chỗ');
    vi.setSystemTime(new Date('2026-11-18T03:10:00.000Z'));
    await put(
      {
        thoiDiemNhacLich: [48, 12],
        soMucChoToiDa: 4,
        trongSoW1: 0.7,
        trongSoW2: 0.3,
      },
      'Đổi nhắc lịch và trọng số',
    );
    vi.useRealTimers();

    const result = await history.history(system, page(1, 20));
    expect(result.total).toBe(3);
    const [third, second, first] = result.items;
    expect(result.items.map((item) => item.thoiDiem)).toStrictEqual([
      '2026-11-18T03:10:00.000Z',
      '2026-11-18T03:05:00.000Z',
      '2026-11-18T03:00:00.000Z',
    ]);
    expect(result.items.map((item) => item.lyDo)).toStrictEqual([
      'Đổi nhắc lịch và trọng số',
      'Tăng giờ giữ chỗ',
      'Khởi tạo cấu hình',
    ]);
    expect(
      result.items.every((item) => item.nguoiThucHien === 'Nguyễn Văn A'),
    ).toBe(true);
    // Nhiều tham số: chỉ khoá đổi, theo thứ tự biểu mẫu (không theo thứ tự khoá JSON của MySQL)
    expect(third?.thayDoi).toStrictEqual([
      { khoa: 'thoiDiemNhacLich', truoc: [72, 24, 2], sau: [48, 12] },
      { khoa: 'soMucChoToiDa', truoc: 2, sau: 4 },
      { khoa: 'trongSoW1', truoc: 0.6, sau: 0.7 },
      { khoa: 'trongSoW2', truoc: 0.4, sau: 0.3 },
    ]);
    // Một tham số
    expect(second?.thayDoi).toStrictEqual([
      { khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 },
    ]);
    // Tạo lần đầu: đủ 12 mục, truoc là null, sau gồm cả năm cột DB tự điền DEFAULT
    expect(first?.thayDoi).toStrictEqual([
      { khoa: 'thoiGianGiuCho', truoc: null, sau: 15 },
      { khoa: 'thoiDiemNhacLich', truoc: null, sau: [72, 24, 2] },
      { khoa: 'soLichHenToiDaMoiHoSo', truoc: null, sau: 3 },
      { khoa: 'soLanTuDoiLichToiDa', truoc: null, sau: 2 },
      { khoa: 'checkInTruocPhut', truoc: null, sau: 30 },
      { khoa: 'checkInSauPhut', truoc: null, sau: 15 },
      { khoa: 'thoiHanPhanHoiLoiMoi', truoc: null, sau: 60 },
      { khoa: 'soMucChoToiDa', truoc: null, sau: 2 },
      { khoa: 'nguongNoShow', truoc: null, sau: 3 },
      { khoa: 'soNgayBaoTruocDoiGioLam', truoc: null, sau: 3 },
      { khoa: 'trongSoW1', truoc: null, sau: 0.6 },
      { khoa: 'trongSoW2', truoc: null, sau: 0.4 },
    ]);
    // id là chuỗi và giảm dần
    expect(result.items.every((item) => typeof item.id === 'string')).toBe(
      true,
    );
    expect(BigInt(third!.id) > BigInt(second!.id)).toBe(true);
    expect(BigInt(second!.id) > BigInt(first!.id)).toBe(true);
  });

  it('CHB6-12: sắp xếp ổn định: nhiều dòng CÙNG giây ⇒ id giảm dần; duyệt mọi trang (cỡ 2) không trùng, không sót', async () => {
    const oldest = await insertLog({ at: at(1) });
    const same: string[] = [];
    for (let index = 0; index < 4; index += 1)
      same.push(await insertLog({ at: at(10) })); // cùng một giây
    const newest = await insertLog({ at: at(20) });
    const expected = [
      newest,
      ...[...same].sort((x, y) => (BigInt(x) < BigInt(y) ? 1 : -1)),
      oldest,
    ];
    expect(await ids(1, 100)).toStrictEqual(expected);
    const walked = [
      ...(await ids(1, 2)),
      ...(await ids(2, 2)),
      ...(await ids(3, 2)),
      ...(await ids(4, 2)),
    ];
    expect(walked).toStrictEqual(expected);
    expect(new Set(walked).size).toBe(walked.length);
  });

  it('CHB6-13 (CH-19): biên phân trang trên 25 dòng: cỡ 1, 10, 100; trang cuối 5 dòng; page vượt cuối ⇒ rỗng, total đúng; offset sát biên an toàn ⇒ 200 rỗng', async () => {
    const inserted: string[] = [];
    for (let index = 1; index <= 25; index += 1)
      inserted.push(await insertLog({ at: at(index), json: change(index) }));
    const newestFirst = [...inserted].reverse();
    const first = await history.history(system, page(1, 10));
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 10 });
    expect(first.items.map((item) => item.id)).toStrictEqual(
      newestFirst.slice(0, 10),
    );
    expect(await ids(2, 10)).toStrictEqual(newestFirst.slice(10, 20));
    expect(await ids(3, 10)).toStrictEqual(newestFirst.slice(20, 25));
    expect(await ids(1, 1)).toStrictEqual([newestFirst[0]]);
    expect(await ids(1, 100)).toStrictEqual(newestFirst);
    // vượt cuối
    const beyond = await history.history(system, page(4, 10));
    expect(beyond).toStrictEqual({
      items: [],
      total: 25,
      page: 4,
      pageSize: 10,
    });
    // offset = 399999999999999 × 20 ≈ 8e15, vẫn là số nguyên an toàn: MySQL nhận, trả rỗng (không lỗi SQL)
    const huge = await history.history(system, page(400_000_000_000_000, 20));
    expect(huge.items).toStrictEqual([]);
    expect(huge.total).toBe(25);
  });

  it('CHB6-14: người thực hiện: hai người khác nhau hiện đúng từng người; người đã bị khoá (NgungHoatDong) vẫn hiện họ tên', async () => {
    const other = (await fixtures.admin(undefined, { hoTen: 'Trần Thị B' }))
      .account.taiKhoanId;
    await put({ ...REQUIRED_SEVEN }, 'A khởi tạo');
    await put({ thoiGianGiuCho: 25 }, 'B sửa', other);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [other],
    );
    const result = await history.history(system, page(1, 20));
    expect(
      result.items.map((item) => [item.lyDo, item.nguoiThucHien]),
    ).toStrictEqual([
      ['B sửa', 'Trần Thị B'],
      ['A khởi tạo', 'Nguyễn Văn A'],
    ]);
  });

  it('CHB6-15: chỉ đọc và nhất quán: giữa câu đếm và câu danh sách có dòng mới commit, items vẫn khớp total; câu ghi trong giao dịch bị từ chối; bảng nguyên vẹn', async () => {
    await insertLog({ at: at(1) });
    await insertLog({ at: at(2) });
    await insertLog({ at: at(3) });
    const checksum = async () =>
      (await db.query(
        'CHECKSUM TABLE nhat_ky_hanh_dong, cau_hinh_he_thong',
      )) as { Table: string; Checksum: string | number }[];

    const original = db.createQueryRunner.bind(db);
    let armed = true;
    let writeRejected: unknown;
    vi.spyOn(db, 'createQueryRunner').mockImplementation((mode) => {
      const runner = original(mode);
      if (!armed) return runner;
      armed = false; // chỉ bọc giao dịch của repository; lần gọi createQueryRunner kế tiếp (chèn dòng mới) dùng bản thật
      const realQuery = runner.query.bind(runner);
      runner.query = (async (sql: string, parameters?: unknown[]) => {
        if (sql.includes('n.nhat_ky_hanh_dong_id AS id')) {
          // Ngay TRƯỚC câu danh sách: (1) thử ghi trong giao dịch chỉ đọc; (2) một kết nối khác chèn thêm dòng và commit
          try {
            await realQuery(
              'UPDATE nhat_ky_hanh_dong SET ket_qua = ket_qua WHERE nhat_ky_hanh_dong_id = 0',
            );
          } catch (error) {
            writeRejected = error;
          }
          await insertLog({ at: at(4) });
        }
        return realQuery(sql, parameters);
      }) as unknown as typeof runner.query;
      return runner;
    });
    const result = await history.history(system, page(1, 100));
    vi.restoreAllMocks();

    // 1) ảnh chụp nhất quán: dòng thứ tư chèn giữa hai câu không có trong items, và total cũng chưa tính nó
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    // 2) câu ghi bị MySQL từ chối: 1792 ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION
    expect(errnoOf(writeRejected)).toBe(1792);
    // 3) lần gọi sau (giao dịch mới) thấy đủ bốn dòng
    expect((await history.history(system, page(1, 100))).total).toBe(4);

    // 4) nhiều lần đọc không làm đổi bảng nào (so bản chụp trước và sau các lần gọi)
    const before = await checksum();
    await history.history(system, page(1, 100));
    await history.history(system, page(2, 1));
    await history.history(system, page(1, 1));
    expect(await checksum()).toStrictEqual(before);
  });

  it('CHB6-18: chứng cứ tương đương: CHECK DB buộc mọi dòng CapNhatCauHinh có loai_doi_tuong = cau_hinh_he_thong và ma_doi_tuong = 1', async () => {
    for (const bad of [
      { target: 'tai_khoan' },
      { target: 'benh_nhan' },
      { targetId: '2' },
    ]) {
      const error = await insertLog({ at: at(1), ...bad }).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      expect(errnoOf(error)).toBe(3819); // ER_CHECK_CONSTRAINT_VIOLATED
    }
    expect((await history.history(system, page(1, 20))).total).toBe(0);
  });
});
