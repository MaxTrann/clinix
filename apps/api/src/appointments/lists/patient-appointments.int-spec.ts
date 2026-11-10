import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { BacSi } from '../../admin/entities/bac-si.entity.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { T0 } from '../../auth/testing/otp-int-helpers.js';
import {
  AppointmentListFixtures,
  type BookInput,
} from '../testing/appointment-list-fixtures.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { PATIENT_VISIBLE_STATES } from './patient-appointments.dto.js';
import type {
  PatientAppointmentsPage,
  PatientAppointmentsQuery,
} from './patient-appointments.dto.js';
import { PatientAppointmentsRepository } from './patient-appointments.repository.js';
import { PatientAppointmentsService } from './patient-appointments.service.js';

// Task B1 — danh sách và lịch sử lịch hẹn của Bệnh nhân ở tầng dịch vụ và kho trên MySQL 8.4 THẬT (PLAN booking 7.4, 7.9; TRACKING 3.13.4): phạm vi chủ sở hữu, nhom, bộ lọc,
// số đếm, ẩn DaDoiLich, phân trang, `q`, ngày biên, `choPhepHuy`, hình dạng. HTTP thật: test/booking-patient-appointments.e2e-spec.ts. Mã LSH-nn là PLAN 7.4; LSH-15…LSH-20 là [đề xuất].
// Dữ liệu giả (email đuôi example.com), không dữ liệu thật. Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN); B1 không dùng giờ hiện tại.
let db: DataSource;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let repo: PatientAppointmentsRepository;
let service: PatientAppointmentsService;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = new BookingFixtures(testDb);
  lf = new AppointmentListFixtures(fx, testDb);
  repo = new PatientAppointmentsRepository();
  service = new PatientAppointmentsService(testDb, repo);
});

// Đầu vào giống DTO đã kiểm: offset = (page - 1) * pageSize
const ask = (
  query: Partial<PatientAppointmentsQuery> = {},
): PatientAppointmentsQuery => {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { ...query, page, pageSize, offset: (page - 1) * pageSize };
};
const list = (
  patientId: string,
  query: Partial<PatientAppointmentsQuery> = {},
) => service.list(patientId, ask(query));
const codesOf = (page: PatientAppointmentsPage) =>
  page.items.map((item) => item.maLichHen);
const sorted = (values: string[]) => [...values].sort();
// Lịch DaXacNhan của `patientId` với `doctor` vào `ngay` (viết tắt cho nhiều ca)
const confirmed = (doctor: BacSi, patientId: string, ngay: string) =>
  lf.book(doctor, 'DaXacNhan', { patientId, ngay });
const ZERO_COUNTS = {
  ChoThanhToan: 0,
  DaXacNhan: 0,
  DaTiepDon: 0,
  HoanThanh: 0,
  DaHuy: 0,
  VangMat: 0,
};

// Mỗi trạng thái một ngày để thứ tự theo giờ rõ ràng: ChoThanhToan 12, DaTiepDon 11, DaXacNhan 10, DaHuy 8, HoanThanh 5, VangMat 3 và DaDoiLich 9 (ẩn)
const DAY_OF: Record<TrangThaiLichHen, string> = {
  ChoThanhToan: '2026-11-12',
  DaTiepDon: '2026-11-11',
  DaXacNhan: '2026-11-10',
  DaDoiLich: '2026-11-09',
  DaHuy: '2026-11-08',
  HoanThanh: '2026-11-05',
  VangMat: '2026-11-03',
};

/** Bệnh nhân A có đủ bảy trạng thái (mỗi trạng thái một lịch, một ngày riêng) với một bác sĩ. */
async function patientWithEveryState() {
  const s = await lf.scene();
  const booked: Record<string, string> = {};
  for (const state of Object.keys(DAY_OF) as TrangThaiLichHen[]) {
    const appointment = await lf.book(s.doctor.profile, state, {
      patientId: s.patientId,
      ngay: DAY_OF[state],
    });
    booked[state] = appointment.maLichHen;
  }
  return { ...s, booked };
}

