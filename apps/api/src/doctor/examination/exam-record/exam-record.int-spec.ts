import { vi } from 'vitest';
import { findLockOrderViolation } from '../../../appointments/locking/lock-order.js';
import { holdRowLock } from '../../../appointments/testing/concurrency-harness.js';
import {
  retryStats,
  sleep,
} from '../../../appointments/testing/concurrency-report.js';
import { assertBookingInvariants } from '../../../appointments/testing/invariants.js';
import {
  expectLichLockByPrimaryKey,
  expectNoHigherTierTables,
  lockedTablesOf,
} from '../../../appointments/testing/lock-chain.js';
import {
  createOverrideStack,
  overrideBy,
  settle,
} from '../../../appointments/testing/override-world.js';
import { firstTableOf } from '../../../appointments/testing/query-spy.js';
import { mysqlError } from '../../../appointments/testing/scripted-entity-manager.js';
import {
  failAfterStatement,
  interceptStatements,
  recordStatements,
} from '../../../appointments/testing/statement-recorder.js';
import {
  db,
  fx,
  logs,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { READ_OWNED_APPOINTMENT_SQL } from '../completion/exam-completion.repository.js';
import {
  appException,
  countRows,
  examCompletionStack,
} from '../testing/exam-completion-stack.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import { assertExamInvariants } from '../testing/exam-invariants.js';
import {
  editAuditRows,
  recordBody,
  recordRows,
  recordService,
  untouchedByRecord,
} from '../testing/exam-record-stack.js';
import {
  LOCK_APPOINTMENT_SQL,
  LOCK_RECORD_SQL,
} from './exam-record.repository.js';

// doctor-exam B2 — ExamRecordService THẬT trên MySQL 8.4 THẬT (PLAN 5.3, 5.5, 5.15; 7.1 HSK-01…HSK-25; 7.7 QHK-04, QHK-10; 7.11 TDK-04): `withBookingTransaction` THẬT, `AuditService` THẬT, Admin override THẬT (HSK-11), `complete` THẬT (HSK-14).
// Phần ĐƠN VỊ (không DB): exam-record.*.spec.ts. Phần HTTP: test/doctor-exam-record.e2e-spec.ts. Phần đồng thời: exam-record.concurrency.int-spec.ts. Đồng hồ giả đặt MỘT lần ở `setup` (NOW); ca cần mốc riêng tự đặt.
// Dữ liệu giả; mọi lịch dựng qua `world()` (booking) nên khung giờ luôn nhất quán với trạng thái. Sau mỗi ca GHI: IVK-01…IVK-05 và INV-01…INV-05.
useStatusWorldHooks();

/** 09:00 ngày 10/11/2026 giờ VN, cùng ngày với 8 khung giờ của thế giới test (ngày khám) */
const NOW = new Date('2026-11-10T09:00:00+07:00');
/** Dòng hồ sơ gài sẵn: 08:00 giờ VN, một giờ TRƯỚC NOW; token tương ứng là chuỗi ISO của nó */
const SEEDED_AT = '2026-11-10 08:00:00';
const SEEDED_TOKEN = '2026-11-10T01:00:00.000Z';
const NOT_FOUND = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

async function setup() {
  vi.setSystemTime(NOW);
  const w = await world();
  return {
    w,
    service: recordService(db),
    doctorId: w.doctor.account.taiKhoanId,
    exam: new ExamFixtures(db),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Lịch ở `state` (khung giờ số `slot`) kèm dòng hồ sơ gài sẵn (nội dung mặc định của `ExamFixtures`, giống `recordBody()`); trả lịch và `ho_so_kham_id`. */
async function withRecord(
  t: Setup,
  state: 'DaTiepDon' | 'HoanThanh',
  slot = 0,
) {
  const lich = await t.w.booked(state, slot);
  const hoSoKhamId = await t.exam.record(lich.lichHenId, {
    capNhatLanCuoi: SEEDED_AT,
  });
  return { lich, hoSoKhamId };
}

const expectInvariants = async () => {
  await assertBookingInvariants(db);
  await assertExamInvariants(db);
};

describe('HSK-01, HSK-02 ghi lần đầu; HSK-04 sửa khi còn DaTiepDon; Q3 không nhật ký', () => {
  it('HSK-01 lịch DaTiepDon, chưa có hồ sơ: 200, MỘT dòng ho_so_kham, capNhatLanCuoi = toSecond(nowVN()), lịch vẫn DaTiepDon, khung giờ vẫn DaDat, KHÔNG nhật ký, không thông báo, không email; INV, IVK', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const before = await t.w.snapshot(lich, 0);

    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ ngayTaiKhamDuKien: '2026-12-01' }),
    );

    expect(view).toEqual({
      trieuChung: 'Ho khan, sốt nhẹ hai ngày',
      chanDoanSoBo: 'Viêm họng cấp',
      huongXuLy: 'Uống đủ nước, nghỉ ngơi',
      ngayTaiKhamDuKien: '2026-12-01',
      capNhatLanCuoi: NOW.toISOString(),
    });
    expect(await recordRows(db)).toMatchObject([
      {
        lichHenId: lich.lichHenId,
        trieuChung: 'Ho khan, sốt nhẹ hai ngày',
        ngayTaiKhamDuKien: '2026-12-01',
        capNhatLanCuoi: '2026-11-10 09:00:00',
      },
    ]);
    expect(await t.w.snapshot(lich, 0)).toEqual(before);
    expect(await editAuditRows(db)).toEqual([]);
    expect(await untouchedByRecord(db)).toEqual({
      thongBao: 0,
      email: 0,
      danhGia: 0,
    });
    await expectInvariants();
  });

  it('HSK-02 lịch HoanThanh, chưa có hồ sơ (ghi lần đầu SAU Hoàn thành): 200, một dòng, KHÔNG nhật ký (Q3)', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0);
    await t.service.save(t.doctorId, lich.maLichHen, recordBody());
    expect(await recordRows(db)).toHaveLength(1);
    expect(await editAuditRows(db)).toEqual([]);
    await expectInvariants();
  });

  it('HSK-04 sửa khi lịch còn DaTiepDon (Bệnh nhân chưa thấy): 200, dòng đổi, capNhatLanCuoi mới, KHÔNG nhật ký', async () => {
    const t = await setup();
    const { lich, hoSoKhamId } = await withRecord(t, 'DaTiepDon');
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Nghỉ ngơi mới', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect(view.huongXuLy).toBe('Nghỉ ngơi mới');
    expect(await recordRows(db)).toMatchObject([
      {
        hoSoKhamId,
        huongXuLy: 'Nghỉ ngơi mới',
        capNhatLanCuoi: '2026-11-10 09:00:00',
      },
    ]);
    expect(await editAuditRows(db)).toEqual([]);
    await expectInvariants();
  });
});

