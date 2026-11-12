import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type {
  CaLamViec,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { LeaveFixtures } from '../testing/leave-fixtures.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import type { AffectedByLeaveFilter } from './affected-by-leave.query.js';
import { AppointmentQueries } from './appointment-queries.js';

// Task B11 — CG-08, CG-11, CG-12, CG-13, CG-14, CG-15, CG-18, AFL-04, AFL-05 (PLAN booking 7.13, 7.30; TRACKING 3.24.3) trên MySQL 8.4 THẬT: `findAffectedByLeave` (D5) và `listAffectedByLeave` (D13). Phần ĐƠN VỊ (một hàm lọc,
// kiểm đầu vào, danh sách trắng): affected-by-leave.query.spec.ts. Mọi `now` truyền tường minh (hàm không đọc đồng hồ); đồng hồ ứng dụng giả của `useIntegrationHooks` chỉ để chứng minh điều đó (CG-13). Giờ là chuỗi giờ
// Việt Nam. `em` là `db.manager`.
let db: DataSource;
let fx: BookingFixtures;
let leave: LeaveFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
  leave = new LeaveFixtures(d, fx);
});

const queries = new AppointmentQueries();
const NOW = new Date('2026-11-10T09:00:00+07:00');
const RANGE = { tuNgay: '2026-11-10', denNgay: '2026-11-12' } as const;

type World = Awaited<ReturnType<LeaveFixtures['world']>>;

const filterOf = (
  w: World,
  extra: Partial<AffectedByLeaveFilter> = {},
): AffectedByLeaveFilter => ({
  bacSiId: w.doctor.taiKhoanId,
  ...RANGE,
  now: NOW,
  ...extra,
});

/** Lịch `DaXacNhan` (hay `trangThai`) của `doctor` ở đúng giờ `at`, thuộc ca `ca` (mặc định `CaSang`). */
const make = (
  w: World,
  at: string,
  ca: CaLamViec = 'CaSang',
  trangThai: TrangThaiLichHen = 'DaXacNhan',
  doctor = w.doctor,
) => leave.appointmentAt({ doctor, at, ca, trangThai, patientId: w.patientId });

const codes = (rows: { maLichHen: string }[]) =>
  rows.map((row) => row.maLichHen);
const find = (filter: AffectedByLeaveFilter) =>
  queries.findAffectedByLeave(db.manager, filter);
const list = (filter: AffectedByLeaveFilter, limit: number) =>
  queries.listAffectedByLeave(db.manager, { ...filter, limit });

describe('CG-08 findAffectedByLeave: khoảng ngày, TheoCa và CaNgay, chỉ ChoThanhToan và DaXacNhan, đúng bác sĩ', () => {
  it('đúng tập và đúng thứ tự (thoi_gian tăng); lọc ca; bác sĩ khác; trạng thái khác và ngoài khoảng bị loại', async () => {
    const w = await leave.world();
    const sang10 = await make(w, '2026-11-10 10:00:00', 'CaSang');
    const chieu10 = await make(
      w,
      '2026-11-10 14:00:00',
      'CaChieu',
      'ChoThanhToan',
    );
    const sang11 = await make(w, '2026-11-11 08:00:00', 'CaSang');
    const chieu12 = await make(w, '2026-11-12 15:00:00', 'CaChieu');
    // cùng khoảng, KHÔNG bị ảnh hưởng: trạng thái khác
    await make(w, '2026-11-10 10:30:00', 'CaSang', 'DaTiepDon');
    await make(w, '2026-11-10 11:00:00', 'CaSang', 'HoanThanh');
    await make(w, '2026-11-10 11:30:00', 'CaSang', 'DaHuy');
    await make(w, '2026-11-10 12:00:00', 'CaSang', 'VangMat');
    await make(w, '2026-11-10 12:30:00', 'CaSang', 'DaDoiLich');
    // bác sĩ khác, cùng giờ
    const otherAppointment = await make(
      w,
      '2026-11-10 10:00:00',
      'CaSang',
      'DaXacNhan',
      w.other,
    );
    // ngoài khoảng ngày
    await make(w, '2026-11-09 10:00:00', 'CaSang');
    await make(w, '2026-11-13 10:00:00', 'CaSang');

    const all = await find(filterOf(w));
    expect(all).toEqual(
      [sang10, chieu10, sang11, chieu12].map((a) => ({
        lichHenId: a.lichHenId,
        maLichHen: a.maLichHen,
      })),
    );
    expect(codes(await find(filterOf(w, { ca: 'CaSang' })))).toEqual(
      [sang10, sang11].map((a) => a.maLichHen),
    );
    expect(codes(await find(filterOf(w, { ca: 'CaChieu' })))).toEqual(
      [chieu10, chieu12].map((a) => a.maLichHen),
    );
    expect(await find(filterOf(w, { ca: 'CaToi' }))).toEqual([]);
    expect(
      codes(await find(filterOf(w, { bacSiId: w.other.taiKhoanId }))),
    ).toEqual([otherAppointment.maLichHen]);
  });
});

