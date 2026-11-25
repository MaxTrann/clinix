import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import { findLockOrderViolation } from '../../../appointments/locking/lock-order.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { retryStats } from '../../../appointments/testing/concurrency-report.js';
import {
  expectLichLockByPrimaryKey,
  expectNoHigherTierTables,
  lockedTablesOf,
} from '../../../appointments/testing/lock-chain.js';
import {
  firstTableOf,
  isLockingStatement,
} from '../../../appointments/testing/query-spy.js';
import { mysqlError } from '../../../appointments/testing/scripted-entity-manager.js';
import {
  failAfterStatement,
  recordStatements,
} from '../../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import {
  appException,
  countRows,
  examCompletionStack,
  thongBaoRows,
  untouchedByCompletion,
} from '../testing/exam-completion-stack.js';
import { examWorld } from '../testing/exam-world.js';
import { buildCompletedText } from '../notifications/exam-notifier.js';
import { READ_OWNED_APPOINTMENT_SQL } from './exam-completion.repository.js';

// doctor-exam B1 — ExamCompletionService THẬT trên MySQL 8.4 THẬT (PLAN 5.3, 5.4, 7.2 HTK-01…HTK-13, 7.11 TDK-01, TDK-06): `complete` THẬT của booking trong `withBookingTransaction` THẬT, `ExamNotifier` THẬT.
// Phần ĐƠN VỊ (không DB): exam-completion.service.spec.ts. Phần HTTP: test/doctor-exam-complete.e2e-spec.ts. Phần đồng thời: exam-completion.concurrency.int-spec.ts. Đồng hồ giả (T0 của `useIntegrationHooks`;
// ca cần mốc riêng tự đặt). Dữ liệu giả; mọi lịch dựng qua `examWorld` nên khung giờ luôn nhất quán với trạng thái.
let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

const COMPLETED = 'LichHenHoanThanh';

async function setup() {
  const w = await examWorld(db, fx);
  const { service, stack } = examCompletionStack(db);
  return { ...w, service, stack };
}
type World = Awaited<ReturnType<typeof setup>>;

/** Ảnh chụp lịch và khung giờ số `slot`, cộng số dòng `thong_bao` và các bảng HTK-12: "không đổi một byte" khi so hai lần. */
async function snapshot(w: World, lich: Parameters<World['w']['snapshot']>[0]) {
  return {
    lich: await w.w.snapshot(lich, 0),
    thongBao: await thongBaoRows(db),
    rest: await untouchedByCompletion(db),
  };
}

describe('HTK-01, TDK-01 hoàn thành ca khám DaTiepDon của đúng bác sĩ', () => {
  it('lịch HoanThanh; khung giờ vẫn DaDat; MỘT thong_bao LichHenHoanThanh cho tài khoản ĐẶT (không cho bác sĩ); thoi_diem_tao = toSecond(nowVN()) kể cả khi đồng hồ ở :59.999; INV', async () => {
    vi.setSystemTime(new Date('2026-11-10T09:00:59.999+07:00'));
    const w = await setup();
    const lich = await w.inVisit(0);

    await expect(
      w.service.complete(w.doctorId, lich.maLichHen),
    ).resolves.toEqual({ maLichHen: lich.maLichHen, trangThai: 'HoanThanh' });

    expect((await w.w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
    await w.w.expectSlot(0, 'DaDat', null);
    expect(await thongBaoRows(db)).toEqual([
      {
        taiKhoanId: w.patientId,
        lichHenId: lich.lichHenId,
        loai: COMPLETED,
        daDoc: 0,
        noiDung: buildCompletedText(lich.maLichHen),
        thoiDiemTao: '2026-11-10 09:00:59',
      },
    ]);
    expect(w.patientId).not.toBe(w.doctorId);
  });
});

describe('HTK-02, HTK-03 hồ sơ khám độc lập với hoàn thành (quyết định 17/10/2026)', () => {
  it('HTK-02: CHƯA có hồ sơ vẫn hoàn thành được và KHÔNG tạo dòng ho_so_kham', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    await w.service.complete(w.doctorId, lich.maLichHen);
    expect(await countRows(db, 'ho_so_kham')).toBe(0);
  });

  it('HTK-03: đã có hồ sơ ⇒ hồ sơ và cap_nhat_lan_cuoi giữ nguyên từng ký tự', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    await w.exam.record(lich.lichHenId, {
      capNhatLanCuoi: '2026-11-10 08:15:00',
    });
    const read = () =>
      db.query(
        `SELECT trieu_chung, chan_doan_so_bo, huong_xu_ly, ngay_tai_kham_du_kien,
                DATE_FORMAT(cap_nhat_lan_cuoi, '%Y-%m-%d %H:%i:%s') AS cap_nhat FROM ho_so_kham`,
      );
    const before = await read();
    await w.service.complete(w.doctorId, lich.maLichHen);
    expect(await read()).toEqual(before);
    expect(before).toHaveLength(1);
  });
});