describe('HSK-03, TDK-04 sửa khi HoanThanh và đã có hồ sơ: nhật ký SuaGhiChuKham cùng giao dịch', () => {
  it('một dòng nhật ký: chỉ trường ĐỔI (truoc và sau cùng khoá), branchId = chi nhánh của LỊCH, targetId = ho_so_kham_id (khác lich_hen_id), không tên, SĐT, email; capNhatLanCuoi mới', async () => {
    const t = await setup();
    // Lịch đệm TRƯỚC để ho_so_kham_id ≠ lich_hen_id (cùng bắt đầu từ 1 sau mỗi lần xoá bảng)
    await t.w.booked('DaXacNhan', 7);
    const { lich, hoSoKhamId } = await withRecord(t, 'HoanThanh');
    expect(hoSoKhamId).not.toBe(lich.lichHenId);

    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        huongXuLy: 'Nghỉ ngơi mới',
        ngayTaiKhamDuKien: '2026-12-01',
        capNhatLanCuoi: SEEDED_TOKEN,
      }),
    );

    const audit = await editAuditRows(db);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      taiKhoanId: t.doctorId,
      chiNhanhId: t.w.branch.chiNhanhId,
      loaiDoiTuong: 'ho_so_kham',
      maDoiTuong: hoSoKhamId,
      ketQua: 'ThanhCong',
    });
    // `toEqual` đúng từng khoá: chỉ bốn trường hồ sơ, KHÔNG có khoá nào khác (không tên, SĐT, email)
    expect(audit[0]?.chiTiet).toEqual({
      truoc: {
        huong_xu_ly: 'Uống đủ nước, nghỉ ngơi',
        ngay_tai_kham_du_kien: null,
      },
      sau: {
        huong_xu_ly: 'Nghỉ ngơi mới',
        ngay_tai_kham_du_kien: '2026-12-01',
      },
    });
    expect(await recordRows(db, lich.lichHenId)).toMatchObject([
      { capNhatLanCuoi: '2026-11-10 09:00:00', huongXuLy: 'Nghỉ ngơi mới' },
    ]);
    await expectInvariants();
  });

  it('đổi cả bốn trường (kể cả xoá ngày tái khám): nhật ký có đủ bốn khoá, ≤ 4 khoá (TDK-04); ngày xoá thành null', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0);
    await t.exam.record(lich.lichHenId, {
      capNhatLanCuoi: SEEDED_AT,
      ngayTaiKhamDuKien: '2026-12-01',
    });
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        trieuChung: 'Triệu chứng mới',
        chanDoanSoBo: 'Chẩn đoán mới',
        huongXuLy: 'Hướng xử lý mới',
        ngayTaiKhamDuKien: null,
        capNhatLanCuoi: SEEDED_TOKEN,
      }),
    );
    const audit = await editAuditRows(db);
    const detail = audit[0]?.chiTiet as { truoc: object; sau: object };
    expect(Object.keys(detail.truoc).sort()).toEqual([
      'chan_doan_so_bo',
      'huong_xu_ly',
      'ngay_tai_kham_du_kien',
      'trieu_chung',
    ]);
    expect(detail.sau).toMatchObject({ ngay_tai_kham_du_kien: null });
    expect((await recordRows(db))[0]?.ngayTaiKhamDuKien).toBeNull();
  });

  it('QHK-10 bác sĩ đã đổi chi nhánh sau khi đặt lịch: vẫn ghi được lịch cũ của mình; branchId của nhật ký vẫn là chi nhánh của LỊCH (H14)', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    await db.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [t.w.otherBranch.chiNhanhId, t.doctorId],
    );
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Nghỉ ngơi mới', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    const audit = await editAuditRows(db);
    expect(audit).toHaveLength(1);
    expect(audit[0]?.chiNhanhId).toBe(t.w.branch.chiNhanhId);
    expect(audit[0]?.chiNhanhId).not.toBe(t.w.otherBranch.chiNhanhId);
  });
});

