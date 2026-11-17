import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { buildSlotService, SlotFixtures } from '../testing/slot-fixtures.js';

// Search Slots PR-C1 trên MySQL 8.4 THẬT: KGC-20 đến KGC-30, KGC-33 (KGC-31 là lượt chạy lại cả file với TZ=UTC). Mã PLAN đã có mà các ca phủ: KGI-01 đến KGI-04, AN, CC-07.
// `now` luôn GHIM bằng tham số (không phụ thuộc đồng hồ máy). 2026-11-18 là thứ Tư, 2026-11-19 là thứ Năm (ISO 4).
const NOW = new Date('2026-11-18T07:00:00+07:00');
const TODAY = '2026-11-18';
const NGAY = '2026-11-19';
const MISSING = '999999999';

let db: DataSource;
let fx: SlotFixtures;
let built: ReturnType<typeof buildSlotService>;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fx = new SlotFixtures(db);
  built = buildSlotService(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await db?.destroy();
});

const list = (ids: string | string[], ngay = NGAY, now = NOW) =>
  built.service.list(
    { bacSiIds: Array.isArray(ids) ? ids.join(',') : ids, ngay },
    now,
  );
const setSlot = (id: string, trangThai: string, giuChoDen: string | null) =>
  db.query(
    'UPDATE khung_gio SET trang_thai = ?, giu_cho_den = ? WHERE khung_gio_id = ?',
    [trangThai, giuChoDen, id],
  );
/** Chi nhánh nghỉ MỘT thứ (chk_lich_hoat_dong_ngay: ngày nghỉ thì bốn cột giờ phải trống). */
const closeWeekday = (chiNhanhId: string, thu: number) =>
  db.query(
    `UPDATE chi_nhanh_lich_hoat_dong
        SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL
      WHERE chi_nhanh_id = ? AND thu_trong_tuan = ?`,
    [chiNhanhId, thu],
  );
const statusesOf = (item?: { khungGio: { trangThai: string }[] }) =>
  item?.khungGio.map((slot) => slot.trangThai);

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppException);
  return (error as AppException).getResponse();
}

describe('KGC-20 ngày có lịch (KGI-01)', () => {
  it('ca sáng và chiều: đủ 16 ô theo thứ tự ca rồi giờ, ISO UTC, ketThuc = batDau + thời lượng', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, NGAY);
    const out = await list(id);

    expect(out.ngay).toBe(NGAY);
    expect(out.items).toHaveLength(1);
    const [item] = out.items;
    expect(item).toMatchObject({ bacSiId: id, trangThaiNgay: 'CoLich' });
    expect(item?.khungGio.map((s) => s.khungGioId)).toEqual(slotIds);
    expect(item?.khungGio.map((s) => s.ca)).toEqual([
      ...Array<string>(8).fill('CaSang'),
      ...Array<string>(8).fill('CaChieu'),
    ]);
    expect(item?.khungGio[0]).toEqual({
      khungGioId: slotIds[0],
      batDau: '2026-11-19T01:00:00.000Z', // 08:00 giờ VN
      ketThuc: '2026-11-19T01:30:00.000Z',
      ca: 'CaSang',
      trangThai: 'ConTrong',
    });
    expect(item?.khungGio[15]).toMatchObject({
      batDau: '2026-11-19T09:30:00.000Z', // 16:30 giờ VN
      ketThuc: '2026-11-19T10:00:00.000Z',
      ca: 'CaChieu',
    });
    expect(item).not.toHaveProperty('thuNghi');
  });

  it('ca chưa có khung giờ ⇒ CoLich với khungGio rỗng (web phải chịu được)', async () => {
    const branch = await fx.branch();
    const doctor = await fx.search.publicDoctor(branch);
    await fx.search.admin.shift(doctor.profile, { ngay: NGAY, ca: 'CaSang' });
    const out = await list(doctor.account.taiKhoanId);
    expect(out.items[0]).toEqual({
      bacSiId: doctor.account.taiKhoanId,
      trangThaiNgay: 'CoLich',
      khungGio: [],
    });
  });
});