const OTHER_STATES: TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
  'HoanThanh',
];

describe('HTK-04 lịch không ở DaTiepDon (kể cả HoanThanh = bấm lần hai) ⇒ 409, không ghi gì', () => {
  it.each(OTHER_STATES)(
    'lịch %s: 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm { tuTrangThai, denTrangThai: HoanThanh }; lịch, khung giờ, thong_bao, nhat_ky_hanh_dong, email_thong_bao, ho_so_kham không đổi một byte',
    async (trangThai) => {
      const w = await setup();
      const lich = await w.w.booked(trangThai, 0);
      const before = await snapshot(w, lich);

      const error = await appException(
        w.service.complete(w.doctorId, lich.maLichHen),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
        chiTiet: { tuTrangThai: trangThai, denTrangThai: 'HoanThanh' },
      });
      expect(await snapshot(w, lich)).toEqual(before);
    },
  );

  it('bấm lần hai: lần đầu thành công, lần hai 409 với tuTrangThai HoanThanh; vẫn đúng MỘT thông báo', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    await w.service.complete(w.doctorId, lich.maLichHen);
    const error = await appException(
      w.service.complete(w.doctorId, lich.maLichHen),
    );
    expect(error.getResponse()).toMatchObject({
      chiTiet: { tuTrangThai: 'HoanThanh', denTrangThai: 'HoanThanh' },
    });
    expect(await thongBaoRows(db, COMPLETED)).toHaveLength(1);
  });
});

describe('HTK-05 lịch của bác sĩ khác, không tồn tại: 404 cùng thân; sở hữu trước trạng thái', () => {
  it('bác sĩ KHÁC (lịch DaTiepDon) và mã không tồn tại ⇒ 404 KHONG_TIM_THAY cùng thân; lịch không đổi; chỉ MỘT câu đọc thường, KHÔNG mở giao dịch, không khoá', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const stranger = (await fx.admin.doctor(w.w.branch)).profile.taiKhoanId;
    const before = await snapshot(w, lich);
    const seen = recordStatements(db);

    const other = await appException(
      w.service.complete(stranger, lich.maLichHen),
    );
    const missing = await appException(
      w.service.complete(w.doctorId, 'CLX-20261110-ZZZZZ'),
    );

    expect(other.getStatus()).toBe(404);
    expect(other.getResponse()).toEqual(missing.getResponse());
    expect(other.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    expect(seen).toHaveLength(2);
    for (const sql of seen) {
      expect(sql).not.toMatch(/START TRANSACTION/i);
      expect(isLockingStatement(sql)).toBe(false);
    }
    expect(await snapshot(w, lich)).toEqual(before);
  });

  it('lịch của bác sĩ khác ở MỌI trạng thái đều ra cùng 404, không bao giờ 409 (không lộ trạng thái)', async () => {
    const w = await setup();
    const stranger = (await fx.admin.doctor(w.w.branch)).profile.taiKhoanId;
    let slot = 0;
    for (const trangThai of ['DaXacNhan', 'DaTiepDon', 'HoanThanh'] as const) {
      const lich = await w.w.booked(trangThai, slot);
      slot += 1;
      const error = await appException(
        w.service.complete(stranger, lich.maLichHen),
      );
      expect(error.getStatus()).toBe(404);
    }
  });
});