describe('HSK-05, HSK-23 dữ liệu vào xấu ⇒ 400, DB không đổi', () => {
  it('HSK-05 thiếu từng trường chữ và cả ba (rỗng, chỉ khoảng trắng, chỉ xuống dòng): 400 DU_LIEU_KHONG_HOP_LE kèm BAT_BUOC đủ từng trường; không dòng nào được ghi; thân không có giá trị', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const error = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ trieuChung: '  ', chanDoanSoBo: '\r\n', huongXuLy: '' }),
      ),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      loi: [
        { truong: 'trieuChung', ma: 'BAT_BUOC' },
        { truong: 'chanDoanSoBo', ma: 'BAT_BUOC' },
        { truong: 'huongXuLy', ma: 'BAT_BUOC' },
      ],
    });
    expect(await recordRows(db)).toEqual([]);
  });

  it.each([
    'Cookie: bánh quy dị ứng',
    'otp: 3 lần/ngày',
    'Bệnh nhân khai: token=abc123',
    'Kết quả có hash = 5',
    'a'.repeat(64),
    'Bearer abc123xyz',
  ])(
    'HSK-23 nội dung dạng bí mật %s ⇒ 400 NOI_DUNG_KHONG_HOP_LE của trường; lỗi không có giá trị; không dòng, không nhật ký, không 500',
    async (sample) => {
      const t = await setup();
      const { lich } = await withRecord(t, 'HoanThanh');
      const error = await appException(
        t.service.save(
          t.doctorId,
          lich.maLichHen,
          recordBody({ huongXuLy: sample, capNhatLanCuoi: SEEDED_TOKEN }),
        ),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        loi: [{ truong: 'huongXuLy', ma: 'NOI_DUNG_KHONG_HOP_LE' }],
      });
      expect(JSON.stringify(error.getResponse())).not.toContain(
        sample.slice(0, 10),
      );
      expect((await recordRows(db))[0]?.huongXuLy).toBe(
        'Uống đủ nước, nghỉ ngơi',
      );
      expect(await editAuditRows(db)).toEqual([]);
    },
  );

  it('HSK-23 ca âm: câu y khoa thường và "Pass: không có" ĐƯỢC ghi, và SỬA được sau Hoàn thành (nhật ký không ném AUDIT_SENSITIVE_DATA)', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0);
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Huyết áp 120/80. Pass: không có' }),
    );
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        huongXuLy: 'Uống thuốc 3 lần/ngày, tái khám sau 7 ngày',
        capNhatLanCuoi: NOW.toISOString(),
      }),
    );
    expect(view.huongXuLy).toBe('Uống thuốc 3 lần/ngày, tái khám sau 7 ngày');
    expect(await editAuditRows(db)).toHaveLength(1);
  });
});

describe('HSK-06, HSK-07 ngày tái khám', () => {
  it('HSK-06 vắng lúc ghi ⇒ NULL; sửa với ngày rồi sửa gửi null ⇒ xoá ngày cũ (nhật ký ghi ngày trước và null sau)', async () => {
    const t = await setup();
    const lich = await t.w.booked('HoanThanh', 0);
    const first = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody(),
    );
    expect(first.ngayTaiKhamDuKien).toBeNull();
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const second = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        ngayTaiKhamDuKien: '2026-12-01',
        capNhatLanCuoi: first.capNhatLanCuoi,
      }),
    );
    expect(second.ngayTaiKhamDuKien).toBe('2026-12-01');
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        ngayTaiKhamDuKien: null,
        capNhatLanCuoi: second.capNhatLanCuoi,
      }),
    );
    expect((await recordRows(db))[0]?.ngayTaiKhamDuKien).toBeNull();
    const audit = await editAuditRows(db);
    expect(audit).toHaveLength(2);
    expect(audit[1]?.chiTiet).toEqual({
      truoc: { ngay_tai_kham_du_kien: '2026-12-01' },
      sau: { ngay_tai_kham_du_kien: null },
    });
  });

  it('HSK-07 biên THEO thoi_gian THẬT (ngày khám 10/11/2026): đúng ngày khám và +365 ngày được; một ngày ngoài hai biên, ngày không có thật ⇒ 400 NGAY_KHONG_HOP_LE', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    for (const ngay of ['2026-11-09', '2027-11-11', '2026-02-30']) {
      const error = await appException(
        t.service.save(
          t.doctorId,
          lich.maLichHen,
          recordBody({ ngayTaiKhamDuKien: ngay }),
        ),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        loi: [{ truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' }],
      });
    }
    expect(await recordRows(db)).toEqual([]);
    let token: string | null = null;
    for (const ngay of ['2026-11-10', '2027-11-10']) {
      vi.setSystemTime(new Date(NOW.getTime() + (token === null ? 0 : 60_000)));
      const view = await t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ ngayTaiKhamDuKien: ngay, capNhatLanCuoi: token }),
      );
      expect(view.ngayTaiKhamDuKien).toBe(ngay);
      token = view.capNhatLanCuoi;
    }
  });
});