describe('KGC-21 KhongCoLich và ChiNhanhNghi (KGI-04)', () => {
  it('bác sĩ không có ca ngày đó ⇒ KhongCoLich, rỗng, không thuNghi', async () => {
    const branch = await fx.branch();
    const doctor = await fx.search.publicDoctor(branch);
    expect((await list(doctor.account.taiKhoanId)).items).toEqual([
      {
        bacSiId: doctor.account.taiKhoanId,
        trangThaiNgay: 'KhongCoLich',
        khungGio: [],
      },
    ]);
  });

  it('chi nhánh nghỉ thứ đó, rồi thứ đó CHƯA KHAI BÁO ⇒ ChiNhanhNghi kèm thuNghi = 4', async () => {
    const branch = await fx.branch();
    const doctor = await fx.search.publicDoctor(branch);
    const expected = {
      bacSiId: doctor.account.taiKhoanId,
      trangThaiNgay: 'ChiNhanhNghi',
      thuNghi: 4,
      khungGio: [],
    };
    await closeWeekday(branch.chiNhanhId, 4);
    expect((await list(doctor.account.taiKhoanId)).items).toEqual([expected]);
    await db.query(
      'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = 4',
      [branch.chiNhanhId],
    );
    expect((await list(doctor.account.taiKhoanId)).items).toEqual([expected]);
  });

  it('ca tối (CaToi) không có khoảng nhận khám: ô bị ẩn (hành vi hiện hành của reader, khoá lại, KHÔNG sửa reader)', async () => {
    const branch = await fx.branch();
    const doctor = await fx.search.publicDoctor(branch);
    const shift = await fx.search.admin.shift(doctor.profile, {
      ngay: NGAY,
      ca: 'CaToi',
    });
    await db.query(
      "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio, trang_thai) VALUES (?, ?, 'ConTrong')",
      [shift.lichLamViecId, `${NGAY} 19:00:00`],
    );
    const [item] = (await list(doctor.account.taiKhoanId)).items;
    expect(item?.khungGio).toEqual([]);
    expect(item?.trangThaiNgay).toBe('CoLich');
  });
});

describe('KGC-22 nghỉ phép: gộp thành KhongCoLich, không lộ (KGI-03)', () => {
  const setup = async () => {
    const branch = await fx.branch();
    const { id } = await fx.publicDoctorWithShifts(branch, NGAY);
    const admin = (await fx.search.admin.admin()).account.taiKhoanId;
    return { id, admin };
  };
  const hidden = (json: unknown) =>
    expect(JSON.stringify(json)).not.toMatch(
      /NghiPhep|Việc gia đình|lyDo|yeuCau|nguoiXuLy/,
    );

  it.each(['ChoDuyet', 'DaDuyet'] as const)(
    'nghỉ cả ngày %s ⇒ KhongCoLich, KHÔNG NghiPhep, không ô, không lý do',
    async (trangThai) => {
      const { id, admin } = await setup();
      await fx.doctors.leaveRequest({
        bacSiId: id,
        batDau: NGAY,
        trangThai,
        ...(trangThai === 'DaDuyet' && {
          nguoiXuLyId: admin,
          thoiDiemXuLy: '2026-11-17 09:00:00',
        }),
      });
      const out = await list(id);
      expect(out.items).toEqual([
        { bacSiId: id, trangThaiNgay: 'KhongCoLich', khungGio: [] },
      ]);
      hidden(out);
    },
  );

  it('nghỉ TheoCa sáng ⇒ CoLich, chỉ còn 8 ô ca chiều', async () => {
    const { id } = await setup();
    await fx.doctors.leaveRequest({
      bacSiId: id,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: NGAY,
    });
    const out = await list(id);
    expect(out.items[0]?.trangThaiNgay).toBe('CoLich');
    expect(new Set(out.items[0]?.khungGio.map((s) => s.ca))).toEqual(
      new Set(['CaChieu']),
    );
    expect(out.items[0]?.khungGio).toHaveLength(8);
    hidden(out);
  });

  it('yêu cầu TuChoi không ảnh hưởng', async () => {
    const { id, admin } = await setup();
    await fx.doctors.leaveRequest({
      bacSiId: id,
      batDau: NGAY,
      trangThai: 'TuChoi',
      nguoiXuLyId: admin,
      thoiDiemXuLy: '2026-11-17 09:00:00',
    });
    const [item] = (await list(id)).items;
    expect(item?.trangThaiNgay).toBe('CoLich');
    expect(item?.khungGio).toHaveLength(16);
  });
});