describe('CG-11 findAffectedByLeave: lịch CÙNG ngày, một lịch đã qua giờ, một lịch chưa qua giờ', () => {
  it('chỉ lịch chưa qua giờ bị lấy; lịch đã qua giờ KHÔNG bị lấy (nên không bị huỷ)', async () => {
    const w = await leave.world();
    await make(w, '2026-11-10 09:00:00'); // đã qua giờ so với now 10:00
    const upcoming = await make(w, '2026-11-10 11:00:00');
    const found = await find(
      filterOf(w, {
        tuNgay: '2026-11-10',
        denNgay: '2026-11-10',
        now: new Date('2026-11-10T10:00:00+07:00'),
      }),
    );
    expect(codes(found)).toEqual([upcoming.maLichHen]);
  });
});

describe('CG-12 findAffectedByLeave, biên của now (nửa mở trên thoi_gian)', () => {
  it('thoi_gian = now KHÔNG bị lấy; now + 1 giây bị lấy; now có mili giây được cắt về giây (toSecond)', async () => {
    const w = await leave.world();
    const before = await make(w, '2026-11-10 08:59:59');
    const equal = await make(w, '2026-11-10 09:00:00');
    const after = await make(w, '2026-11-10 09:00:01');

    expect(codes(await find(filterOf(w)))).toEqual([after.maLichHen]);
    // mili giây bị cắt: 09:00:00.999 coi là 09:00:00 (không lấy lịch 09:00:00, có lấy 09:00:01)
    expect(
      codes(
        await find(
          filterOf(w, { now: new Date('2026-11-10T09:00:00.999+07:00') }),
        ),
      ),
    ).toEqual([after.maLichHen]);
    // đẩy now tới đúng 09:00:01 thì lịch 09:00:01 cũng rơi ra ngoài
    expect(
      await find(filterOf(w, { now: new Date('2026-11-10T09:00:01+07:00') })),
    ).toEqual([]);
    // lùi now về 08:59:59: lịch 08:59:59 rơi ra ngoài, hai lịch sau vào
    expect(
      codes(
        await find(filterOf(w, { now: new Date('2026-11-10T08:59:59+07:00') })),
      ),
    ).toEqual([equal.maLichHen, after.maLichHen]);
    expect(
      codes(
        await find(filterOf(w, { now: new Date('2026-11-10T08:59:58+07:00') })),
      ),
    ).toEqual([before.maLichHen, equal.maLichHen, after.maLichHen]);
    // hai hàm cùng biên
    expect(codes((await list(filterOf(w), 10)).items)).toEqual([
      after.maLichHen,
    ]);
  });
});