describe('HTK-06 không điều kiện thời gian (Q5; khớp `complete`)', () => {
  it.each([
    ['rất xa trong tương lai', '2030-01-01 09:00:00'],
    ['rất xa trong quá khứ', '2020-01-01 09:00:00'],
  ])('lịch DaTiepDon có thoi_gian %s ⇒ hoàn thành được', async (_ten, at) => {
    const w = await setup();
    const lich = await w.inVisit(0);
    await db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
      at,
      lich.lichHenId,
    ]);
    await expect(
      w.service.complete(w.doctorId, lich.maLichHen),
    ).resolves.toMatchObject({ trangThai: 'HoanThanh' });
    expect((await w.w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
  });
});

describe('HTK-07 ghi thong_bao lỗi ⇒ hoàn tác CẢ lần hoàn thành (Q17)', () => {
  it('INSERT thong_bao chạy thật rồi ném lỗi không phải tranh chấp: lỗi đi nguyên ra ngoài, KHÔNG thử lại; lịch còn DaTiepDon, 0 thong_bao, khung giờ nguyên', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const before = await snapshot(w, lich);
    const failure = new Error('INSERT thong_bao hỏng');
    const matched = failAfterStatement(db, /^INSERT INTO thong_bao/, failure);

    await expect(w.service.complete(w.doctorId, lich.maLichHen)).rejects.toBe(
      failure,
    );

    expect(matched).toHaveLength(1);
    expect((await w.w.snapshot(lich, 0)).row.trangThai).toBe('DaTiepDon');
    expect(await snapshot(w, lich)).toEqual(before);
    expect(retryStats(logs).retries).toEqual({});
  });

  it('EMT-01 (notification B4): INSERT email_thong_bao chạy thật rồi ném lỗi: hoàn tác CẢ lần hoàn thành; lịch còn DaTiepDon, 0 thong_bao, 0 email_thong_bao', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const before = await snapshot(w, lich);
    const failure = new Error('INSERT email_thong_bao hỏng');
    const matched = failAfterStatement(
      db,
      /^INSERT INTO email_thong_bao/,
      failure,
    );

    await expect(w.service.complete(w.doctorId, lich.maLichHen)).rejects.toBe(
      failure,
    );

    expect(matched).toHaveLength(1);
    expect(await snapshot(w, lich)).toEqual(before);
    expect(before.rest.email).toBe(0);
  });

  it('đã có sẵn thong_bao cùng (lịch, tài khoản, loại): 1062 được coi là "đã có", vẫn hoàn thành, vẫn MỘT dòng và nội dung cũ không bị ghi đè', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)',
      [
        w.patientId,
        'dòng có sẵn',
        COMPLETED,
        lich.lichHenId,
        '2026-11-10 08:00:00',
      ],
    );
    await expect(
      w.service.complete(w.doctorId, lich.maLichHen),
    ).resolves.toMatchObject({ trangThai: 'HoanThanh' });
    expect(await thongBaoRows(db, COMPLETED)).toMatchObject([
      { noiDung: 'dòng có sẵn' },
    ]);
  });
});

