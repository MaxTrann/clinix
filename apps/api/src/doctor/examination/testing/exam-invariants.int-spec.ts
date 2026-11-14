import { QueryFailedError, type DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { isDuplicateKeyError } from '../../../database/mysql-errors.js';
import { EXAM_AT } from './exam-fixtures.js';
import {
  assertExamInvariants,
  checkAuditMatchesState,
  checkCompletedKeepsSlot,
  checkHiddenReasonConsistent,
  checkOnePerAppointment,
  checkRatingOnCompletedOnly,
  type Violation,
} from './exam-invariants.js';
import { examWorld } from './exam-world.js';

// doctor-exam P3 (#393) — IVK-01…IVK-05 (PLAN 7.9) trên MySQL 8.4 THẬT, nếp `appointments/testing/invariants.int-spec.ts`: mỗi ca kiểm HAI chiều: dữ liệu sạch ⇒ không vi phạm; gài lỗi
// có chủ đích ⇒ bị bắt đúng hàng. Chưa có mã ghi của phần khám bệnh (B1, B2…) nên lỗi được gài bằng SQL thẳng; chỗ DB đang chặn (UNIQUE, CHECK) thì chạy trên BẢNG TẠM đã bỏ ràng buộc.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const column = (violations: Violation[], key: string) =>
  violations.map((v) => String(v[key]));

/** Lỗi MySQL (kèm mã) mà câu lệnh ném ra; thành công thì làm test đỏ. */
async function errnoOf(work: Promise<unknown>): Promise<number | undefined> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'câu lệnh phải bị MySQL từ chối').toBeInstanceOf(
    QueryFailedError,
  );
  return ((error as QueryFailedError).driverError as { errno?: number }).errno;
}

/** Thế giới khám bệnh kèm lối tắt gài lỗi vào khung giờ số `slot` của lịch (`w.w` là thế giới của booking: `w.w.booked(trạngThái, slot)`). */
async function world() {
  const w = await examWorld(db, fx);
  return {
    ...w,
    setSlot: (slot: number, assignments: string) =>
      db.query(`UPDATE khung_gio SET ${assignments} WHERE khung_gio_id = ?`, [
        w.w.slotId(slot),
      ]),
  };
}

interface TempTable {
  source: 'ho_so_kham' | 'danh_gia_bac_si';
  name: string;
  /** Bỏ UNIQUE `lich_hen_id` (IVK-01) */
  dropUnique?: boolean;
  /** Bỏ mọi CHECK (IVK-03) */
  dropChecks?: boolean;
}

/**
 * Các bảng tạm sao từ bảng thật (`LIKE`: không sao chép khoá ngoại), bỏ UNIQUE `lich_hen_id` hay mọi CHECK. MỘT kết nối cho tất cả (bảng tạm chỉ thấy được trên kết nối tạo ra nó);
 * dọn bảng khi xong để kết nối trả về pool không mang bảng tạm sang test khác.
 */
async function withTempTables<T>(
  tables: TempTable[],
  work: (runner: ReturnType<DataSource['createQueryRunner']>) => Promise<T>,
): Promise<T> {
  const runner = db.createQueryRunner();
  try {
    for (const table of tables) {
      await runner.query(
        `CREATE TEMPORARY TABLE ${table.name} LIKE ${table.source}`,
      );
      if (table.dropUnique === true)
        await runner.query(`ALTER TABLE ${table.name} DROP INDEX lich_hen_id`);
      if (table.dropChecks === true) {
        const [created] = (await runner.query(
          `SHOW CREATE TABLE ${table.name}`,
        )) as { 'Create Table': string }[];
        for (const match of (created?.['Create Table'] ?? '').matchAll(
          /CONSTRAINT `([^`]+)` CHECK/g,
        ))
          await runner.query(
            `ALTER TABLE ${table.name} DROP CHECK \`${match[1]}\``,
          );
      }
    }
    return await work(runner);
  } finally {
    for (const table of tables)
      await runner.query(`DROP TEMPORARY TABLE IF EXISTS ${table.name}`);
    await runner.release();
  }
}