describe('KGC-23 bốn trạng thái ô (KGI-02)', () => {
  it('ConTrong, DaDat, DangGiuCho còn hạn, DangGiuCho hết hạn ⇒ ConTrong, HetHan đã lưu; không lộ giuChoDen', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, NGAY, [
      'CaSang',
    ]);
    await setSlot(slotIds[1] as string, 'DaDat', null);
    await setSlot(slotIds[2] as string, 'DangGiuCho', '2026-11-18 07:15:00');
    await setSlot(slotIds[3] as string, 'DangGiuCho', '2026-11-18 06:00:00');
    await setSlot(slotIds[4] as string, 'HetHan', null);
    const out = await list(id);
    expect(statusesOf(out.items[0])?.slice(0, 6)).toEqual([
      'ConTrong',
      'DaDat',
      'DangGiuCho',
      'ConTrong', // giữ chỗ đã quá hạn: coi như trống
      'HetHan',
      'ConTrong',
    ]);
    expect(JSON.stringify(out)).not.toContain('giuChoDen');
  });

  it('ngày hôm nay lúc 08:45: ô đã qua giờ là HetHan, kể cả ô DaDat; ô sau đó giữ trạng thái', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, TODAY, [
      'CaSang',
    ]);
    await setSlot(slotIds[0] as string, 'DaDat', null); // 08:00, đã qua giờ
    await setSlot(slotIds[2] as string, 'DaDat', null); // 09:00, còn ở tương lai
    const out = await list(id, TODAY, new Date(`${TODAY}T08:45:00+07:00`));
    expect(statusesOf(out.items[0])?.slice(0, 4)).toEqual([
      'HetHan',
      'HetHan',
      'DaDat',
      'ConTrong',
    ]);
  });
});

describe('KGC-24 bác sĩ không công khai: cùng thân với không tồn tại (chống dò id)', () => {
  it('bốn loại ẩn, MỖI loại có ca và ô trống thật ⇒ phản hồi giống hệt id không tồn tại', async () => {
    const branch = await fx.branch();
    const open = await fx.publicDoctorWithShifts(branch, NGAY, ['CaSang']);
    const hiddenDoctors = [
      await fx.search.pendingDoctor(branch),
      await fx.search.suspendedDoctor(branch),
      await fx.search.doctorOfInactiveSpecialty(branch),
      await fx.search.doctorWithRemovedService(branch),
    ];
    for (const doctor of hiddenDoctors)
      await fx.addShifts(doctor, NGAY, ['CaSang']);
    const hiddenIds = hiddenDoctors.map((d) => d.account.taiKhoanId);

    // Đối chứng: reader (không lọc công khai) THẤY đủ 8 ô của từng bác sĩ ẩn ⇒ việc ẩn là do bộ lọc của search.
    const raw = await built.reader.listMany({
      bacSiIds: hiddenIds,
      ngay: NGAY,
      now: NOW,
    });
    expect(raw.map((day) => day.khungGio.length)).toEqual([8, 8, 8, 8]);

    const out = await list([...hiddenIds, open.id, MISSING]);
    expect(out.items.map((item) => item.bacSiId)).toEqual([
      ...hiddenIds,
      open.id,
      MISSING,
    ]);
    const missing = out.items[5];
    expect(open.slotIds).toHaveLength(8);
    expect(out.items[4]?.khungGio).toHaveLength(8); // bác sĩ công khai cạnh đó vẫn đủ ô
    const sameAsMissing = (item?: object) =>
      JSON.stringify({ ...item, bacSiId: 'X' });
    for (const item of out.items.slice(0, 4))
      expect(sameAsMissing(item)).toBe(sameAsMissing(missing));
    expect(missing).toEqual({
      bacSiId: MISSING,
      trangThaiNgay: 'KhongCoLich',
      khungGio: [],
    });
  });
});