describe('CG-13 findAffectedByLeave ổn định theo now: chạy lại cho cùng tập, không đọc đồng hồ máy', () => {
  it('hai lần cùng now ⇒ cùng tập, kể cả khi đồng hồ ứng dụng bị giả sang thời điểm khác; sweeper chạy lại sau khi huỷ một phần ⇒ chỉ còn lịch chưa huỷ; now lớn hơn ⇒ tập con', async () => {
    const w = await leave.world();
    const a = await make(w, '2026-11-10 10:00:00');
    const b = await make(w, '2026-11-10 11:00:00');
    const c = await make(w, '2026-11-10 12:00:00');
    const filter = filterOf(w);

    const first = await find(filter);
    expect(first).toHaveLength(3);
    expect(await find(filter)).toEqual(first);
    // đồng hồ ứng dụng ở năm 2030: nếu hàm đọc đồng hồ máy thì không còn lịch nào ở tương lai
    vi.setSystemTime(new Date('2030-01-01T00:00:00+07:00'));
    expect(await find(filter)).toEqual(first);

    // sweeper huỷ một phần rồi chạy lại: không lấy lại lịch DaHuy
    await db.query(
      "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
      [a.lichHenId],
    );
    const rerun = await find(filter);
    expect(codes(rerun)).toEqual([b.maLichHen, c.maLichHen]);

    // now lớn hơn ⇒ tập con của lần trước
    const later = await find({
      ...filter,
      now: new Date('2026-11-10T11:30:00+07:00'),
    });
    expect(codes(later)).toEqual([c.maLichHen]);
    for (const code of codes(later)) expect(codes(rerun)).toContain(code);
  });
});

describe('CG-14 MỘT định nghĩa "bị ảnh hưởng": find và list ra cùng tập', () => {
  it('mọi tổ hợp CaNgay hay TheoCa, có hay không ca, trước hay sau now, vài khoảng ngày: tập maLichHen của items (limit lớn) bằng tập của find, tong bằng số phần tử; limit nhỏ ⇒ items đúng limit và tong không đổi', async () => {
    const w = await leave.world();
    let index = 0;
    for (const day of ['2026-11-10', '2026-11-11', '2026-11-12']) {
      for (const ca of ['CaSang', 'CaChieu'] as const) {
        const times =
          ca === 'CaSang' ? ['08:00:00', '10:30:00'] : ['13:00:00', '15:30:00'];
        for (const time of times) {
          const states: TrangThaiLichHen[] = [
            'DaXacNhan',
            'ChoThanhToan',
            'DaTiepDon',
            'DaHuy',
            'HoanThanh',
          ];
          await make(w, `${day} ${time}`, ca, states[index % states.length]);
          index += 1;
        }
      }
    }
    const ranges = [
      ['2026-11-10', '2026-11-12'],
      ['2026-11-11', '2026-11-11'],
      ['2026-11-12', '2026-11-12'],
      ['2026-11-09', '2026-11-09'],
    ] as const;
    let nonEmpty = 0;
    for (const [tuNgay, denNgay] of ranges) {
      for (const ca of [undefined, 'CaSang', 'CaChieu', 'CaToi'] as const) {
        for (const now of [NOW, new Date('2026-11-11T12:00:00+07:00')]) {
          const filter = filterOf(w, {
            tuNgay,
            denNgay,
            now,
            ...(ca === undefined ? {} : { ca }),
          });
          const found = await find(filter);
          const full = await list(filter, 1000);
          expect(full.tong).toBe(found.length);
          expect(codes(full.items)).toEqual(codes(found));
          if (found.length > 0) nonEmpty += 1;
          if (found.length >= 2) {
            const small = await list(filter, 1);
            expect(small.items).toHaveLength(1);
            expect(small.tong).toBe(found.length);
            expect(small.items[0]?.maLichHen).toBe(found[0]?.maLichHen);
          }
        }
      }
    }
    expect(nonEmpty).toBeGreaterThan(8); // bộ dữ liệu không rỗng nên phép so sánh có nghĩa
  });
});

