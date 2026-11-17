import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import { moderationWorld } from '../../doctor/examination/testing/moderation-stack.js';
import { DoctorRatingReader, NO_RATING } from './doctor-rating.reader.js';

// doctor-exam B9 — `DoctorRatingReader` THẬT trên MySQL 8.4 THẬT (PLAN doctor-exam 5.9, 7.6 DTB-01…DTB-05; `[đề xuất]` DTB-05 (b), DTB-12 (c), (d), DTB-13 (I)).
// Phần đơn vị (DataSource giả): doctor-rating.reader.spec.ts. Phần HTTP (DTB-06…08, DTB-10): test/doctor-exam-public-rating.e2e-spec.ts. KDD-15, DTB-03 và DHK-08 của B8 chạy lại bằng reader THẬT ở moderation/rating-hide.*int-spec.ts.
// Dữ liệu giả; mọi giá trị mong đợi viết tay (KHÔNG tính lại công thức ở test). Ba chi nhánh, mỗi chi nhánh một bác sĩ (`moderationWorld`); ca cần nhiều bác sĩ tạo thêm bằng `fx.admin.doctor`.
useStatusWorldHooks();

async function setup() {
  const m = await moderationWorld(db, fx, await world());
  return { m, reader: new DoctorRatingReader(db) };
}
type Setup = Awaited<ReturnType<typeof setup>>;
type Doctor = Setup['m']['doctors']['a'];

const idOf = (doctor: Doctor): string => doctor.account.taiKhoanId;

/** Một bác sĩ MỚI (chi nhánh A) với các đánh giá hiển thị theo thứ tự `stars`; trả bác sĩ và id các đánh giá. */
async function doctorRated(t: Setup, stars: readonly number[]) {
  const doctor = await fx.admin.doctor(t.m.branches.a);
  const ratingIds: string[] = [];
  for (const soSao of stars)
    ratingIds.push((await t.m.seed({ doctor, soSao })).danhGiaId);
  return { doctor, ratingIds };
}

/** Ẩn một đánh giá bằng SQL (đúng hai cột mà B8 đổi); service ẩn THẬT được kiểm ở rating-hide.int-spec.ts. */
const hide = (danhGiaId: string) =>
  db.query(
    'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE danh_gia_bac_si_id = ?',
    ['Nội dung quảng cáo, không liên quan', danhGiaId],
  );

describe('DTB-01 bác sĩ không có đánh giá', () => {
  it('không đánh giá nào, hoặc có lịch HoanThanh nhưng chưa ai đánh giá, hoặc id không tồn tại ⇒ { null, 0 } (chính NO_RATING)', async () => {
    const t = await setup();
    const withVisit = t.m.doctors.b;
    const { slotIds } = await fx.doctor.shiftWithSlots(withVisit.profile, {
      ngay: '2026-12-01',
      ca: 'CaSang',
    });
    await fx.appointmentIn('HoanThanh', {
      doctor: withVisit.profile,
      khungGioId: slotIds[0] ?? '',
      patientId: t.m.buyers.one,
      hoSoNguoiThanId: null,
    });
    const ids = [
      idOf(t.m.doctors.a),
      idOf(withVisit),
      idOf(t.m.doctors.c),
      '999999999',
    ];
    const result = await t.reader.readMany(ids);
    expect([...result.keys()]).toEqual(ids);
    for (const id of ids) {
      expect(result.get(id)).toBe(NO_RATING);
      expect(result.get(id)).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
    }
  });
});

describe('DTB-02 làm tròn một chữ số (ROUND nửa lên, đã đo ở M5), chuỗi có ".0"', () => {
  it('(5,4), (5,5,4), 4,25, 3,35, số nguyên', async () => {
    const t = await setup();
    const many = [...Array<number>(13).fill(3), ...Array<number>(7).fill(4)];
    const cases: [string, number[], string, number][] = [
      ['(5, 4)', [5, 4], '4.5', 2],
      ['(5, 5, 4) = 4,666…', [5, 5, 4], '4.7', 3],
      ['(4, 4, 4, 5) = 4,25 nửa lên', [4, 4, 4, 5], '4.3', 4],
      ['20 đánh giá tổng 67 = 3,35 nửa lên', many, '3.4', 20],
      ['(4, 4, 4) số nguyên', [4, 4, 4], '4.0', 3],
      ['(1)', [1], '1.0', 1],
      ['(5)', [5], '5.0', 1],
    ];
    const rated = [];
    for (const [label, stars, diem, count] of cases)
      rated.push({
        label,
        diem,
        count,
        doctor: (await doctorRated(t, stars)).doctor,
      });
    const result = await t.reader.readMany(rated.map((r) => idOf(r.doctor)));
    for (const { label, diem, count, doctor } of rated) {
      expect(result.get(idOf(doctor)), label).toEqual({
        diemTrungBinh: diem,
        soDanhGia: count,
      });
    }
  }, 60_000);
});