describe('LSH-01 phạm vi chủ sở hữu', () => {
  it('LSH-01 chỉ thấy lịch có benh_nhan_id = mình (bản thân VÀ hồ sơ người thân); lịch của bệnh nhân khác, kể cả của người thân họ, không lọt', async () => {
    const s = await lf.scene();
    const relativeId = await fx.relative(s.patientId);
    const other = await fx.admin.patient();
    const otherId = other.account.taiKhoanId;
    const otherRelativeId = await fx.relative(otherId);
    const doctor = s.doctor.profile;
    const book = (
      patientId: string,
      state: TrangThaiLichHen,
      ngay: string,
      hoSo?: string,
    ) =>
      lf.book(doctor, state, {
        patientId,
        ngay,
        ...(hoSo === undefined ? {} : { hoSoNguoiThanId: hoSo }),
      });
    const mine = [
      await book(s.patientId, 'DaXacNhan', '2026-11-10'),
      await book(s.patientId, 'ChoThanhToan', '2026-11-11', relativeId),
    ];
    const theirs = [
      await book(otherId, 'DaXacNhan', '2026-11-12'),
      await book(otherId, 'DaHuy', '2026-11-13', otherRelativeId),
    ];

    const page = await list(s.patientId);
    expect(sorted(codesOf(page))).toStrictEqual(
      sorted(mine.map((a) => a.maLichHen)),
    );
    expect(page.total).toBe(2);
    expect(page.demTheoTrangThai).toStrictEqual({
      ...ZERO_COUNTS,
      DaXacNhan: 1,
      ChoThanhToan: 1,
    });

    const theirPage = await list(otherId);
    expect(sorted(codesOf(theirPage))).toStrictEqual(
      sorted(theirs.map((a) => a.maLichHen)),
    );
    // Bệnh nhân không có lịch nào chỉ thấy rỗng, không thấy của ai khác
    const stranger = await fx.admin.patient();
    expect((await list(stranger.account.taiKhoanId)).items).toStrictEqual([]);
  });
});

describe('LSH-02 nhom và thứ tự', () => {
  it('LSH-02 SapToi = ba trạng thái hoạt động, giờ hẹn TĂNG dần; LichSu = ba trạng thái kết thúc, GIẢM dần; không nhom = sáu trạng thái, giảm dần, không có DaDoiLich', async () => {
    const a = await patientWithEveryState();
    const b = a.booked;
    const expectOrder = async (
      nhom: 'SapToi' | 'LichSu' | undefined,
      expected: string[],
    ) => {
      const page = await list(a.patientId, { nhom });
      expect(codesOf(page), String(nhom)).toStrictEqual(expected);
      expect(page.total).toBe(expected.length);
    };
    await expectOrder('SapToi', [
      b.DaXacNhan,
      b.DaTiepDon,
      b.ChoThanhToan,
    ] as string[]);
    await expectOrder('LichSu', [b.DaHuy, b.HoanThanh, b.VangMat] as string[]);
    await expectOrder(undefined, [
      b.ChoThanhToan,
      b.DaTiepDon,
      b.DaXacNhan,
      b.DaHuy,
      b.HoanThanh,
      b.VangMat,
    ] as string[]);
  });

  it('LSH-02 cùng giờ hẹn thì xếp theo lich_hen_id CÙNG chiều giờ: SapToi tăng, LichSu và không nhom giảm', async () => {
    const s = await lf.scene();
    const second = await lf.doctorIn(s.branch, 'Bác Sĩ Hai');
    const early = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-20',
    });
    const late = await lf.book(second.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-20',
    });
    expect(late.thoiGian.getTime()).toBe(early.thoiGian.getTime());
    expect(Number(late.lichHenId)).toBeGreaterThan(Number(early.lichHenId));

    expect(codesOf(await list(s.patientId, { nhom: 'SapToi' }))).toStrictEqual([
      early.maLichHen,
      late.maLichHen,
    ]);
    expect(codesOf(await list(s.patientId))).toStrictEqual([
      late.maLichHen,
      early.maLichHen,
    ]);
  });
});

describe('LSH-03 trangThai[]', () => {
  it('LSH-03 một giá trị, nhiều giá trị và nhiều giá trị khác nhóm đều lọc đúng', async () => {
    const a = await patientWithEveryState();
    const b = a.booked;
    const byStates = async (states: PatientAppointmentsQuery['trangThai']) =>
      sorted(codesOf(await list(a.patientId, { trangThai: states })));
    expect(await byStates(['DaHuy'])).toStrictEqual([b.DaHuy] as string[]);
    expect(await byStates(['DaHuy', 'VangMat'])).toStrictEqual(
      sorted([b.DaHuy, b.VangMat] as string[]),
    );
    expect(await byStates(['ChoThanhToan', 'HoanThanh'])).toStrictEqual(
      sorted([b.ChoThanhToan, b.HoanThanh] as string[]),
    );
    expect(await byStates([])).toStrictEqual([]);
  });
});