describe('HSK-08, HSK-16 độ dài và chuẩn hoá qua MySQL thật (utf8mb4)', () => {
  it('HSK-08 2.000 đúng biên (ba trường) lưu và đọc lại GIỐNG HỆT; 2.001 ⇒ 400 QUA_DAI, không ghi', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const long = 'ế'.repeat(2000);
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ trieuChung: long, chanDoanSoBo: long, huongXuLy: long }),
    );
    expect(view.trieuChung).toBe(long);
    expect(await recordRows(db)).toMatchObject([
      { trieuChung: long, chanDoanSoBo: long, huongXuLy: long },
    ]);
    const error = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({
          trieuChung: 'a'.repeat(2001),
          capNhatLanCuoi: view.capNhatLanCuoi,
        }),
      ),
    );
    expect(error.getResponse()).toMatchObject({
      loi: [{ truong: 'trieuChung', ma: 'QUA_DAI' }],
    });
  });

  it('HSK-08 "trần ≤ audit": 2.000 đơn vị UTF-16 toàn emoji (1.000 emoji) đi hết đường SỬA sau Hoàn thành, nhật ký ghi và đọc lại đúng; còn 1.500 emoji (3.000 đơn vị UTF-16 nhưng chỉ 1.500 ĐIỂM MÃ) bị chặn bằng 400 QUA_DAI TRƯỚC giao dịch, không phải 500 do audit', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const emoji = '😀'.repeat(1000);
    const saved = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: emoji, capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect((await recordRows(db))[0]?.huongXuLy).toBe(emoji);
    expect((await editAuditRows(db))[0]?.chiTiet).toMatchObject({
      sau: { huong_xu_ly: emoji },
    });
    // Nếu `rules` đếm theo điểm mã thì 1.500 emoji lọt qua, rồi `AuditService.record` (đếm UTF-16, trần 2.000) ném AUDIT_ENTRY_INVALID ngay trong giao dịch và người dùng nhận 500
    const tooLong = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({
          huongXuLy: '😀'.repeat(1500),
          capNhatLanCuoi: saved.capNhatLanCuoi,
        }),
      ),
    );
    expect(tooLong.getStatus()).toBe(400);
    expect(tooLong.getResponse()).toMatchObject({
      loi: [{ truong: 'huongXuLy', ma: 'QUA_DAI' }],
    });
    expect((await recordRows(db))[0]?.huongXuLy).toBe(emoji);
  });

  it('HSK-16 CRLF ⇒ LF, ký tự điều khiển bị bỏ, TAB và xuống dòng giữa chữ giữ, emoji và NFD GIỮ NGUYÊN (không tự chuẩn hoá Unicode), surrogate lẻ ⇒ U+FFFD (X1 M10)', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const nfd = 'Nguyễn';
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        trieuChung: ' dòng 1\r\ndòng 2\tcó TAB\u0001\u0007 ',
        chanDoanSoBo: `${nfd} 😀 ZWJ 👨‍👩‍👧`,
        huongXuLy: 'lẻ \uD800 và \uDC00 và cặp 😀',
      }),
    );
    expect(await recordRows(db)).toMatchObject([
      {
        trieuChung: 'dòng 1\ndòng 2\tcó TAB',
        chanDoanSoBo: `${nfd} 😀 ZWJ 👨‍👩‍👧`,
        huongXuLy: 'lẻ � và � và cặp 😀',
      },
    ]);
  });

  it('HSK-16 surrogate lẻ ở lần SỬA sau Hoàn thành vẫn 200 (nếu không làm sạch thì nhật ký ném AUDIT_WRITE_FAILED và hoàn tác cả lần lưu); nhật ký đọc lại có U+FFFD', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'lẻ \uD800 hỏng', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect((await editAuditRows(db))[0]?.chiTiet).toMatchObject({
      sau: { huong_xu_ly: 'lẻ � hỏng' },
    });
  });
});

describe('HSK-09, HSK-10, QHK-04 trạng thái và sở hữu', () => {
  it.each([
    'ChoThanhToan',
    'DaXacNhan',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ] as const)(
    'HSK-09 lịch %s ⇒ 409 KHONG_THE_GHI_HO_SO_KHAM kèm chiTiet { trangThai }; không dòng mới',
    async (state) => {
      const t = await setup();
      const lich = await t.w.booked(state, 0);
      const error = await appException(
        t.service.save(t.doctorId, lich.maLichHen, recordBody()),
      );
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'KHONG_THE_GHI_HO_SO_KHAM',
        chiTiet: { trangThai: state },
      });
      expect(await recordRows(db)).toEqual([]);
    },
  );

  it('HSK-10, QHK-04 lịch của bác sĩ KHÁC (ở DaTiepDon và cả DaXacNhan: vẫn 404, không 409) và mã không tồn tại ⇒ 404 KHONG_TIM_THAY CÙNG thân; không dòng', async () => {
    const t = await setup();
    const stranger = (await fx.admin.doctor(t.w.branch)).profile.taiKhoanId;
    const lich = await t.w.booked('DaTiepDon', 0);
    const confirmed = await t.w.booked('DaXacNhan', 1);
    const bodies = [];
    for (const code of [lich.maLichHen, confirmed.maLichHen]) {
      const error = await appException(
        t.service.save(stranger, code, recordBody()),
      );
      expect(error.getStatus()).toBe(404);
      bodies.push(error.getResponse());
    }
    const missing = await appException(
      t.service.save(t.doctorId, 'CLX-20261110-ZZZZZ', recordBody()),
    );
    bodies.push(missing.getResponse());
    for (const response of bodies) expect(response).toEqual(NOT_FOUND);
    expect(await recordRows(db)).toEqual([]);
  });
});