describe('KGC-25 nhiều bác sĩ: thứ tự và bỏ trùng', () => {
  it('thứ tự theo đầu vào (đảo đầu vào thì đảo kết quả); id lặp ra một phần tử; id không tồn tại ở giữa', async () => {
    const open = await fx.branch();
    const closed = await fx.branch();
    await closeWeekday(closed.chiNhanhId, 4);
    const a = await fx.publicDoctorWithShifts(open, NGAY, ['CaSang']);
    const b = (await fx.search.publicDoctor(open)).account.taiKhoanId;
    const c = (await fx.search.publicDoctor(closed)).account.taiKhoanId;
    const days = (ids: string[]) =>
      list(ids).then((out) =>
        out.items.map((item) => `${item.bacSiId}:${item.trangThaiNgay}`),
      );

    expect(await days([c, a.id, b])).toEqual([
      `${c}:ChiNhanhNghi`,
      `${a.id}:CoLich`,
      `${b}:KhongCoLich`,
    ]);
    expect(await days([b, a.id, c])).toEqual([
      `${b}:KhongCoLich`,
      `${a.id}:CoLich`,
      `${c}:ChiNhanhNghi`,
    ]);
    expect(await days([a.id, a.id, b, a.id])).toEqual([
      `${a.id}:CoLich`,
      `${b}:KhongCoLich`,
    ]);
    expect(await days([a.id, MISSING, b])).toEqual([
      `${a.id}:CoLich`,
      `${MISSING}:KhongCoLich`,
      `${b}:KhongCoLich`,
    ]);
  });
});

describe('KGC-26 biên ngày với `now` ghim', () => {
  it('hôm nay đến hôm nay + 6 đạt; +7 và hôm qua ⇒ 400 NGAY_NGOAI_KHOANG', async () => {
    for (let offset = 0; offset <= 6; offset += 1) {
      const ngay = new Date(Date.UTC(2026, 10, 18 + offset))
        .toISOString()
        .slice(0, 10);
      expect((await list(MISSING, ngay)).ngay).toBe(ngay);
    }
    for (const ngay of ['2026-11-25', '2026-11-17'])
      expect(await rejection(list(MISSING, ngay))).toMatchObject({
        maLoi: 'BO_LOC_KHONG_HOP_LE',
        loi: [{ truong: 'ngay', ma: 'NGAY_NGOAI_KHOANG' }],
      });
  });

  it('ranh nửa đêm giờ VN: 23:59:59 ngày 18 còn nhận ngày 18, 00:00:00 ngày 19 thì không', async () => {
    const late = new Date('2026-11-18T23:59:59+07:00');
    expect((await list(MISSING, TODAY, late)).ngay).toBe(TODAY);
    await rejection(
      list(MISSING, TODAY, new Date('2026-11-19T00:00:00+07:00')),
    );
  });

  it('ca ngày hôm nay lúc 23:59:59: mọi ô đã qua giờ ⇒ toàn HetHan, ngày vẫn CoLich', async () => {
    const branch = await fx.branch();
    const { id } = await fx.publicDoctorWithShifts(branch, TODAY);
    const out = await list(id, TODAY, new Date('2026-11-18T23:59:59+07:00'));
    expect(out.items[0]?.trangThaiNgay).toBe('CoLich');
    expect(new Set(statusesOf(out.items[0]))).toEqual(new Set(['HetHan']));
    expect(out.items[0]?.khungGio).toHaveLength(16);
  });
});

interface Statement {
  sql: string;
  params: unknown[];
}
/** Ghi MỌI câu đi qua QueryRunner của giao dịch (cả câu điều khiển giao dịch); `manager.query` đi qua `runner.query`. */
function recordStatements(): Statement[] {
  const sent: Statement[] = [];
  const original = db.createQueryRunner.bind(db);
  vi.spyOn(db, 'createQueryRunner').mockImplementation((...args) => {
    const runner = original(...args);
    const query = runner.query.bind(runner);
    runner.query = ((sql: string, params?: unknown[]) => {
      sent.push({ sql, params: params ?? [] });
      return query(sql, params);
    }) as typeof runner.query;
    return runner;
  });
  return sent;
}
const CONTROL = /^\s*(?:SET\s+TRANSACTION|START\s+TRANSACTION|COMMIT)\b/i;
const isSelect = (s: Statement) => /^\s*SELECT\b/i.test(s.sql);