describe('LSH-04 hồ sơ đi khám', () => {
  it('LSH-04 BanThan chỉ lịch bản thân; id người thân chỉ lịch người đó, kể cả hồ sơ đã ngừng (lịch sử vẫn xem được)', async () => {
    const s = await lf.scene();
    const doctor = s.doctor.profile;
    const relativeId = await fx.relative(s.patientId, {
      hoTen: 'Người Thân Một',
    });
    const stoppedId = await fx.relative(s.patientId, {
      hoTen: 'Người Thân Đã Ngừng',
      active: false,
    });
    const self = await lf.book(doctor, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    const rel = await lf.book(doctor, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: relativeId,
    });
    const stopped = await lf.book(doctor, 'HoanThanh', {
      patientId: s.patientId,
      ngay: '2026-11-04',
      hoSoNguoiThanId: stoppedId,
    });

    const by = async (hoSoNguoiThanId: string) =>
      codesOf(await list(s.patientId, { hoSoNguoiThanId }));
    expect(await by('BanThan')).toStrictEqual([self.maLichHen]);
    expect(await by(relativeId)).toStrictEqual([rel.maLichHen]);
    expect(await by(stoppedId)).toStrictEqual([stopped.maLichHen]);
  });

  it('LSH-04, QB-01 id hồ sơ người thân của NGƯỜI KHÁC và id không tồn tại cho kết quả GIỐNG HỆT nhau (rỗng, đếm 0): không lộ hồ sơ đó có tồn tại hay không', async () => {
    const s = await lf.scene();
    const other = await fx.admin.patient();
    const otherId = other.account.taiKhoanId;
    const otherRelativeId = await fx.relative(otherId);
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: otherId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: otherRelativeId,
    });

    const ofOther = await list(s.patientId, {
      hoSoNguoiThanId: otherRelativeId,
    });
    const missing = await list(s.patientId, { hoSoNguoiThanId: '999999999' });
    expect(ofOther).toStrictEqual(missing);
    expect(ofOther).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: ZERO_COUNTS,
    });
    // Đối chứng: chính chủ hồ sơ đó thấy lịch của họ
    expect(
      codesOf(await list(otherId, { hoSoNguoiThanId: otherRelativeId })),
    ).toHaveLength(1);
  });
});

describe('LSH-05 demTheoTrangThai', () => {
  it('LSH-05 đếm đúng từng trạng thái, đủ sáu khoá, không có DaDoiLich; đổi trangThai[] KHÔNG đổi số đếm', async () => {
    const a = await patientWithEveryState();
    await lf.book(a.doctor.profile, 'DaHuy', {
      patientId: a.patientId,
      ngay: '2026-11-07',
    });
    const expected = {
      ...ZERO_COUNTS,
      ChoThanhToan: 1,
      DaXacNhan: 1,
      DaTiepDon: 1,
      HoanThanh: 1,
      DaHuy: 2,
      VangMat: 1,
    };

    const all = await list(a.patientId);
    expect(all.demTheoTrangThai).toStrictEqual(expected);
    expect(Object.keys(all.demTheoTrangThai).sort()).toStrictEqual(
      [...PATIENT_VISIBLE_STATES].sort(),
    );
    expect(all.total).toBe(7);

    const onlyCancelled = await list(a.patientId, { trangThai: ['DaHuy'] });
    expect(onlyCancelled.total).toBe(2);
    expect(onlyCancelled.demTheoTrangThai).toStrictEqual(expected);
  });

  it('LSH-05 số đếm theo các bộ lọc khác: hồ sơ, bác sĩ, khoảng ngày; và theo nhom (thẻ ngoài nhóm là 0)', async () => {
    const s = await lf.scene();
    const second = await lf.doctorIn(s.branch, 'Bác Sĩ Hai');
    const relativeId = await fx.relative(s.patientId);
    const mk = (
      doctor: typeof s.doctor.profile,
      state: TrangThaiLichHen,
      input: BookInput,
    ) => lf.book(doctor, state, input);
    await mk(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    await mk(s.doctor.profile, 'DaHuy', {
      patientId: s.patientId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: relativeId,
    });
    await mk(second.profile, 'DaHuy', {
      patientId: s.patientId,
      ngay: '2026-11-12',
    });
    await mk(second.profile, 'HoanThanh', {
      patientId: s.patientId,
      ngay: '2026-11-13',
      hoSoNguoiThanId: relativeId,
    });

    expect(
      (await list(s.patientId, { hoSoNguoiThanId: 'BanThan' }))
        .demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaXacNhan: 1, DaHuy: 1 });
    expect(
      (await list(s.patientId, { hoSoNguoiThanId: relativeId }))
        .demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaHuy: 1, HoanThanh: 1 });
    expect(
      (await list(s.patientId, { bacSiId: second.account.taiKhoanId }))
        .demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaHuy: 1, HoanThanh: 1 });
    expect(
      (await list(s.patientId, { tuNgay: '2026-11-11', denNgay: '2026-11-12' }))
        .demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaHuy: 2 });
    expect(
      (await list(s.patientId, { nhom: 'SapToi' })).demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaXacNhan: 1 });
    expect(
      (await list(s.patientId, { nhom: 'LichSu' })).demTheoTrangThai,
    ).toStrictEqual({ ...ZERO_COUNTS, DaHuy: 2, HoanThanh: 1 });
  });
});