describe('HSK-09, HSK-03 kiểm LẠI trạng thái DƯỚI khoá (XÁC ĐỊNH, không đua; PLAN 5.3: bản đọc thường không đủ)', () => {
  // Một giao dịch KHÁC giữ khoá `lich_hen` và đổi trạng thái (chưa commit) trong lúc PUT đang chờ khoá: bản đọc thường (không khoá) của PUT vẫn thấy trạng thái CŨ, nên chỉ lần kiểm LẠI sau khi có khoá mới đúng.
  // Ca này bắt được cả đột biến "bỏ canWriteRecord dưới khoá" và "câu khoá lich_hen không FOR UPDATE" mà ca đua DHK-10 và DHK-02 KHÔNG bắt được (TRACKING 13.8, M1 và M4).
  it('HSK-09 lịch bị đổi sang DaXacNhan (giao dịch khác giữ khoá, chưa commit) khi PUT đang chờ: sau commit PUT thấy DaXacNhan DƯỚI khoá ⇒ 409 KHONG_THE_GHI_HO_SO_KHAM, KHÔNG ghi', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const held = await holdRowLock(
      db,
      'UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ?',
      ['DaXacNhan', lich.lichHenId],
    );
    const pending = settle(
      t.service.save(t.doctorId, lich.maLichHen, recordBody()),
    );
    await sleep(200);
    await held.release('commit');
    expect(await pending).toMatchObject({
      kind: 'refused',
      maLoi: 'KHONG_THE_GHI_HO_SO_KHAM',
      chiTiet: { trangThai: 'DaXacNhan' },
    });
    expect(await recordRows(db)).toEqual([]);
  });

  it('HSK-03 lịch được hoàn thành (giao dịch khác giữ khoá, chưa commit) khi PUT đang chờ: PUT thấy HoanThanh DƯỚI khoá ⇒ có nhật ký SuaGhiChuKham (nhật ký khi và chỉ khi lịch HoanThanh lúc ghi)', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'DaTiepDon');
    const held = await holdRowLock(
      db,
      "UPDATE lich_hen SET trang_thai = 'HoanThanh' WHERE lich_hen_id = ?",
      [lich.lichHenId],
    );
    const pending = t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        huongXuLy: 'Sửa lúc đang hoàn thành',
        capNhatLanCuoi: SEEDED_TOKEN,
      }),
    );
    await sleep(200);
    await held.release('commit');
    await expect(pending).resolves.toMatchObject({
      huongXuLy: 'Sửa lúc đang hoàn thành',
    });
    expect(await editAuditRows(db)).toHaveLength(1);
    expect((await t.w.snapshot(lich, 0)).row.trangThai).toBe('HoanThanh');
    await expectInvariants();
  });
});

describe('HSK-11 Admin override đưa lịch khỏi DaTiepDon khi đã có hồ sơ (Q16)', () => {
  it('override THẬT DaTiepDon → DaXacNhan: dòng hồ sơ GIỮ NGUYÊN; ghi lúc ngoài hai trạng thái ⇒ 409; về DaTiepDon (DaXacNhan → DaTiepDon) ⇒ ghi lại được', async () => {
    const t = await setup();
    const { lich, hoSoKhamId } = await withRecord(t, 'DaTiepDon');
    const before = await recordRows(db);
    const stack = createOverrideStack(db);

    await overrideBy(t.w, stack, 'Toan', lich.maLichHen, 'DaXacNhan');
    expect(await recordRows(db)).toEqual(before);
    const refused = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({
          huongXuLy: 'Không được ghi',
          capNhatLanCuoi: SEEDED_TOKEN,
        }),
      ),
    );
    expect(refused.getResponse()).toMatchObject({
      maLoi: 'KHONG_THE_GHI_HO_SO_KHAM',
      chiTiet: { trangThai: 'DaXacNhan' },
    });
    expect(await recordRows(db)).toEqual(before);

    await overrideBy(t.w, stack, 'Toan', lich.maLichHen, 'DaTiepDon');
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Ghi lại được', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect(view.huongXuLy).toBe('Ghi lại được');
    expect(await recordRows(db)).toMatchObject([
      { hoSoKhamId, huongXuLy: 'Ghi lại được' },
    ]);
    await expectInvariants();
  });
});

describe('HSK-12 gửi y hệt nội dung hiện có ⇒ không ghi (so `===`, H2)', () => {
  it('y hệt (token đúng): 200, capNhatLanCuoi KHÔNG đổi, KHÔNG nhật ký, dòng không đổi một byte', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const before = await recordRows(db);
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect(view.capNhatLanCuoi).toBe(SEEDED_TOKEN);
    expect(await recordRows(db)).toEqual(before);
    expect(await editAuditRows(db)).toEqual([]);
  });

  it('khác chỉ hoa/thường, dấu, NFC/NFD ⇒ được coi là ĐỔI (collation sẽ coi là bằng): có UPDATE và nhật ký', async () => {
    const t = await setup();
    const pairs: [string, string][] = [
      ['Uống đủ nước, nghỉ ngơi', 'UỐNG ĐỦ NƯỚC, NGHỈ NGƠI'],
      ['Viêm họng cấp', 'Viem hong cap'],
      ['Ho khan', 'Hó khan'],
    ];
    for (const [slot, [stored, changed]] of pairs.entries()) {
      const lich = await t.w.booked('HoanThanh', slot);
      await t.exam.record(lich.lichHenId, {
        capNhatLanCuoi: SEEDED_AT,
        huongXuLy: stored,
      });
      await t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ huongXuLy: changed, capNhatLanCuoi: SEEDED_TOKEN }),
      );
      expect((await recordRows(db, lich.lichHenId))[0]?.huongXuLy).toBe(
        changed,
      );
    }
    expect(await editAuditRows(db)).toHaveLength(3);
  });
});