describe('IVK-01 mỗi lịch có tối đa một hồ sơ khám và một đánh giá', () => {
  it('sạch ⇒ rỗng: lịch có đủ hồ sơ và đánh giá, lịch chỉ có hồ sơ, lịch không có gì', async () => {
    const w = await world();
    const done = await w.completed(0);
    await w.exam.record(done.lichHenId);
    await w.exam.rating(done.lichHenId);
    await w.exam.record((await w.inVisit(1)).lichHenId);
    await w.confirmed(2);
    expect(await checkOnePerAppointment(db)).toEqual([]);
  });

  it('DB TỪ CHỐI dòng thứ hai cùng lịch ở cả hai bảng (1062): IVK-01 không thể vi phạm bằng DML, lần thử hỏng không để lại dấu vết', async () => {
    const w = await world();
    const done = await w.completed(0);
    await w.exam.record(done.lichHenId);
    await w.exam.rating(done.lichHenId);
    expect(
      isDuplicateKeyError(
        await w.exam.record(done.lichHenId).catch((e: unknown) => e),
      ),
    ).toBe(true);
    expect(
      isDuplicateKeyError(
        await w.exam.rating(done.lichHenId).catch((e: unknown) => e),
      ),
    ).toBe(true);
    expect(await checkOnePerAppointment(db)).toEqual([]);
    await expect(assertExamInvariants(db)).resolves.toBeUndefined();
  });

  it('truy vấn BẮT ĐƯỢC khi không còn UNIQUE: hai bảng tạm đã bỏ chỉ mục lich_hen_id, mỗi bảng một lịch bị trùng và một lịch không trùng (biên)', async () => {
    const found = await withTempTables(
      [
        { source: 'ho_so_kham', name: 'ho_so_kham_ban_sao', dropUnique: true },
        {
          source: 'danh_gia_bac_si',
          name: 'danh_gia_ban_sao',
          dropUnique: true,
        },
      ],
      async (runner) => {
        for (const lich of [11, 11, 12])
          await runner.query(
            'INSERT INTO ho_so_kham_ban_sao (lich_hen_id, cap_nhat_lan_cuoi) VALUES (?, ?)',
            [lich, EXAM_AT],
          );
        for (const lich of [21, 22, 22, 22])
          await runner.query(
            'INSERT INTO danh_gia_ban_sao (lich_hen_id, so_sao, thoi_diem_tao) VALUES (?, 5, ?)',
            [lich, EXAM_AT],
          );
        return checkOnePerAppointment(runner, {
          hoSoKhamTable: 'ho_so_kham_ban_sao',
          danhGiaTable: 'danh_gia_ban_sao',
        });
      },
    );
    expect(
      found.map((v) => [v.bang, String(v.lichHenId), Number(v.soDong)]),
    ).toEqual([
      ['ho_so_kham', '11', 2],
      ['danh_gia_bac_si', '22', 3],
    ]);
  });

  it('tên bảng không hợp lệ bị từ chối (tên được ghép vào câu SQL)', async () => {
    await expect(
      checkOnePerAppointment(db, { hoSoKhamTable: 'ho_so_kham; DROP TABLE x' }),
    ).rejects.toThrow(/Tên bảng không hợp lệ/);
  });
});

describe('IVK-02 mọi đánh giá thuộc lịch Hoàn thành', () => {
  it('sạch ⇒ rỗng: đánh giá trên lịch HoanThanh', async () => {
    const w = await world();
    await w.exam.rating((await w.completed(0)).lichHenId);
    expect(await checkRatingOnCompletedOnly(db)).toEqual([]);
  });

  it('gài lỗi: đánh giá trên lịch ở mỗi trạng thái khác HoanThanh bị bắt đúng lịch, kể cả khi cùng có đánh giá hợp lệ (DB không chặn)', async () => {
    const w = await world();
    await w.exam.rating((await w.completed(0)).lichHenId);
    const states: TrangThaiLichHen[] = [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ];
    const wrong: Record<string, string> = {};
    for (const [index, state] of states.entries()) {
      const lich = await w.w.booked(state, index + 1);
      await w.exam.rating(lich.lichHenId);
      wrong[lich.lichHenId] = state;
    }
    const found = await checkRatingOnCompletedOnly(db);
    expect(found).toHaveLength(states.length);
    for (const violation of found)
      expect(violation.trangThai).toBe(wrong[String(violation.lichHenId)]);
  });
});