describe('LSH-06 DaDoiLich', () => {
  it('LSH-06 lịch DaDoiLich không xuất hiện ở danh sách (mọi nhom) và không tính vào total lẫn số đếm', async () => {
    const a = await patientWithEveryState();
    for (const nhom of [undefined, 'SapToi', 'LichSu'] as const) {
      const page = await list(a.patientId, { nhom });
      expect(codesOf(page), String(nhom)).not.toContain(a.booked.DaDoiLich);
    }
    const all = await list(a.patientId);
    expect(all.total).toBe(6);
    expect(
      Object.values(all.demTheoTrangThai).reduce((sum, n) => sum + n, 0),
    ).toBe(6);
  });
});

describe('LSH-07 phân trang và ảnh chụp', () => {
  it('LSH-07 trang 1, 2, 3 đủ 23 lịch không trùng, trang vượt cuối rỗng nhưng total vẫn đúng', async () => {
    const s = await lf.scene();
    const created: string[] = [];
    for (let day = 1; day <= 23; day += 1) {
      const appointment = await lf.book(s.doctor.profile, 'DaXacNhan', {
        patientId: s.patientId,
        ngay: `2026-12-${String(day).padStart(2, '0')}`,
      });
      created.push(appointment.maLichHen);
    }
    const pages = [1, 2, 3, 4].map((page) =>
      list(s.patientId, { page, pageSize: 10 }),
    );
    const [p1, p2, p3, p4] = await Promise.all(pages);
    expect([p1, p2, p3, p4].map((p) => p?.items.length)).toStrictEqual([
      10, 10, 3, 0,
    ]);
    for (const page of [p1, p2, p3, p4]) expect(page?.total).toBe(23);
    const seen = [p1, p2, p3].flatMap((p) => (p ? codesOf(p) : []));
    expect(sorted(seen)).toStrictEqual(sorted(created));
    expect(new Set(seen).size).toBe(23);
    expect(p4).toMatchObject({ page: 4, pageSize: 10 });
  });

  it('LSH-07 total, số đếm và trang CÙNG ảnh chụp: lịch chèn và commit ở kết nối khác GIỮA hai câu không lọt vào kết quả này, nhưng có ở lần gọi sau', async () => {
    const s = await lf.scene();
    for (let day = 1; day <= 3; day += 1)
      await lf.book(s.doctor.profile, 'DaXacNhan', {
        patientId: s.patientId,
        ngay: `2026-12-0${String(day)}`,
      });
    const original = repo.count.bind(repo);
    vi.spyOn(repo, 'count').mockImplementation(async (...args) => {
      const total = await original(...args);
      // Kết nối KHÁC (pool) chèn và commit ngay sau câu đọc đầu tiên của giao dịch chỉ đọc
      await lf.book(s.doctor.profile, 'DaXacNhan', {
        patientId: s.patientId,
        ngay: '2026-12-09',
      });
      return total;
    });

    const page = await list(s.patientId, { pageSize: 100 });
    expect(page.total).toBe(3);
    expect(page.items).toHaveLength(3);
    expect(
      Object.values(page.demTheoTrangThai).reduce((sum, n) => sum + n, 0),
    ).toBe(3);

    vi.restoreAllMocks();
    expect((await list(s.patientId)).total).toBe(4);
  });

  it('LSH-18 page cực lớn (offset vượt số nguyên an toàn) trả 200 rỗng, total đúng, không lỗi MySQL', async () => {
    const s = await lf.scene();
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-12-01',
    });
    const huge = await list(s.patientId, {
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    });
    expect(huge).toMatchObject({
      items: [],
      total: 1,
      page: Number.MAX_SAFE_INTEGER,
    });
    const justBeyond = await list(s.patientId, { page: 2, pageSize: 1 });
    expect(justBeyond).toMatchObject({ items: [], total: 1 });
  });
});