describe('HSK-13 sửa chồng theo capNhatLanCuoi ⇒ 409 HO_SO_KHAM_DA_THAY_DOI', () => {
  it('token null khi ĐÃ có hồ sơ; token cũ; token khác null khi CHƯA có hồ sơ ⇒ 409, DB không đổi; token khớp ⇒ 200', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const before = await recordRows(db);
    for (const token of [
      null,
      '2026-11-10T00:00:00.000Z',
      '2026-11-10 08:00:00',
    ]) {
      const error = await appException(
        t.service.save(
          t.doctorId,
          lich.maLichHen,
          recordBody({ huongXuLy: 'Ghi đè', capNhatLanCuoi: token }),
        ),
      );
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
      });
    }
    expect(await recordRows(db)).toEqual(before);
    expect(await editAuditRows(db)).toEqual([]);

    const fresh = await t.w.booked('DaTiepDon', 1);
    const noRow = await appException(
      t.service.save(
        t.doctorId,
        fresh.maLichHen,
        recordBody({ capNhatLanCuoi: SEEDED_TOKEN }),
      ),
    );
    expect(noRow.getResponse()).toMatchObject({
      maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
    });

    await expect(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ huongXuLy: 'Ghi đúng', capNhatLanCuoi: SEEDED_TOKEN }),
      ),
    ).resolves.toMatchObject({ huongXuLy: 'Ghi đúng' });
  });

  it('HSK-25 hai lần ghi liên tiếp trong CÙNG một giây: token KHÁC nhau (lần hai = lần một + 1 giây); token của lần một đã cũ ⇒ 409; lần ba dùng token lần hai ⇒ 200', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const first = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody(),
    );
    expect(first.capNhatLanCuoi).toBe(NOW.toISOString());
    const second = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        huongXuLy: 'Lần hai',
        capNhatLanCuoi: first.capNhatLanCuoi,
      }),
    );
    expect(second.capNhatLanCuoi).toBe(
      new Date(NOW.getTime() + 1000).toISOString(),
    );
    const stale = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({
          huongXuLy: 'Lần ba lọt?',
          capNhatLanCuoi: first.capNhatLanCuoi,
        }),
      ),
    );
    expect(stale.getResponse()).toMatchObject({
      maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
    });
    const third = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({
        huongXuLy: 'Lần ba',
        capNhatLanCuoi: second.capNhatLanCuoi,
      }),
    );
    expect(third.capNhatLanCuoi).toBe(
      new Date(NOW.getTime() + 2000).toISOString(),
    );
    expect((await recordRows(db))[0]?.capNhatLanCuoi).toBe(
      '2026-11-10 09:00:02',
    );
  });
});

describe('HSK-14 hồ sơ độc lập với Hoàn thành (quyết định 17/10/2026), bằng `complete` THẬT của B1', () => {
  it('(a) ghi rồi hoàn thành: hồ sơ giữ nguyên từng byte; (b) hoàn thành rồi ghi: ghi được; (c) hoàn thành khi CHƯA có hồ sơ: thành công và KHÔNG có dòng ho_so_kham', async () => {
    const t = await setup();
    const completion = examCompletionStack(db).service;

    const a = await t.w.booked('DaTiepDon', 0);
    await t.service.save(t.doctorId, a.maLichHen, recordBody());
    const beforeA = await recordRows(db, a.lichHenId);
    await completion.complete(t.doctorId, a.maLichHen);
    expect(await recordRows(db, a.lichHenId)).toEqual(beforeA);
    expect((await t.w.snapshot(a, 0)).row.trangThai).toBe('HoanThanh');

    const b = await t.w.booked('DaTiepDon', 1);
    await completion.complete(t.doctorId, b.maLichHen);
    await t.service.save(t.doctorId, b.maLichHen, recordBody());
    expect(await recordRows(db, b.lichHenId)).toHaveLength(1);

    const c = await t.w.booked('DaTiepDon', 2);
    await completion.complete(t.doctorId, c.maLichHen);
    expect(await recordRows(db, c.lichHenId)).toEqual([]);
    await expectInvariants();
  });
});