describe('CG-15 listAffectedByLeave: số liệu và danh sách trắng', () => {
  it('một tài khoản đặt cho mình và hai người thân ⇒ soBenhNhan 1; soCoCoc đếm lịch cọc > 0; thêm người đặt thứ hai ⇒ 2; items đúng năm khoá, tên người khám đúng, tiền cọc chuỗi decimal, không SĐT, email, lý do khám, giá, id', async () => {
    const w = await leave.world();
    const owner = w.patientId;
    const relativeA = await fx.relative(owner, { hoTen: 'Người thân Một' });
    const relativeB = await fx.relative(owner, { hoTen: 'Người thân Hai' });
    const own = await leave.appointmentAt({
      doctor: w.doctor,
      at: '2026-11-10 10:00:00',
      patientId: owner,
    });
    const forA = await leave.appointmentAt({
      doctor: w.doctor,
      at: '2026-11-10 11:00:00',
      patientId: owner,
      hoSoNguoiThanId: relativeA,
      tienCoc: '50000.00',
      trangThai: 'ChoThanhToan',
    });
    const forB = await leave.appointmentAt({
      doctor: w.doctor,
      at: '2026-11-10 12:00:00',
      patientId: owner,
      hoSoNguoiThanId: relativeB,
      tienCoc: '70000.00',
    });

    const result = await list(filterOf(w), 10);
    expect(result).toMatchObject({ tong: 3, soBenhNhan: 1, soCoCoc: 2 });
    expect(
      result.items.map((item) => ({
        maLichHen: item.maLichHen,
        hoTen: item.nguoiKham.hoTen,
        tienCocSnapshot: item.tienCocSnapshot,
        trangThai: item.trangThai,
      })),
    ).toEqual([
      {
        maLichHen: own.maLichHen,
        hoTen: w.patient.account.hoTen,
        tienCocSnapshot: '0.00',
        trangThai: 'DaXacNhan',
      },
      {
        maLichHen: forA.maLichHen,
        hoTen: 'Người thân Một',
        tienCocSnapshot: '50000.00',
        trangThai: 'ChoThanhToan',
      },
      {
        maLichHen: forB.maLichHen,
        hoTen: 'Người thân Hai',
        tienCocSnapshot: '70000.00',
        trangThai: 'DaXacNhan',
      },
    ]);
    expect(result.items[0]?.thoiGian).toBe(
      new Date('2026-11-10T10:00:00+07:00').toISOString(),
    );
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toEqual([
        'maLichHen',
        'nguoiKham',
        'thoiGian',
        'tienCocSnapshot',
        'trangThai',
      ]);
      expect(Object.keys(item.nguoiKham)).toEqual(['hoTen']);
    }
    const text = JSON.stringify(result);
    expect(text).not.toContain(w.patient.account.email);
    expect(text).not.toContain(w.patient.account.soDienThoai);

    // người đặt thứ hai ⇒ soBenhNhan 2
    const second = (await fx.admin.patient()).account.taiKhoanId;
    await leave.appointmentAt({
      doctor: w.doctor,
      at: '2026-11-10 13:00:00',
      patientId: second,
    });
    expect(await list(filterOf(w), 10)).toMatchObject({
      tong: 4,
      soBenhNhan: 2,
      soCoCoc: 2,
    });
  });
});