describe('LSH-08 q', () => {
  it('LSH-08, QB-09 (phần danh sách) khớp CHỨA trên mã lịch, không phân biệt hoa thường: chữ thường, chữ hoa, lẫn lộn, một phần đều tìm ra; không khớp thì rỗng', async () => {
    const s = await lf.scene();
    const first = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
      maLichHen: 'CLX-20261110-ABCDE',
    });
    const second = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-11',
      maLichHen: 'CLX-20261111-FGHJK',
    });
    const find = async (q: string) =>
      sorted(codesOf(await list(s.patientId, { q })));
    expect(await find('CLX-20261110-ABCDE')).toStrictEqual([first.maLichHen]);
    expect(await find('clx-20261110-abcde')).toStrictEqual([first.maLichHen]);
    expect(await find('Clx-20261110-AbCdE')).toStrictEqual([first.maLichHen]);
    expect(await find('abcde')).toStrictEqual([first.maLichHen]);
    expect(await find('fghjk')).toStrictEqual([second.maLichHen]);
    expect(await find('CLX-2026111')).toStrictEqual(
      sorted([first.maLichHen, second.maLichHen]),
    );
    expect(await find('ZZZZZ')).toStrictEqual([]);
    expect((await list(s.patientId, { q: 'ZZZZZ' })).total).toBe(0);
  });

  it('LSH-08 ký tự đặc biệt của LIKE (%, _, !) là ký tự THƯỜNG: B_C chỉ khớp mã có dấu gạch dưới thật, 5% chỉ khớp mã có dấu phần trăm thật, -! chỉ khớp mã có dấu chấm than thật', async () => {
    const s = await lf.scene();
    const book = (maLichHen: string, ngay: string) =>
      lf.book(s.doctor.profile, 'DaXacNhan', {
        patientId: s.patientId,
        ngay,
        maLichHen,
      });
    const underscore = await book('CLX-AB_CD-001', '2026-11-01');
    await book('CLX-ABXCD-002', '2026-11-02');
    const percent = await book('CLX-5%-A-003', '2026-11-03');
    await book('CLX-55-B-004', '2026-11-04');
    const bang = await book('CLX-!-005', '2026-11-05');
    await book('CLX-X-006', '2026-11-06');
    const find = async (q: string) => codesOf(await list(s.patientId, { q }));
    expect(await find('B_C')).toStrictEqual([underscore.maLichHen]);
    expect(await find('5%')).toStrictEqual([percent.maLichHen]);
    expect(await find('-!')).toStrictEqual([bang.maLichHen]);
    // `%%` không phải "khớp tất cả": chỉ khớp mã chứa đúng hai dấu phần trăm liền nhau (không có)
    expect(await find('%%')).toStrictEqual([]);
  });

  it('LSH-08 tên bác sĩ: không phân biệt hoa thường và dấu, và chữ đ khớp d ở CẢ HAI chiều (dang khớp Đặng; đặng khớp cả Dang)', async () => {
    const s = await lf.scene({ doctorName: 'Đặng Văn Bác' });
    const second = await lf.doctorIn(s.branch, 'Lê Thị Khác');
    const third = await lf.doctorIn(s.branch, 'Dang Thanh Hải');
    const a = await confirmed(s.doctor.profile, s.patientId, '2026-11-10');
    const b = await confirmed(second.profile, s.patientId, '2026-11-11');
    const c = await confirmed(third.profile, s.patientId, '2026-11-12');
    const find = async (q: string) =>
      sorted(codesOf(await list(s.patientId, { q })));
    const dang = sorted([a.maLichHen, c.maLichHen]);
    expect(await find('dang')).toStrictEqual(dang);
    expect(await find('DANG')).toStrictEqual(dang);
    expect(await find('đặng')).toStrictEqual(dang);
    expect(await find('ĐẶNG')).toStrictEqual(dang);
    expect(await find('Đặng Văn')).toStrictEqual([a.maLichHen]);
    expect(await find('le thi')).toStrictEqual([b.maLichHen]);
    expect(await find('LÊ THỊ')).toStrictEqual([b.maLichHen]);
  });

  it('LSH-08 tên NGƯỜI KHÁM: lịch của người thân khớp tên người thân (không khớp tên người đặt); lịch bản thân khớp tên chính mình', async () => {
    const s = await lf.scene({ patientName: 'Nguyễn Văn Bệnh' });
    const relativeId = await fx.relative(s.patientId, {
      hoTen: 'Trần Thị Thân',
    });
    const self = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    const rel = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: relativeId,
    });
    const find = async (q: string) => codesOf(await list(s.patientId, { q }));
    expect(await find('nguyen')).toStrictEqual([self.maLichHen]);
    expect(await find('BỆNH')).toStrictEqual([self.maLichHen]);
    expect(await find('tran thi')).toStrictEqual([rel.maLichHen]);
    expect(await find('thân')).toStrictEqual([rel.maLichHen]);
  });

  it('LSH-08 q cùng các bộ lọc khác: tổng và số đếm đều theo q; q áp trong phạm vi chủ sở hữu (không thấy lịch của người khác dù trùng tên bác sĩ)', async () => {
    const s = await lf.scene({ doctorName: 'Phạm Văn Khoa' });
    const other = await fx.admin.patient({ hoTen: 'Người Khác' });
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    await lf.book(s.doctor.profile, 'DaHuy', {
      patientId: s.patientId,
      ngay: '2026-11-11',
    });
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: other.account.taiKhoanId,
      ngay: '2026-11-12',
    });
    const page = await list(s.patientId, { q: 'khoa', trangThai: ['DaHuy'] });
    expect(page.total).toBe(1);
    expect(page.demTheoTrangThai).toStrictEqual({
      ...ZERO_COUNTS,
      DaXacNhan: 1,
      DaHuy: 1,
    });
  });
});