describe('HTK-08 thân chạy lại sau 1213 an toàn', () => {
  it('INSERT thong_bao chạy thật rồi ném 1213 MỘT lần ⇒ withBookingTransaction hoàn tác rồi chạy lại thân; Completed; đúng MỘT thông báo; cảnh báo thử lại đúng một lần, không hết lượt', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    failAfterStatement(db, /^INSERT INTO thong_bao/, mysqlError(1213), 1);

    await expect(
      w.service.complete(w.doctorId, lich.maLichHen),
    ).resolves.toMatchObject({ trangThai: 'HoanThanh' });

    expect((await w.w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
    expect(await thongBaoRows(db, COMPLETED)).toHaveLength(1);
    expect(retryStats(logs)).toEqual({
      retries: { 'exam-complete MySQL 1213': 1 },
      exhausted: 0,
    });
  });
});

describe('HTK-11 chuỗi khoá thật của hoàn thành (PLAN 5.3)', () => {
  it('đọc thường lich_hen (không khoá) → lich_hen FOR UPDATE theo khoá chính → UPDATE lich_hen → INSERT thong_bao → INSERT email_thong_bao sau cùng (notification B4, Q6); chỉ khoá lich_hen; không chạm khung_gio, tầng 2 đến 4, hồ sơ, nhật ký; không vi phạm thứ tự khoá', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const seen = recordStatements(db);

    await w.service.complete(w.doctorId, lich.maLichHen);

    const body = seen.filter(
      (sql) =>
        !/^\s*(SET SESSION|SET TRANSACTION|SELECT @@session|START TRANSACTION|COMMIT|ROLLBACK)/i.test(
          sql,
        ),
    );
    expect(body).toHaveLength(5);
    const [read, lock, update, insert, email] = body as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(firstTableOf(read)).toBe('lich_hen');
    expect(isLockingStatement(read)).toBe(false);
    expect(read).toMatch(/WHERE ma_lich_hen = \? AND bac_si_id = \?/);
    expectLichLockByPrimaryKey(lock);
    expect(update).toMatch(/^UPDATE lich_hen SET trang_thai = 'HoanThanh'/);
    expect(insert).toMatch(/^INSERT INTO thong_bao/);
    expect(email).toMatch(/^INSERT INTO email_thong_bao/);
    expect(lockedTablesOf(body)).toEqual(['lich_hen']);
    expect(
      findLockOrderViolation([...lockedTablesOf(body), 'thong_bao']),
    ).toBeNull();
    expectNoHigherTierTables(body);
    for (const sql of body) {
      expect(sql).not.toMatch(/khung_gio\b/);
      expect(sql).not.toMatch(/INSERT INTO (ho_so_kham|nhat_ky_hanh_dong)/);
    }
  });
});

describe('HTK-12, TDK-06 hoàn thành KHÔNG ghi nhật ký, không đụng khung giờ, không tạo hồ sơ; từ notification B4 (Q6, EMT-01) ghi MỘT dòng email_thong_bao', () => {
  it('số dòng nhat_ky_hanh_dong, ho_so_kham và nội dung khung_gio không đổi; thong_bao và email_thong_bao mỗi bảng tăng một dòng', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const before = await untouchedByCompletion(db);
    await w.service.complete(w.doctorId, lich.maLichHen);
    expect(await untouchedByCompletion(db)).toEqual({ ...before, email: 1 });
    expect(before).toMatchObject({ nhatKy: 0, email: 0, hoSo: 0 });
    expect(await countRows(db, 'thong_bao')).toBe(1);
  });
});

describe('HTK-13 [đề xuất] EXPLAIN câu đọc thường', () => {
  it('truy cập `const` theo UNIQUE ma_lich_hen (một hàng, có khoá), không quét bảng', async () => {
    const w = await setup();
    const lich = await w.inVisit(0);
    const plan: { type: string; key: string | null; rows: number }[] =
      await db.query(`EXPLAIN ${READ_OWNED_APPOINTMENT_SQL}`, [
        lich.maLichHen,
        w.doctorId,
      ]);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.type).toBe('const');
    expect(plan[0]?.key).not.toBeNull();
    expect(Number(plan[0]?.rows)).toBe(1);
  });
});