describe('IVK-03 bi_an = 1 khi và chỉ khi có lý do ẩn', () => {
  it('sạch ⇒ rỗng: (0, NULL), (1, lý do) và biên (1, chuỗi rỗng) không phải vi phạm của IVK-03', async () => {
    const w = await world();
    await w.exam.rating((await w.completed(0)).lichHenId);
    await w.exam.rating((await w.completed(1)).lichHenId, {
      biAn: true,
      lyDoAn: 'Nội dung quảng cáo',
    });
    await w.exam.rating((await w.completed(2)).lichHenId, {
      biAn: true,
      lyDoAn: '',
    });
    expect(await checkHiddenReasonConsistent(db)).toEqual([]);
  });

  it('DB TỪ CHỐI hai tổ hợp sai bằng CHECK chk_danh_gia_an (3819): (0, lý do) và (1, NULL)', async () => {
    const w = await world();
    const a = await w.completed(0);
    const b = await w.completed(1);
    expect(await errnoOf(w.exam.rating(a.lichHenId, { lyDoAn: 'x' }))).toBe(
      3819,
    );
    expect(await errnoOf(w.exam.rating(b.lichHenId, { biAn: true }))).toBe(
      3819,
    );
    expect(await checkHiddenReasonConsistent(db)).toEqual([]);
  });

  it('truy vấn BẮT ĐƯỢC khi không còn CHECK: bảng tạm đã bỏ CHECK, hai tổ hợp sai bị bắt, hai tổ hợp đúng thì không', async () => {
    const found = await withTempTables(
      [
        {
          source: 'danh_gia_bac_si',
          name: 'danh_gia_ban_sao',
          dropChecks: true,
        },
      ],
      async (runner) => {
        const insert = (lich: number, biAn: number, lyDo: string | null) =>
          runner.query(
            'INSERT INTO danh_gia_ban_sao (lich_hen_id, so_sao, bi_an, ly_do_an, thoi_diem_tao) VALUES (?, 5, ?, ?, ?)',
            [lich, biAn, lyDo, EXAM_AT],
          );
        await insert(1, 0, null);
        await insert(2, 1, 'Spam');
        await insert(3, 0, 'x');
        await insert(4, 1, null);
        return checkHiddenReasonConsistent(runner, {
          danhGiaTable: 'danh_gia_ban_sao',
        });
      },
    );
    expect(found.map((v) => [Number(v.biAn), v.lyDoAn])).toEqual([
      [0, 'x'],
      [1, null],
    ]);
  });
});

describe('IVK-04 nhật ký khớp trạng thái (AnDanhGia, SuaGhiChuKham)', () => {
  it('sạch ⇒ rỗng: đánh giá ẩn có đúng một dòng AnDanhGia, đánh giá chưa ẩn không có, hồ sơ có dòng SuaGhiChuKham', async () => {
    const w = await world();
    const hidden = await w.exam.rating((await w.completed(0)).lichHenId, {
      biAn: true,
      lyDoAn: 'Spam',
    });
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: hidden,
    });
    await w.exam.rating((await w.completed(1)).lichHenId);
    const record = await w.exam.record((await w.completed(2)).lichHenId);
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'SuaGhiChuKham',
      maDoiTuong: record,
    });
    expect(await checkAuditMatchesState(db)).toEqual([]);
  });

  it('gài lỗi: đánh giá ẩn thiếu nhật ký, đánh giá chưa ẩn có nhật ký, đánh giá ẩn có HAI dòng nhật ký đều bị bắt (mỗi cái đúng đánh giá của nó)', async () => {
    const w = await world();
    const audit = (id: string) =>
      w.exam.audit({
        taiKhoanId: w.adminId,
        hanhDong: 'AnDanhGia',
        maDoiTuong: id,
      });
    const hide = { biAn: true, lyDoAn: 'Spam' } as const;
    const noLog = await w.exam.rating((await w.completed(0)).lichHenId, hide);
    const notHidden = await w.exam.rating((await w.completed(1)).lichHenId);
    await audit(notHidden);
    const twice = await w.exam.rating((await w.completed(2)).lichHenId, hide);
    await audit(twice);
    await audit(twice);
    const good = await w.exam.rating((await w.completed(3)).lichHenId, hide);
    await audit(good);
    const found = await checkAuditMatchesState(db);
    expect(
      Object.fromEntries(
        found.map((v) => [String(v.maDoiTuong), Number(v.soDong)]),
      ),
    ).toEqual({
      [noLog]: 0,
      [notHidden]: 1,
      [twice]: 2,
    });
  });

  it('gài lỗi: dòng AnDanhGia trỏ đánh giá không có, dòng SuaGhiChuKham trỏ hồ sơ không có, AnDanhGia mang đối tượng sai bị bắt (mồ côi)', async () => {
    const w = await world();
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: '999001',
    });
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'SuaGhiChuKham',
      maDoiTuong: '999002',
    });
    // AnDanhGia nhưng trỏ id của một HỒ SƠ có thật: loai_doi_tuong là danh_gia_bac_si và không có đánh giá id đó ⇒ vẫn mồ côi
    const record = await w.exam.record((await w.completed(0)).lichHenId);
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: record,
    });
    const found = await checkAuditMatchesState(db);
    expect(found.map((v) => [v.hanhDong, String(v.maDoiTuong)])).toEqual([
      ['AnDanhGia', '999001'],
      ['SuaGhiChuKham', '999002'],
      ['AnDanhGia', record],
    ]);
  });

  it('biên: dòng ThatBai không tính. Đánh giá ẩn chỉ có dòng ThatBai vẫn thiếu nhật ký; dòng ThatBai thêm vào đánh giá đã có đúng một dòng ThanhCong không làm nó sai; ThatBai mồ côi không bị bắt', async () => {
    const w = await world();
    const hide = { biAn: true, lyDoAn: 'Spam' } as const;
    const failedOnly = await w.exam.rating(
      (await w.completed(0)).lichHenId,
      hide,
    );
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: failedOnly,
      ketQua: 'ThatBai',
    });
    const good = await w.exam.rating((await w.completed(1)).lichHenId, hide);
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: good,
    });
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'AnDanhGia',
      maDoiTuong: good,
      ketQua: 'ThatBai',
    });
    await w.exam.audit({
      taiKhoanId: w.adminId,
      hanhDong: 'SuaGhiChuKham',
      maDoiTuong: '999003',
      ketQua: 'ThatBai',
    });
    const found = await checkAuditMatchesState(db);
    expect(column(found, 'maDoiTuong')).toEqual([failedOnly]);
  });
});