describe('LSH-09 không có lịch', () => {
  it('LSH-09 (A1) không lịch nào phù hợp: items rỗng, total 0, đủ sáu số đếm bằng 0', async () => {
    const s = await lf.scene();
    expect(await list(s.patientId)).toStrictEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: ZERO_COUNTS,
    });
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    for (const query of [
      { bacSiId: '999999999' },
      { chuyenKhoaId: '999999999' },
      { tuNgay: '2030-01-01' },
      { denNgay: '2020-01-01' },
    ] as const) {
      const page = await list(s.patientId, query);
      expect(page.items, JSON.stringify(query)).toStrictEqual([]);
      expect(page.total).toBe(0);
    }
  });
});

describe('LSH-12 khoảng ngày giờ Việt Nam', () => {
  const MOMENTS = {
    beforeMidnight: '2026-11-09 23:59:59',
    startOfDay: '2026-11-10 00:00:00',
    midday: '2026-11-10 12:34:56',
    endOfDay: '2026-11-10 23:59:59',
    nextDayStart: '2026-11-11 00:00:00',
  };

  async function appointmentsAtEdges() {
    const s = await lf.scene();
    const codes: Record<string, string> = {};
    for (const [name, gio] of Object.entries(MOMENTS)) {
      const appointment = await lf.book(s.doctor.profile, 'DaXacNhan', {
        patientId: s.patientId,
        ngay: gio.slice(0, 10),
      });
      await lf.setTime(appointment.lichHenId, gio);
      codes[name] = appointment.maLichHen;
    }
    return { ...s, codes };
  }

  it('LSH-12 một ngày: gồm 00:00:00 và 23:59:59 của ngày đó, loại 23:59:59 hôm trước và 00:00:00 hôm sau', async () => {
    const s = await appointmentsAtEdges();
    const page = await list(s.patientId, {
      tuNgay: '2026-11-10',
      denNgay: '2026-11-10',
      nhom: 'SapToi',
    });
    expect(codesOf(page)).toStrictEqual([
      s.codes.startOfDay,
      s.codes.midday,
      s.codes.endOfDay,
    ] as string[]);
    expect(page.total).toBe(3);
  });

  it('LSH-12 chỉ tuNgay (mở phía sau) và chỉ denNgay (mở phía trước): đúng biên ở mỗi đầu', async () => {
    const s = await appointmentsAtEdges();
    const c = s.codes;
    expect(
      codesOf(await list(s.patientId, { tuNgay: '2026-11-10' })),
    ).toStrictEqual([
      c.nextDayStart,
      c.endOfDay,
      c.midday,
      c.startOfDay,
    ] as string[]);
    expect(
      codesOf(await list(s.patientId, { denNgay: '2026-11-10' })),
    ).toStrictEqual([
      c.endOfDay,
      c.midday,
      c.startOfDay,
      c.beforeMidnight,
    ] as string[]);
    expect(
      codesOf(
        await list(s.patientId, {
          tuNgay: '2026-11-10',
          denNgay: '2026-11-11',
        }),
      ),
    ).toHaveLength(4);
  });

  it('LSH-12 ca biên của cận: ngày đầu và ngày cuối mà DATETIME biểu diễn được không gây lỗi và gồm mọi lịch', async () => {
    const s = await appointmentsAtEdges();
    for (const query of [
      { tuNgay: '0001-01-01', denNgay: '9999-12-31' },
      { denNgay: '9999-12-31' },
      { denNgay: '9999-12-30' },
      { tuNgay: '0001-01-01' },
    ] as const) {
      const page = await list(s.patientId, query);
      expect(page.total, JSON.stringify(query)).toBe(5);
    }
  });

  it('LSH-12 bộ lọc ngày và nhom cùng áp; ngày lọc theo giờ VN, không lệch múi giờ (lịch 00:30 giờ VN vẫn thuộc ngày đó)', async () => {
    const s = await lf.scene();
    const appointment = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    await lf.setTime(appointment.lichHenId, '2026-11-10 00:30:00');
    expect(
      (await list(s.patientId, { tuNgay: '2026-11-10', denNgay: '2026-11-10' }))
        .total,
    ).toBe(1);
    expect(
      (await list(s.patientId, { tuNgay: '2026-11-09', denNgay: '2026-11-09' }))
        .total,
    ).toBe(0);
    expect(
      (
        await list(s.patientId, {
          tuNgay: '2026-11-10',
          denNgay: '2026-11-10',
          nhom: 'LichSu',
        })
      ).total,
    ).toBe(0);
  });
});