describe('KGC-27 đếm câu SQL thật: đúng 4 SELECT cho cả trang (H14)', () => {
  it('1 bác sĩ và 100 id (20 có thật) đều đúng 4 SELECT; câu còn lại chỉ là điều khiển giao dịch; 0 câu ghi', async () => {
    const branch = await fx.branch();
    const real = [];
    for (let i = 0; i < 20; i += 1) {
      real.push(
        i < 3
          ? (await fx.publicDoctorWithShifts(branch, NGAY)).id
          : (await fx.search.publicDoctor(branch)).account.taiKhoanId,
      );
    }
    const ids = [...real];
    while (ids.length < 100) ids.push(String(900_000_000 + ids.length));

    const sent = recordStatements();
    await list(real[0] as string);
    expect(sent.filter(isSelect)).toHaveLength(4);
    expect(
      sent.filter((s) => !isSelect(s)).every((s) => CONTROL.test(s.sql)),
    ).toBe(true);

    sent.length = 0;
    const out = await list(ids);
    expect(out.items).toHaveLength(100);
    expect(sent.filter(isSelect)).toHaveLength(4);
    expect(sent.filter(isSelect)[0]?.params).toHaveLength(100); // câu lọc nhận cả 100 id
    expect(
      sent.filter((s) => !isSelect(s)).every((s) => CONTROL.test(s.sql)),
    ).toBe(true);
    expect(sent.map((s) => s.sql).join('\n')).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|FOR\s+UPDATE|FOR\s+SHARE)\b/i,
    );
  });

  it('không bác sĩ nào công khai ⇒ đúng 1 SELECT (bỏ qua reader)', async () => {
    const sent = recordStatements();
    await list([MISSING, '999999998']);
    expect(sent.filter(isSelect)).toHaveLength(1);
  });
});

describe('KGC-28 chỉ đọc (CC-07)', () => {
  it('dữ liệu các bảng liên quan y nguyên trước và sau khi đọc', async () => {
    const branch = await fx.branch();
    const { id } = await fx.publicDoctorWithShifts(branch, NGAY);
    await fx.doctors.leaveRequest({
      bacSiId: id,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: NGAY,
    });
    const snapshot = async () =>
      JSON.stringify(
        await Promise.all(
          [
            'khung_gio',
            'lich_lam_viec',
            'yeu_cau_nghi_phep',
            'lich_hen',
            'chi_nhanh_lich_hoat_dong',
            'bac_si',
          ].map((table) => db.query(`SELECT * FROM ${table} ORDER BY 1`)),
        ),
      );
    const before = await snapshot();
    await list([id, MISSING]);
    await list([id], TODAY);
    expect(await snapshot()).toBe(before);
  });
});

describe('KGC-29 KHÔNG khoá: đọc không chờ người đang giữ khoá ghi', () => {
  it('giao dịch khác đang FOR UPDATE bac_si, ca, khung giờ (và đã UPDATE chưa commit) ⇒ đọc trả NGAY, thấy trạng thái đã commit', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, NGAY, [
      'CaSang',
    ]);
    const holder = db.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    let timer: NodeJS.Timeout | undefined;
    try {
      await holder.query(
        'SELECT tai_khoan_id FROM bac_si WHERE tai_khoan_id = ? FOR UPDATE',
        [id],
      );
      await holder.query(
        'SELECT lich_lam_viec_id FROM lich_lam_viec WHERE bac_si_id = ? FOR UPDATE',
        [id],
      );
      await holder.query(
        `SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id IN (${slotIds.map(() => '?').join(', ')}) FOR UPDATE`,
        slotIds,
      );
      await setSlotOn(holder, slotIds[0] as string);

      const blocked = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('đọc công khai bị chặn bởi khoá ghi')),
          5000,
        );
      });
      const out = await Promise.race([list(id), blocked]);
      expect(out.items[0]?.khungGio[0]?.trangThai).toBe('ConTrong'); // chưa commit thì khách chưa thấy
    } finally {
      if (timer) clearTimeout(timer);
      await holder.rollbackTransaction();
      await holder.release();
    }
  });
});