describe('IVK-05 lịch Hoàn thành vẫn giữ khung giờ DaDat', () => {
  it('sạch ⇒ rỗng: lịch HoanThanh có khung giờ DaDat và giu_cho_den NULL', async () => {
    const w = await world();
    await w.completed(0);
    await w.inVisit(1);
    expect(await checkCompletedKeepsSlot(db)).toEqual([]);
  });

  it('gài lỗi: khung giờ của lịch HoanThanh bị nhả (ConTrong), bị giữ chỗ (DangGiuCho) hay còn giu_cho_den đều bị bắt; khung giờ lệch của lịch DaXacNhan KHÔNG thuộc IVK-05 (của INV-03 booking)', async () => {
    const w = await world();
    const freed = await w.completed(0);
    const held = await w.completed(1);
    const stale = await w.completed(2);
    const confirmed = await w.confirmed(3);
    await w.setSlot(0, "trang_thai = 'ConTrong'");
    await w.setSlot(1, `trang_thai = 'DangGiuCho', giu_cho_den = '${EXAM_AT}'`);
    await w.setSlot(2, `giu_cho_den = '${EXAM_AT}'`);
    await w.setSlot(3, "trang_thai = 'ConTrong'");
    const found = await checkCompletedKeepsSlot(db);
    expect(column(found, 'lichHenId').toSorted()).toEqual(
      [freed, held, stale].map((l) => l.lichHenId).toSorted(),
    );
    expect(column(found, 'lichHenId')).not.toContain(confirmed.lichHenId);
  });
});

describe('assertExamInvariants chạy cả năm bất biến', () => {
  it('dữ liệu sạch ⇒ không ném', async () => {
    const w = await world();
    const done = await w.completed(0);
    await w.exam.record(done.lichHenId);
    await w.exam.rating(done.lichHenId);
    await expect(assertExamInvariants(db)).resolves.toBeUndefined();
  });

  it('hai bất biến vỡ cùng lúc (IVK-02 và IVK-05) ⇒ ném lỗi nêu CẢ HAI mã và không nêu mã còn lại', async () => {
    const w = await world();
    await w.exam.rating((await w.confirmed(0)).lichHenId);
    await w.completed(1);
    await w.setSlot(1, "trang_thai = 'ConTrong'");
    const error = await assertExamInvariants(db).then(
      () => '',
      (thrown: unknown) => (thrown as Error).message,
    );
    expect(error).toContain('IVK-02');
    expect(error).toContain('IVK-05');
    for (const id of ['IVK-01', 'IVK-03', 'IVK-04'])
      expect(error).not.toContain(id);
  });
});