describe('LSH-13 choPhepHuy', () => {
  it('LSH-13 true CHỈ ở ChoThanhToan và DaXacNhan (giá trị thật trong JSON của từng trạng thái)', async () => {
    const a = await patientWithEveryState();
    const page = await list(a.patientId);
    const byState = Object.fromEntries(
      page.items.map((item) => [item.trangThai, item.choPhepHuy]),
    );
    expect(byState).toStrictEqual({
      ChoThanhToan: true,
      DaXacNhan: true,
      DaTiepDon: false,
      HoanThanh: false,
      DaHuy: false,
      VangMat: false,
    });
  });
});

describe('LSH-17 nhom cùng trangThai[]', () => {
  it('LSH-17 là GIAO của hai; giao rỗng ⇒ 200 rỗng nhưng số đếm vẫn theo nhom', async () => {
    const a = await patientWithEveryState();
    const b = a.booked;
    expect(
      codesOf(
        await list(a.patientId, {
          nhom: 'LichSu',
          trangThai: ['DaHuy', 'DaXacNhan'],
        }),
      ),
    ).toStrictEqual([b.DaHuy] as string[]);
    const empty = await list(a.patientId, {
      nhom: 'SapToi',
      trangThai: ['HoanThanh'],
    });
    expect(empty.items).toStrictEqual([]);
    expect(empty.total).toBe(0);
    expect(empty.demTheoTrangThai).toStrictEqual({
      ...ZERO_COUNTS,
      ChoThanhToan: 1,
      DaXacNhan: 1,
      DaTiepDon: 1,
    });
  });
});