describe('DTB-03 đánh giá đã ẩn không tính (cả điểm lẫn số lượt)', () => {
  it('5, 4, 1 và một đánh giá đã ẩn từ trước ⇒ "3.3"/3; ẩn 1 sao ⇒ "4.5"/2; ẩn hết ⇒ { null, 0 }', async () => {
    const t = await setup();
    const { doctor, ratingIds } = await doctorRated(t, [5, 4, 1]);
    await t.m.seed({ doctor, soSao: 2, hiddenReason: 'Đã ẩn từ trước' });
    const read = async () =>
      (await t.reader.readMany([idOf(doctor)])).get(idOf(doctor));
    expect(await read()).toEqual({ diemTrungBinh: '3.3', soDanhGia: 3 });
    await hide(ratingIds[2] ?? '');
    expect(await read()).toEqual({ diemTrungBinh: '4.5', soDanhGia: 2 });
    await hide(ratingIds[0] ?? '');
    expect(await read()).toEqual({ diemTrungBinh: '4.0', soDanhGia: 1 });
    await hide(ratingIds[1] ?? '');
    expect(await read()).toEqual({ diemTrungBinh: null, soDanhGia: 0 });
  });

  it('bác sĩ chỉ có MỘT đánh giá và nó đã ẩn ⇒ { null, 0 }', async () => {
    const t = await setup();
    const doctor = await fx.admin.doctor(t.m.branches.a);
    await t.m.seed({ doctor, soSao: 1, hiddenReason: 'Spam liên kết' });
    expect((await t.reader.readMany([idOf(doctor)])).get(idOf(doctor))).toEqual(
      { diemTrungBinh: null, soDanhGia: 0 },
    );
  });
});

describe('DTB-04, DTB-05 một lời gọi cho nhiều bác sĩ; nhóm đúng theo lich_hen.bac_si_id', () => {
  it('A (5, 4), B (2, 3), C không có, id không tồn tại: đủ khoá theo thứ tự đầu vào, không lẫn; đánh giá ẩn của A không đụng B', async () => {
    const t = await setup();
    const a = await doctorRated(t, [5, 4]);
    const b = await doctorRated(t, [2, 3]);
    await t.m.seed({ doctor: a.doctor, soSao: 1, hiddenReason: 'Spam' });
    const c = await fx.admin.doctor(t.m.branches.a);
    const ids = [idOf(c), idOf(a.doctor), '999999999', idOf(b.doctor)];
    const result = await t.reader.readMany(ids);
    expect([...result.keys()]).toEqual(ids);
    expect(result.get(idOf(a.doctor))).toEqual({
      diemTrungBinh: '4.5',
      soDanhGia: 2,
    });
    expect(result.get(idOf(b.doctor))).toEqual({
      diemTrungBinh: '2.5',
      soDanhGia: 2,
    });
    expect(result.get(idOf(c))).toBe(NO_RATING);
    expect(result.get('999999999')).toBe(NO_RATING);
  });

  it('DTB-05 (b) `[đề xuất]`: bác sĩ chuyển chi nhánh SAU khi có đánh giá vẫn giữ điểm (điểm thuộc bác sĩ, không thuộc chi nhánh của lịch)', async () => {
    const t = await setup();
    const { doctor } = await doctorRated(t, [5, 4, 4]);
    const before = await t.reader.readMany([idOf(doctor)]);
    await t.m.moveDoctor(doctor, t.m.branches.b.chiNhanhId);
    await t.m.seed({ doctor, soSao: 3 });
    const after = await t.reader.readMany([idOf(doctor)]);
    expect(before.get(idOf(doctor))).toEqual({
      diemTrungBinh: '4.3',
      soDanhGia: 3,
    });
    expect(after.get(idOf(doctor))).toEqual({
      diemTrungBinh: '4.0',
      soDanhGia: 4,
    });
  });
});