describe('HSK-18, HSK-20, HSK-24 lỗi giữa chừng', () => {
  it('HSK-18 INSERT nhật ký chạy thật rồi hỏng ⇒ cả giao dịch hoàn tác: nội dung và capNhatLanCuoi CŨ, không dòng nhật ký; lỗi nổi lên (không AppException), không lộ nội dung', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const before = await recordRows(db);
    const matched = failAfterStatement(
      db,
      /^INSERT INTO `?nhat_ky_hanh_dong/,
      new Error('INSERT nhật ký hỏng'),
    );
    const error: unknown = await t.service
      .save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ huongXuLy: 'Nội dung mới', capNhatLanCuoi: SEEDED_TOKEN }),
      )
      .then(
        () => undefined,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).not.toContain('Nội dung mới');
    expect(matched).toHaveLength(1);
    expect(await recordRows(db)).toEqual(before);
    expect(await editAuditRows(db)).toEqual([]);
    expect(retryStats(logs).retries).toEqual({});
  });

  it('HSK-20 1062 ở INSERT (lưới an toàn, giả) ⇒ 409 HO_SO_KHAM_DA_THAY_DOI, không 500; không dòng', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    interceptStatements(db, (call, run) => {
      if (call.sql.startsWith('INSERT INTO ho_so_kham'))
        throw Object.assign(new Error('trùng'), {
          errno: 1062,
          code: 'ER_DUP_ENTRY',
        });
      return run();
    });
    const error = await appException(
      t.service.save(t.doctorId, lich.maLichHen, recordBody()),
    );
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'HO_SO_KHAM_DA_THAY_DOI',
    });
    expect(await recordRows(db)).toEqual([]);
  });

  it('HSK-24 UPDATE chạy thật rồi ném 1213 MỘT lần ⇒ withBookingTransaction hoàn tác rồi chạy lại thân; 200; đúng MỘT nhật ký; cảnh báo thử lại đúng một lần, không hết lượt', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    failAfterStatement(db, /^UPDATE ho_so_kham/, mysqlError(1213), 1);
    await expect(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({ huongXuLy: 'Sau thử lại', capNhatLanCuoi: SEEDED_TOKEN }),
      ),
    ).resolves.toMatchObject({ huongXuLy: 'Sau thử lại' });
    expect(await editAuditRows(db)).toHaveLength(1);
    expect(retryStats(logs)).toEqual({
      retries: { 'exam-record MySQL 1213': 1 },
      exhausted: 0,
    });
    await expectInvariants();
  });

  it('HSK-24 hết lượt thử lại (1213 liên tục) ⇒ 503 HE_THONG_DANG_BAN, không bao giờ 500; DB không đổi, không nhật ký', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const before = await recordRows(db);
    failAfterStatement(db, /^UPDATE ho_so_kham/, mysqlError(1213), 99);
    const error = await appException(
      t.service.save(
        t.doctorId,
        lich.maLichHen,
        recordBody({
          huongXuLy: 'Không lưu được',
          capNhatLanCuoi: SEEDED_TOKEN,
        }),
      ),
    );
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ maLoi: 'HE_THONG_DANG_BAN' });
    expect(await recordRows(db)).toEqual(before);
    expect(await editAuditRows(db)).toEqual([]);
    expect(retryStats(logs)).toEqual({
      retries: { 'exam-record MySQL 1213': 2 },
      exhausted: 1,
    });
  });
});

describe('HSK-19 giờ Việt Nam (X1 M11)', () => {
  it('đồng hồ 23:59:59.999 ngày 30/11: capNhatLanCuoi cắt giây (không nhảy sang ngày sau), ISO đúng giờ VN; ngày tái khám 01/12 đọc lại đúng bằng DATE_FORMAT', async () => {
    const t = await setup();
    vi.setSystemTime(new Date('2026-11-30T23:59:59.999+07:00'));
    const lich = await t.w.booked('DaTiepDon', 0);
    const view = await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ ngayTaiKhamDuKien: '2026-12-01' }),
    );
    expect(view.capNhatLanCuoi).toBe('2026-11-30T16:59:59.000Z');
    expect(view.ngayTaiKhamDuKien).toBe('2026-12-01');
    expect(await recordRows(db)).toMatchObject([
      {
        capNhatLanCuoi: '2026-11-30 23:59:59',
        ngayTaiKhamDuKien: '2026-12-01',
      },
    ]);
  });
});

/** Các câu của thân (bỏ câu đặt phiên, START TRANSACTION, COMMIT, ROLLBACK): đọc thường trước, rồi thân giao dịch. */
const bodyOf = (seen: string[]) =>
  seen.filter(
    (sql) =>
      !/^\s*(SET SESSION|SET TRANSACTION|SELECT @@session|START TRANSACTION|COMMIT|ROLLBACK)/i.test(
        sql,
      ),
  );

describe('HSK-21 chuỗi câu SQL THẬT (PLAN 5.3, bài học B1: ca đua vẫn xanh khi đảo thứ tự khoá)', () => {
  const at = (body: string[], pattern: RegExp) =>
    body.findIndex((sql) => pattern.test(sql));

  it('ghi lần đầu: đọc thường lich_hen (không khoá) → lich_hen FOR UPDATE theo khoá chính → ho_so_kham FOR UPDATE → INSERT ho_so_kham → đọc lại; chỉ khoá [lich_hen, ho_so_kham]; không nhật ký', async () => {
    const t = await setup();
    const lich = await t.w.booked('DaTiepDon', 0);
    const seen = recordStatements(db);
    await t.service.save(t.doctorId, lich.maLichHen, recordBody());
    const body = bodyOf(seen);

    expect(body).toHaveLength(5);
    expect(body[0]).toBe(READ_OWNED_APPOINTMENT_SQL);
    expect(body[1]).toBe(LOCK_APPOINTMENT_SQL);
    expectLichLockByPrimaryKey(body[1] ?? '');
    expect(body[2]).toBe(LOCK_RECORD_SQL);
    expect(body[3]).toMatch(/^INSERT INTO ho_so_kham/);
    expect(body[4]).toMatch(/FROM ho_so_kham WHERE lich_hen_id = \?\s*$/);
    const locked = lockedTablesOf(body);
    expect(locked).toEqual(['lich_hen', 'ho_so_kham']);
    expect(findLockOrderViolation([...locked, 'nhat_ky_hanh_dong'])).toBeNull();
    expectNoHigherTierTables(body);
    for (const sql of body) {
      expect(sql).not.toMatch(/khung_gio\b/);
      expect(sql).not.toMatch(
        /INSERT INTO `?(nhat_ky_hanh_dong|thong_bao|email_thong_bao)/,
      );
    }
  });

  it('sửa khi DaTiepDon: cùng chuỗi khoá, UPDATE ho_so_kham, KHÔNG câu nào của nhật ký', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'DaTiepDon');
    const seen = recordStatements(db);
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Đổi', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    const body = bodyOf(seen);
    expect(at(body, /^UPDATE ho_so_kham/)).toBeGreaterThan(
      at(body, /FROM ho_so_kham WHERE lich_hen_id = \? FOR UPDATE/),
    );
    expect(body.some((sql) => /nhat_ky_hanh_dong/.test(sql))).toBe(false);
    expect(findLockOrderViolation(lockedTablesOf(body))).toBeNull();
  });

  it('sửa khi HoanThanh và đã có hồ sơ: … → UPDATE ho_so_kham → INSERT nhat_ky_hanh_dong (SAU khi đã khoá lich_hen rồi ho_so_kham, tầng 7 sau 6b); thứ tự khoá không vi phạm', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const seen = recordStatements(db);
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Đổi', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    const body = bodyOf(seen);
    const lockLich = at(
      body,
      /FROM lich_hen WHERE lich_hen_id = \? FOR UPDATE/,
    );
    const lockRecord = at(
      body,
      /FROM ho_so_kham WHERE lich_hen_id = \? FOR UPDATE/,
    );
    const update = at(body, /^UPDATE ho_so_kham/);
    const audit = at(body, /^INSERT INTO `?nhat_ky_hanh_dong/);
    expect(firstTableOf(body[0] ?? '')).toBe('lich_hen');
    expect([lockLich, lockRecord, update, audit].every((i) => i > 0)).toBe(
      true,
    );
    expect(lockLich).toBeLessThan(lockRecord);
    expect(lockRecord).toBeLessThan(update);
    expect(update).toBeLessThan(audit);
    const locked = lockedTablesOf(body);
    expect(locked).toEqual(['lich_hen', 'ho_so_kham']);
    expect(findLockOrderViolation([...locked, 'nhat_ky_hanh_dong'])).toBeNull();
    expectNoHigherTierTables(body);
  });

  it('gửi y hệt (không ghi): chỉ ba câu (đọc thường, khoá lich_hen, khoá ho_so_kham); lỗi 404 không mở giao dịch: chỉ MỘT câu đọc thường', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const seen = recordStatements(db);
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect(bodyOf(seen)).toHaveLength(3);

    // Mã không tồn tại: đọc thường trả rỗng ⇒ 404 và KHÔNG mở giao dịch (nghĩa là không SET SESSION, START TRANSACTION)
    seen.length = 0;
    await appException(
      t.service.save(t.doctorId, 'CLX-20261110-ZZZZZ', recordBody()),
    );
    expect(seen).toEqual([READ_OWNED_APPOINTMENT_SQL]);
  });
});

describe('HSK-22 [đề xuất] EXPLAIN ba câu', () => {
  it('đọc thường theo ma_lich_hen và bac_si_id, khoá lich_hen theo khoá chính, khoá ho_so_kham theo lich_hen_id: truy cập `const` (UNIQUE/PK), một hàng, không quét', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const plans = {
      read: await db.query<
        { type: string; key: string | null; rows: number }[]
      >(`EXPLAIN ${READ_OWNED_APPOINTMENT_SQL}`, [lich.maLichHen, t.doctorId]),
      lockLich: await db.query<
        { type: string; key: string | null; rows: number }[]
      >(`EXPLAIN ${LOCK_APPOINTMENT_SQL}`, [lich.lichHenId]),
      lockRecord: await db.query<
        { type: string; key: string | null; rows: number }[]
      >(`EXPLAIN ${LOCK_RECORD_SQL}`, [lich.lichHenId]),
    };
    for (const [name, plan] of Object.entries(plans)) {
      expect(plan, name).toHaveLength(1);
      expect(plan[0]?.type, name).toBe('const');
      expect(plan[0]?.key, name).not.toBeNull();
      expect(Number(plan[0]?.rows), name).toBe(1);
    }
  });
});

describe('Không đụng bảng ngoài phạm vi', () => {
  it('ghi và sửa hồ sơ KHÔNG thông báo (Q17), không email, không đánh giá, không đổi trạng thái lịch', async () => {
    const t = await setup();
    const { lich } = await withRecord(t, 'HoanThanh');
    const before = await t.w.snapshot(lich, 0);
    await t.service.save(
      t.doctorId,
      lich.maLichHen,
      recordBody({ huongXuLy: 'Đổi', capNhatLanCuoi: SEEDED_TOKEN }),
    );
    expect(await untouchedByRecord(db)).toEqual({
      thongBao: 0,
      email: 0,
      danhGia: 0,
    });
    expect(await t.w.snapshot(lich, 0)).toEqual(before);
    expect(await countRows(db, 'ho_so_kham')).toBe(1);
  });
});