describe('LSH-19 hình dạng và nội dung từng khoá', () => {
  it('LSH-19 đúng mười hai khoá; thoiGian ISO UTC của giờ VN, hanThanhToan ISO hoặc null, tiền là chuỗi decimal, tên bác sĩ, chuyên khoa, chi nhánh, dịch vụ, người khám', async () => {
    const s = await lf.scene({
      doctorName: 'Bác Sĩ Hình Dạng',
      patientName: 'Bệnh Nhân Hình Dạng',
    });
    const relativeId = await fx.relative(s.patientId, {
      hoTen: 'Người Thân Hình Dạng',
    });
    const pending = await lf.book(s.doctor.profile, 'ChoThanhToan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    const confirmed = await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-11',
      hoSoNguoiThanId: relativeId,
    });

    const names = await db.query<
      { chuyenKhoa: string; dichVu: string; chiNhanh: string }[]
    >(
      `SELECT ck.ten AS chuyenKhoa, dv.ten AS dichVu, cn.ten AS chiNhanh
         FROM bac_si bs JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = bs.dich_vu_kham_id
         JOIN chi_nhanh cn ON cn.chi_nhanh_id = bs.chi_nhanh_id
        WHERE bs.tai_khoan_id = ?`,
      [s.doctor.account.taiKhoanId],
    );
    const expectedNames = names[0];
    const page = await list(s.patientId);
    const byCode = Object.fromEntries(
      page.items.map((item) => [item.maLichHen, item]),
    );
    const first = byCode[pending.maLichHen];
    const second = byCode[confirmed.maLichHen];
    expect(first && Object.keys(first).sort()).toStrictEqual([
      'bacSi',
      'chiNhanh',
      'choPhepHuy',
      'chuyenKhoa',
      'dichVu',
      'giaSnapshot',
      'hanThanhToan',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
      'tienCoc',
      'trangThai',
    ]);
    // 08:00 giờ VN ngày 10/11/2026 = 01:00 UTC; hạn thanh toán = BOOKING_T0 (08:00 ngày 02/11) + 15 phút = 01:15 UTC
    expect(first).toStrictEqual({
      maLichHen: pending.maLichHen,
      trangThai: 'ChoThanhToan',
      thoiGian: '2026-11-10T01:00:00.000Z',
      bacSi: 'Bác Sĩ Hình Dạng',
      chuyenKhoa: expectedNames?.chuyenKhoa,
      chiNhanh: expectedNames?.chiNhanh,
      dichVu: expectedNames?.dichVu,
      nguoiKham: { hoTen: 'Bệnh Nhân Hình Dạng', laBanThan: true },
      giaSnapshot: '100000.00',
      tienCoc: '0.00',
      hanThanhToan: new Date(T0.getTime() + 15 * 60 * 1000).toISOString(),
      choPhepHuy: true,
    });
    expect(second).toMatchObject({
      trangThai: 'DaXacNhan',
      nguoiKham: { hoTen: 'Người Thân Hình Dạng', laBanThan: false },
      hanThanhToan: null,
    });
  });

  it('LSH-19, L14 chuyên khoa là chuyên khoa HIỆN TẠI của bác sĩ: bác sĩ đổi chuyên khoa thì lịch cũ chuyển theo, cả tên lẫn bộ lọc chuyenKhoaId', async () => {
    const s = await lf.scene();
    await lf.book(s.doctor.profile, 'DaXacNhan', {
      patientId: s.patientId,
      ngay: '2026-11-10',
    });
    const oldSpecialty = s.doctor.profile.chuyenKhoaId;
    const { specialty } = await fx.admin.catalog();
    await db.query(
      'UPDATE bac_si SET chuyen_khoa_id = ? WHERE tai_khoan_id = ?',
      [specialty.chuyenKhoaId, s.doctor.account.taiKhoanId],
    );

    const page = await list(s.patientId);
    expect(page.items[0]?.chuyenKhoa).toBe(specialty.ten);
    expect(
      (await list(s.patientId, { chuyenKhoaId: specialty.chuyenKhoaId })).total,
    ).toBe(1);
    expect(
      (await list(s.patientId, { chuyenKhoaId: oldSpecialty })).total,
    ).toBe(0);
  });

  it('LSH-19 bộ lọc bacSiId chỉ lấy lịch của bác sĩ đó', async () => {
    const s = await lf.scene();
    const second = await lf.doctorIn(s.branch, 'Bác Sĩ Hai');
    const a = await confirmed(s.doctor.profile, s.patientId, '2026-11-10');
    const b = await confirmed(second.profile, s.patientId, '2026-11-11');
    expect(
      codesOf(
        await list(s.patientId, { bacSiId: s.doctor.account.taiKhoanId }),
      ),
    ).toStrictEqual([a.maLichHen]);
    expect(
      codesOf(await list(s.patientId, { bacSiId: second.account.taiKhoanId })),
    ).toStrictEqual([b.maLichHen]);
  });
});