describe('DTB-12 `[đề xuất]` (c), (d) id biên trên MySQL thật', () => {
  it('(c) [] ⇒ Map rỗng không lỗi; 1.000 id (1 thật, 999 không có) ⇒ Map đủ 1.000 khoá và đúng MỘT kết quả', async () => {
    const t = await setup();
    expect((await t.reader.readMany([])).size).toBe(0);
    const { doctor } = await doctorRated(t, [5, 4]);
    const ids = [
      ...Array.from({ length: 499 }, (_, i) => String(900_000_000 + i)),
      idOf(doctor),
      ...Array.from({ length: 500 }, (_, i) => String(910_000_000 + i)),
    ];
    const result = await t.reader.readMany(ids);
    expect(result.size).toBe(1000);
    expect([...result.keys()]).toEqual(ids);
    const rated = [...result.entries()].filter(([, v]) => v !== NO_RATING);
    expect(rated).toEqual([
      [idOf(doctor), { diemTrungBinh: '4.5', soDanhGia: 2 }],
    ]);
  });

  it('(d) id lớn hơn 2^53 và gần giới hạn BIGINT: từng id ra đúng bác sĩ, KHÔNG trộn id lân cận (hằng chuỗi trong IN không mất chính xác)', async () => {
    const t = await setup();
    const base = 9007199254740992n; // 2^53
    const stars = new Map<string, number>([
      [(base + 0n).toString(), 1],
      [(base + 1n).toString(), 2],
      [(base + 2n).toString(), 3],
      [(base + 3n).toString(), 4],
      ['9223372036854775806', 5],
      ['9223372036854775807', 1],
    ]);
    // Dòng thô (lịch và đánh giá) cho bác sĩ có id lớn; tắt khoá ngoại ở MỘT kết nối vì không có tài khoản bác sĩ với id đó.
    const runner = db.createQueryRunner();
    try {
      await runner.query('SET FOREIGN_KEY_CHECKS = 0');
      let seq = 0;
      for (const [bacSiId, soSao] of stars) {
        seq += 1;
        const lich = (await runner.query(
          `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai)
           VALUES (?, ?, 1, ?, 1, 1, '2026-12-01 09:00:00', 100000.00, 'HoanThanh')`,
          [`ID-LON-${String(seq)}`, 8_000_000 + seq, bacSiId],
        )) as { insertId: number | string };
        await runner.query(
          `INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, bi_an, ly_do_an, thoi_diem_tao)
           VALUES (?, ?, 0, NULL, '2026-12-02 09:00:00')`,
          [String(lich.insertId), soSao],
        );
      }
    } finally {
      await runner.query('SET FOREIGN_KEY_CHECKS = 1');
      await runner.release();
    }
    const expected = (id: string) => ({
      diemTrungBinh: `${String(stars.get(id))}.0`,
      soDanhGia: 1,
    });
    const pair = [(base + 1n).toString(), (base + 3n).toString()];
    const together = await t.reader.readMany(pair);
    for (const id of pair) expect(together.get(id)).toEqual(expected(id));
    for (const id of stars.keys()) {
      const alone = await t.reader.readMany([id]);
      expect([...alone.keys()]).toEqual([id]);
      expect(alone.get(id), id).toEqual(expected(id));
    }
  });
});

describe('DTB-13 `[đề xuất]` không cache: MỘT thể hiện reader, mỗi lần đọc thấy trạng thái mới nhất', () => {
  it('đọc, gửi thêm đánh giá, đọc, ẩn đánh giá đầu, đọc', async () => {
    const t = await setup();
    const { doctor, ratingIds } = await doctorRated(t, [4]);
    const read = async () =>
      (await t.reader.readMany([idOf(doctor)])).get(idOf(doctor));
    expect(await read()).toEqual({ diemTrungBinh: '4.0', soDanhGia: 1 });
    await t.m.seed({ doctor, soSao: 5 });
    expect(await read()).toEqual({ diemTrungBinh: '4.5', soDanhGia: 2 });
    await hide(ratingIds[0] ?? '');
    expect(await read()).toEqual({ diemTrungBinh: '5.0', soDanhGia: 1 });
  });
});