const setSlotOn = (
  runner: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  khungGioId: string,
) =>
  runner.query(
    "UPDATE khung_gio SET trang_thai = 'DaDat', giu_cho_den = NULL WHERE khung_gio_id = ?",
    [khungGioId],
  );

describe('KGC-30 nhất quán MỘT thời điểm (tất định, REPEATABLE READ)', () => {
  it('một lần hoán đổi DaDat từ ô A sang ô B được commit GIỮA câu lọc công khai và câu đọc ca ⇒ phản hồi vẫn là trạng thái trước commit', async () => {
    const branch = await fx.branch();
    const { id, slotIds } = await fx.publicDoctorWithShifts(branch, NGAY, [
      'CaSang',
    ]);
    const [a, b] = [slotIds[1] as string, slotIds[2] as string];
    await setSlot(a, 'DaDat', null);

    const swap = () =>
      db.transaction(async (em) => {
        await em.query(
          "UPDATE khung_gio SET trang_thai = 'ConTrong' WHERE khung_gio_id = ?",
          [a],
        );
        await setSlotOn(em, b);
      });
    const original = built.repository.findPublicIds.bind(built.repository);
    vi.spyOn(built.repository, 'findPublicIds').mockImplementation(
      async (...args) => {
        const visible = await original(...args); // ảnh chụp của giao dịch đọc đã được lập ở câu này
        await swap(); // commit trên kết nối KHÁC, ngay sau
        return visible;
      },
    );

    const during = statusesOf((await list(id)).items[0]);
    expect(during?.slice(1, 3)).toEqual(['DaDat', 'ConTrong']); // trước commit
    vi.restoreAllMocks();
    const after = statusesOf((await list(id)).items[0]);
    expect(after?.slice(1, 3)).toEqual(['ConTrong', 'DaDat']); // lần đọc sau thấy commit
  });
});

describe('KGC-33 mức cô lập thật của giao dịch đọc', () => {
  it('reader chạy trong giao dịch REPEATABLE READ và READ ONLY', async () => {
    const branch = await fx.branch();
    const { id } = await fx.publicDoctorWithShifts(branch, NGAY, ['CaSang']);
    const original = built.reader.listMany.bind(built.reader);
    let trx: { iso: string; ro: number | string } | undefined;
    let writeError: string | undefined;
    vi.spyOn(built.reader, 'listMany').mockImplementation(async (input, em) => {
      const manager = em ?? db.manager;
      // `@@transaction_isolation` và `@@transaction_read_only` KHÔNG dùng được: đặc tính "giao dịch kế tiếp" bị đặt lại khi giao dịch bắt đầu
      // (đo lần đầu: read_only = 0 trong giao dịch chỉ đọc; mức cô lập chỉ trùng mặc định). InnoDB báo đúng đặc tính của giao dịch ĐANG CHẠY.
      const rows = await manager.query<{ iso: string; ro: number | string }[]>(
        `SELECT trx_isolation_level AS iso, trx_is_read_only AS ro
           FROM information_schema.innodb_trx WHERE trx_mysql_thread_id = CONNECTION_ID()`,
      );
      trx = rows[0];
      // Chứng minh thứ hai: MySQL từ chối MỌI câu ghi trong giao dịch chỉ đọc (kể cả khi không dòng nào bị đổi).
      writeError = await manager
        .query(
          'UPDATE khung_gio SET trang_thai = trang_thai WHERE khung_gio_id = -1',
        )
        .then(
          () => undefined,
          (error: unknown) => String(error),
        );
      return original(input, em);
    });
    await list(id);
    expect(trx?.iso).toBe('REPEATABLE READ');
    expect(Number(trx?.ro)).toBe(1);
    expect(writeError).toMatch(/READ ONLY/i);
  });
});
