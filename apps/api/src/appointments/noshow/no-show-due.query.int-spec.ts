import type { DataSource, EntityManager } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import {
  deleteDayHours,
  noShowWorld,
  setDayHours,
  type DayHours,
  type NoShowWorld,
} from '../testing/no-show-world.js';
import { db, fx, useStatusWorldHooks } from '../testing/status-int-kit.js';
import {
  countUnattended,
  findNoShowCandidates,
  isNoShowDue,
} from './no-show-due.query.js';

// Task B13 — NSQ-02, NSQ-03 và phần DỮ LIỆU của NSQ-04 (PLAN booking 7.35 `[đề xuất]`, 7.6 VM-02, VM-03, VM-11; TRACKING 3.29 B13-D, B13-H) trên MySQL 8.4 THẬT: câu chọn ứng viên và câu kiểm lại dưới khoá dùng CÙNG một hằng nên phải
// cho CÙNG MỘT tập lịch đến hạn, và tập đó phải bằng một hàm thuần ĐỘC LẬP viết ngay trong file này (thứ ISO bằng `getUTCDay`, không dùng SQL). Ý của 20 ca biên của X1 M6 (3.9.4) được dựng lại, KHÔNG tin kết quả cũ. Hình dạng câu: no-show-due.query.spec.ts.
useStatusWorldHooks();

const pad = (n: number): string => String(n).padStart(2, '0');
// Thứ Hai 09/11/2026 đến Chủ nhật 15/11/2026 (10/11/2026 là thứ Ba)
const DAYS = [
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
  '2026-11-15',
];
const DEFAULT_HOURS: DayHours = {
  sang: ['08:00:00', '12:00:00'],
  chieu: ['13:00:00', '17:00:00'],
};