describe('CG-18 biên ngày và giờ, giống hệt ở mọi múi giờ của tiến trình', () => {
  it('00:00 của tuNgay vào, 23:59:59 của denNgay vào, 23:59:59 trước tuNgay và 00:00 sau denNgay ra; thoi_gian = now ra, now + 1 giây vào; TZ=UTC, Asia/Ho_Chi_Minh và America/Los_Angeles cho kết quả y hệt; hai hàm cùng tập', async () => {
    const w = await leave.world();
    const beforeRange = await make(w, '2026-11-09 23:59:59', 'CaToi');
    const startOfRange = await make(w, '2026-11-10 00:00:00', 'CaSang');
    const endOfRange = await make(w, '2026-11-12 23:59:59', 'CaToi');
    const afterRange = await make(w, '2026-11-13 00:00:00', 'CaSang');
    const atNow = await make(w, '2026-11-11 09:00:00');
    const afterNow = await make(w, '2026-11-11 09:00:01');
    const scenarios = [
      {
        now: new Date('2026-11-09T12:00:00+07:00'),
        expected: [startOfRange, atNow, afterNow, endOfRange],
      },
      {
        now: new Date('2026-11-11T09:00:00+07:00'),
        expected: [afterNow, endOfRange],
      },
      { now: new Date('2026-11-12T23:59:59+07:00'), expected: [] },
    ];
    // `beforeRange` và `afterRange` luôn ra ngoài, ở mọi `now` và mọi múi giờ
    const excluded = [beforeRange.maLichHen, afterRange.maLichHen];

    const offsets: Record<string, number> = {
      UTC: 0,
      'Asia/Ho_Chi_Minh': -420,
      'America/Los_Angeles': 420,
    };
    const original = process.env.TZ;
    try {
      for (const [zone, offset] of Object.entries(offsets)) {
        process.env.TZ = zone;
        // đổi TZ phải có tác dụng thật, không thì ca này chỉ là hình thức
        expect(new Date(Date.UTC(2026, 5, 1, 12)).getTimezoneOffset() + 0).toBe(
          offset,
        );
        for (const { now, expected } of scenarios) {
          const filter = filterOf(w, { now });
          const found = await find(filter);
          const listed = await list(filter, 100);
          const wanted = expected.map((appointment) => appointment.maLichHen);
          expect(codes(found), `${zone} ${now.toISOString()}`).toEqual(wanted);
          expect(codes(listed.items), `${zone} ${now.toISOString()}`).toEqual(
            wanted,
          );
          expect(listed.tong).toBe(wanted.length);
          for (const code of excluded) expect(codes(found)).not.toContain(code);
        }
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});

describe('AFL-04 chỉ ĐỌC trên MySQL thật; AFL-05 limit ở biên và thứ tự', () => {
  it('find chạy đúng MỘT câu, list chạy hai câu (một câu khi rỗng hay limit = 0); không câu nào có khoá hay ghi', async () => {
    const w = await leave.world();
    await make(w, '2026-11-10 10:00:00');
    const statements = recordStatements(db);

    await find(filterOf(w));
    expect(statements).toHaveLength(1);
    await list(filterOf(w), 5);
    expect(statements).toHaveLength(3);
    await list(filterOf(w), 0);
    expect(statements).toHaveLength(4);
    await list(filterOf(w, { bacSiId: w.other.taiKhoanId }), 5);
    expect(statements).toHaveLength(5);
    for (const sql of statements) expect(sql).not.toMatch(WRITE_OR_LOCK_SQL);
  });

  it('limit 0, tong, tong + 1 và nhỏ hơn tong; tong không đổi; items sắp thoi_gian tăng rồi lich_hen_id (lịch tạo theo thứ tự id NGƯỢC với giờ; hai lịch cùng giờ ở hai ca xếp theo id)', async () => {
    const w = await leave.world();
    const created = [];
    for (const time of [
      '15:00:00',
      '14:00:00',
      '13:00:00',
      '12:00:00',
      '11:00:00',
    ])
      created.push(await make(w, `2026-11-10 ${time}`, 'CaSang'));
    // hai lịch CÙNG giờ ở hai ca khác nhau: lich_hen_id tăng dần quyết định thứ tự
    const tieFirst = await make(w, '2026-11-10 10:00:00', 'CaSang');
    const tieSecond = await make(w, '2026-11-10 10:00:00', 'CaChieu');
    const expected = [tieFirst, tieSecond, ...created.reverse()].map(
      (a) => a.maLichHen,
    );

    expect(codes((await list(filterOf(w), 100)).items)).toEqual(expected);
    for (const limit of [0, 1, 2, 7, 8, 1000]) {
      const result = await list(filterOf(w), limit);
      expect(result.tong).toBe(7);
      expect(codes(result.items)).toEqual(expected.slice(0, limit));
    }
  });
});