/** Thứ ISO của ngày 'YYYY-MM-DD': 1 = Thứ Hai … 7 = Chủ nhật. Độc lập với SQL. */
const isoWeekday = (ngay: string): number => {
  const day = new Date(`${ngay}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

/** Giờ nhận khám của bốn chi nhánh của ma trận: `null` = THIẾU dòng của thứ đó */
type Plan = Record<number, DayHours | null>;
const planOf = (build: (thu: number) => DayHours | null): Plan =>
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((thu) => [thu, build(thu)]));
const PLANS: Record<'b1' | 'b2' | 'b3' | 'b4', Plan> = {
  // b1: đủ bảy thứ như thế giới gốc
  b1: planOf(() => DEFAULT_HOURS),
  // b2: Chủ nhật nghỉ, thứ Bảy không có buổi sáng, sáng thứ Hai kết thúc 11:30
  b2: planOf((thu) =>
    thu === 7
      ? { off: true }
      : thu === 6
        ? { sang: null, chieu: ['13:00:00', '17:00:00'] }
        : thu === 1
          ? { sang: ['08:00:00', '11:30:00'], chieu: ['13:00:00', '17:00:00'] }
          : DEFAULT_HOURS,
  ),
  // b3: thiếu hẳn dòng Chủ nhật (chi nhánh chưa khai báo)
  b3: planOf((thu) => (thu === 7 ? null : DEFAULT_HOURS)),
  // b4: sáng kết thúc `4 + thứ` giờ, để một thứ lệch một ngày làm đổi giờ kết thúc
  b4: planOf((thu) => ({
    sang: ['04:00:00', `${pad(4 + thu)}:00:00`],
    chieu: ['13:00:00', '17:00:00'],
  })),
};

type BranchKey = keyof typeof PLANS;
/** Giờ kết thúc của ca theo kế hoạch giờ nhận khám (`null`: không có khoảng, `CaToi`, nghỉ hay thiếu dòng) */
function shiftEnd(
  plan: Plan,
  ngay: string,
  ca: 'CaSang' | 'CaChieu' | 'CaToi',
): string | null {
  const hours = plan[isoWeekday(ngay)];
  if (hours === null || hours === undefined || 'off' in hours || ca === 'CaToi')
    return null;
  return (ca === 'CaSang' ? hours.sang : hours.chieu)?.[1] ?? null;
}

interface Case {
  /** Dùng cho thông báo lỗi */
  label: string;
  lichHenId: string;
  ngay: string;
  ca: 'CaSang' | 'CaChieu' | 'CaToi';
  gio: string;
  /** Chi nhánh của CA (nguồn của giờ kết thúc) */
  branch: BranchKey;
  trangThai: TrangThaiLichHen;
}

/** Hàm thuần ĐỘC LẬP: lịch đến hạn ở mốc `now` khi và chỉ khi `DaXacNhan`, giờ hẹn đã qua và giờ kết thúc ca đã qua (cả hai nửa mở: bằng `now` là đã qua). */
function isDueByOracle(c: Case, now: Date): boolean {
  if (c.trangThai !== 'DaXacNhan') return false;
  const end = shiftEnd(PLANS[c.branch], c.ngay, c.ca);
  if (end === null) return false;
  const at = (gio: string) => Date.parse(`${c.ngay}T${gio}+07:00`);
  return at(c.gio) <= now.getTime() && at(end) <= now.getTime();
}

/**
 * Dựng ma trận: bốn chi nhánh với lịch hoạt động riêng, mỗi chi nhánh một bác sĩ riêng, mỗi (chi nhánh, ngày, ca sáng và chiều) một lịch `DaXacNhan`; cộng ba lịch `CaToi`, sáu lịch ở trạng thái khác và MỘT lịch của
 * bác sĩ đổi chi nhánh (ca ghi chi nhánh b2, lịch ghi chi nhánh b1).
 */
async function buildMatrix(w: NoShowWorld, database: DataSource) {
  const branches = {
    b1: w.branch,
    b2: await fx.admin.branch(),
    b3: await fx.admin.branch(),
    b4: await fx.admin.branch(),
  };
  for (const key of ['b2', 'b3', 'b4'] as const)
    await fx.admin.weeklySchedule(branches[key].chiNhanhId);
  for (const key of ['b1', 'b2', 'b3', 'b4'] as const)
    for (const [thu, hours] of Object.entries(PLANS[key])) {
      if (hours === null)
        await deleteDayHours(database, branches[key].chiNhanhId, Number(thu));
      else
        await setDayHours(
          database,
          branches[key].chiNhanhId,
          Number(thu),
          hours,
        );
    }
  const doctors = {
    b1: (await fx.admin.doctor(branches.b1)).profile,
    b2: (await fx.admin.doctor(branches.b2)).profile,
    b3: (await fx.admin.doctor(branches.b3)).profile,
    b4: (await fx.admin.doctor(branches.b4)).profile,
  };
  const cases: Case[] = [];
  const add = async (
    c: Omit<Case, 'lichHenId'>,
    over: { chiNhanhLich?: string; doctor?: BranchKey } = {},
  ) => {
    const lich = await w.lichAt({
      doctor: doctors[over.doctor ?? c.branch],
      ngay: c.ngay,
      ca: c.ca,
      gio: c.gio,
      chiNhanhCa: branches[c.branch].chiNhanhId,
      trangThai: c.trangThai,
      ...(over.chiNhanhLich === undefined
        ? {}
        : { chiNhanhLich: over.chiNhanhLich }),
    });
    cases.push({ ...c, lichHenId: lich.lichHenId });
  };
  for (const branch of ['b1', 'b2', 'b3', 'b4'] as const)
    for (const ngay of DAYS)
      for (const [ca, gio] of [
        ['CaSang', '08:00:00'],
        ['CaChieu', '13:00:00'],
      ] as const)
        await add({
          label: `${branch} ${ngay} ${ca}`,
          ngay,
          ca,
          gio,
          branch,
          trangThai: 'DaXacNhan',
        });
  for (const ngay of ['2026-11-09', '2026-11-12', '2026-11-14'])
    await add({
      label: `b1 ${ngay} CaToi`,
      ngay,
      ca: 'CaToi',
      gio: '19:00:00',
      branch: 'b1',
      trangThai: 'DaXacNhan',
    });
  const others = [
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
    'DaDoiLich',
  ] as const;
  for (const [index, trangThai] of others.entries())
    await add({
      label: `b1 thứ Hai ${trangThai}`,
      ngay: '2026-11-09',
      ca: 'CaSang',
      gio: `09:${pad(index)}:00`,
      branch: 'b1',
      trangThai,
    });
  // Bác sĩ đổi chi nhánh: CA ghi b2 (sáng thứ Hai kết thúc 11:30) nhưng LỊCH ghi b1 (sáng thứ Hai kết thúc 12:00); giờ kết thúc là của CA
  await add(
    {
      label: 'ca b2, lịch b1',
      ngay: '2026-11-09',
      ca: 'CaSang',
      gio: '09:30:00',
      branch: 'b2',
      trangThai: 'DaXacNhan',
    },
    { chiNhanhLich: branches.b1.chiNhanhId },
  );
  return cases;
}

/** Mọi id ứng viên của mốc `now`, đọc theo lô nhỏ (7) để cả con trỏ được kiểm; theo `lich_hen_id` tăng dần. */
async function allCandidates(em: EntityManager, now: Date): Promise<string[]> {
  const ids: string[] = [];
  let after: string | null = null;
  for (;;) {
    const batch = await findNoShowCandidates(em, {
      now,
      afterId: after,
      limit: 7,
    });
    ids.push(...batch);
    if (batch.length < 7) return ids;
    after = batch[batch.length - 1] ?? null;
  }
}

const byId = (a: string, b: string): number =>
  BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;

const NOWS = [
  '2026-11-09T07:59:59+07:00', // trước mọi ca
  '2026-11-09T11:30:00+07:00', // đúng giờ kết thúc sáng thứ Hai của b2
  '2026-11-09T11:45:00+07:00', // b2 đã hết ca sáng, b1 chưa (bác sĩ đổi chi nhánh)
  '2026-11-09T12:00:00+07:00', // đúng giờ kết thúc sáng thứ Hai của b1 (nửa mở)
  '2026-11-09T12:00:01+07:00',
  '2026-11-09T17:00:00+07:00', // đúng giờ kết thúc chiều thứ Hai
  '2026-11-12T10:00:00+07:00',
  '2026-11-13T12:00:00+07:00',
  '2026-11-14T16:59:59+07:00',
  '2026-11-14T17:00:00+07:00', // đúng giờ kết thúc chiều thứ Bảy
  '2026-11-15T23:59:59+07:00',
  '2026-11-16T00:00:00+07:00', // sau mọi ca
].map((text) => new Date(text));

describe('NSQ-02 ứng viên = kiểm lại dưới khoá = hàm thuần độc lập, trên ma trận ca biên (VM-02, VM-03, VM-04, VM-11)', () => {
  it(`${String(NOWS.length)} mốc now × ma trận (4 chi nhánh × 7 thứ × 2 ca, CaToi, 6 trạng thái khác, bác sĩ đổi chi nhánh): ba cách cho CÙNG một tập; lịch không phải DaXacNhan và ca không có khoảng không bao giờ đến hạn`, async () => {
    const w = await noShowWorld(db, fx);
    const cases = await buildMatrix(w, db);
    expect(cases.length).toBeGreaterThanOrEqual(60);
    const sizes = new Set<number>();
    for (const now of NOWS) {
      const expected = cases
        .filter((c) => isDueByOracle(c, now))
        .map((c) => c.lichHenId)
        .sort(byId);
      sizes.add(expected.length);

      expect(
        await allCandidates(db.manager, now),
        `ứng viên ở ${now.toISOString()}`,
      ).toEqual(expected);
      const viaDue: string[] = [];
      for (const c of cases)
        if (await isNoShowDue(db.manager, c.lichHenId, now))
          viaDue.push(c.lichHenId);
      expect(
        viaDue.sort(byId),
        `kiểm lại dưới khoá ở ${now.toISOString()}`,
      ).toEqual(expected);
    }
    // Phép thử không rỗng: các mốc cho ra nhiều kích thước tập khác nhau, từ rỗng tới gần hết
    expect(sizes.has(0)).toBe(true);
    expect(sizes.size).toBeGreaterThanOrEqual(6);
    expect(Math.max(...sizes)).toBeGreaterThan(30);
  }, 120_000);

  it('bác sĩ đổi chi nhánh: giờ kết thúc là của CA (b2: 11:30), không phải của lịch (b1: 12:00): đến hạn ở 11:45 thứ Hai', async () => {
    const w = await noShowWorld(db, fx);
    const cases = await buildMatrix(w, db);
    const moved = cases.find((c) => c.label === 'ca b2, lịch b1');
    expect(moved).toBeDefined();
    const at1145 = new Date('2026-11-09T11:45:00+07:00');
    expect(await isNoShowDue(db.manager, moved?.lichHenId ?? '', at1145)).toBe(
      true,
    );
    // đối chứng: lịch cùng giờ của ca b1 (sáng thứ Hai kết thúc 12:00) CHƯA đến hạn ở 11:45
    const sameAsB1 = cases.find((c) => c.label === 'b1 2026-11-09 CaSang');
    expect(
      await isNoShowDue(db.manager, sameAsB1?.lichHenId ?? '', at1145),
    ).toBe(false);
  });
});

describe('NSQ-03 cắt sớm: không bao giờ đánh Vắng mặt TRƯỚC giờ hẹn của chính lịch đó, kể cả khi ca đã kết thúc theo giờ làm mới (VM-02)', () => {
  it('chi nhánh THU HẸP giờ làm sau khi khung giờ đã sinh: ca đã kết thúc theo giờ mới nhưng thoi_gian > now ⇒ KHÔNG đến hạn; thoi_gian = now ⇒ đến hạn (nửa mở)', async () => {
    const w = await noShowWorld(db, fx);
    const early = await w.booked('DaXacNhan', 0); // 08:00
    const late = await w.booked('DaXacNhan', 7); // 11:30
    // Sáng thứ Ba (10/11/2026) thu hẹp: kết thúc 11:00 thay vì 12:00 (khung giờ 11:30 đã sinh từ giờ làm cũ)
    await setDayHours(db, w.branch.chiNhanhId, 2, {
      sang: ['08:00:00', '11:00:00'],
      chieu: ['13:00:00', '17:00:00'],
    });
    const due = async (text: string) => ({
      candidates: await allCandidates(db.manager, new Date(text)),
      early: await isNoShowDue(db.manager, early.lichHenId, new Date(text)),
      late: await isNoShowDue(db.manager, late.lichHenId, new Date(text)),
    });
    // 10:59:59: chưa hết ca (giờ mới 11:00)
    expect(await due('2026-11-10T10:59:59+07:00')).toEqual({
      candidates: [],
      early: false,
      late: false,
    });
    // 11:00:00 đúng giờ kết thúc mới: lịch 08:00 đến hạn; lịch 11:30 CHƯA (giờ hẹn còn ở tương lai)
    expect(await due('2026-11-10T11:00:00+07:00')).toEqual({
      candidates: [early.lichHenId],
      early: true,
      late: false,
    });
    expect(await due('2026-11-10T11:29:59+07:00')).toEqual({
      candidates: [early.lichHenId],
      early: true,
      late: false,
    });
    // 11:30:00 đúng giờ hẹn: lịch 11:30 đến hạn (bằng now là đã qua)
    expect(await due('2026-11-10T11:30:00+07:00')).toEqual({
      candidates: [early.lichHenId, late.lichHenId].sort(byId),
      early: true,
      late: true,
    });
  });

  it('khung giờ nằm NGOÀI giờ làm hiện tại (giờ hẹn 14:00 trong ca sáng kết thúc 12:00): không đến hạn ở 12:30, 13:59:59; đến hạn đúng 14:00:00', async () => {
    const w = await noShowWorld(db, fx);
    const stray = await w.lichAt({
      ngay: '2026-11-11',
      ca: 'CaSang',
      gio: '14:00:00',
    });
    const at = (text: string) => new Date(`2026-11-11T${text}+07:00`);
    for (const text of ['12:00:00', '12:30:00', '13:59:59'])
      expect(
        await isNoShowDue(db.manager, stray.lichHenId, at(text)),
        text,
      ).toBe(false);
    expect(await isNoShowDue(db.manager, stray.lichHenId, at('14:00:00'))).toBe(
      true,
    );
    expect(await allCandidates(db.manager, at('13:59:59'))).toEqual([]);
    expect(await allCandidates(db.manager, at('14:00:00'))).toEqual([
      stray.lichHenId,
    ]);
  });
});

describe('NSQ-04 (phần dữ liệu) câu đếm ca không có khoảng chỉ đếm DaXacNhan ĐÃ QUÁ giờ hẹn mà giờ kết thúc NULL, gồm chi nhánh thiếu dòng (VM-11)', () => {
  it('đếm CaToi, buổi không khoảng, chi nhánh nghỉ thứ đó, thiếu dòng lịch hoạt động; KHÔNG đếm lịch tương lai, lịch trạng thái khác, lịch có giờ kết thúc', async () => {
    const w = await noShowWorld(db, fx);
    const branch = w.branch.chiNhanhId;
    // Giờ nhận khám của chi nhánh thế giới (thứ Hai … Chủ nhật = 1 … 7): thứ Tư (3) nghỉ, thứ Năm (4) không có buổi sáng, thứ Sáu (5) thiếu dòng
    await setDayHours(db, branch, 3, { off: true });
    await setDayHours(db, branch, 4, {
      sang: null,
      chieu: ['13:00:00', '17:00:00'],
    });
    await deleteDayHours(db, branch, 5);
    const counted = [
      await w.lichAt({ ngay: '2026-11-09', ca: 'CaToi', gio: '19:00:00' }), // thứ Hai, ca tối
      await w.lichAt({ ngay: '2026-11-11', ca: 'CaSang', gio: '08:00:00' }), // thứ Tư, chi nhánh nghỉ
      await w.lichAt({ ngay: '2026-11-12', ca: 'CaSang', gio: '08:00:00' }), // thứ Năm, không buổi sáng
      await w.lichAt({ ngay: '2026-11-13', ca: 'CaChieu', gio: '13:00:00' }), // thứ Sáu, thiếu dòng
    ];
    await w.lichAt({ ngay: '2026-11-16', ca: 'CaToi', gio: '19:00:00' }); // ca tối nhưng TƯƠNG LAI (sau mốc)
    await w.lichAt({
      ngay: '2026-11-09',
      ca: 'CaToi',
      gio: '19:30:00',
      trangThai: 'DaHuy',
    }); // trạng thái khác
    await w.lichAt({ ngay: '2026-11-09', ca: 'CaSang', gio: '08:00:00' }); // có giờ kết thúc (thứ Hai 12:00): là ứng viên, không phải "không khoảng"
    const now = new Date('2026-11-15T12:00:00+07:00');
    expect(await countUnattended(db.manager, now)).toBe(counted.length);
    // lịch thiếu dòng KHÔNG nằm trong ứng viên (JOIN loại im lặng) nhưng nằm trong số đếm (LEFT JOIN)
    const candidates = await allCandidates(db.manager, now);
    for (const lich of counted)
      expect(candidates).not.toContain(lich.lichHenId);
    expect(candidates).toHaveLength(1);
    // đổi mốc về trước ngày thứ Sáu: lịch thứ Sáu chưa quá giờ hẹn nên không đếm
    expect(
      await countUnattended(db.manager, new Date('2026-11-13T12:00:00+07:00')),
    ).toBe(3);
  });
});
