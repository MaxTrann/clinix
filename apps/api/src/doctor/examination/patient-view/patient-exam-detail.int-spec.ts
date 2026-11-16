import { vi } from 'vitest';
import {
  interceptStatements,
  recordStatements,
  WRITE_OR_LOCK_SQL,
  type StatementCall,
} from '../../../appointments/testing/statement-recorder.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import { AppException } from '../../../common/errors/app.exception.js';
import { ExamFixtures } from '../testing/exam-fixtures.js';
import { recordBody, recordService } from '../testing/exam-record-stack.js';
import {
  branchName,
  detailService,
  FORBIDDEN_DETAIL_KEYS,
  keysDeep,
  nameDoctorAndPatient,
  seedVisits,
  specialtyName,
} from '../testing/patient-exam-stack.js';

// doctor-exam B5 — PatientExamDetailService THẬT trên MySQL 8.4 THẬT (PLAN 5.6, 5.15; 7.3 XHS-06…XHS-10, XHS-14, XHS-18, XHS-19, XHS-20; 7.7 QHK-05): MỘT câu SELECT THẬT trong MỘT `runReadOnly` THẬT.
// Phần ĐƠN VỊ (không DB): patient-exam-detail.*.spec.ts. Phần HTTP: test/doctor-exam-patient-records.e2e-spec.ts. Đồng hồ giả đặt MỘT lần ở `setup` (NOW = 10/11/2026 09:00 giờ VN).
// Dữ liệu giả; mọi lịch dựng qua `seedVisits` (booking) nên khung giờ nhất quán với trạng thái; giờ khám đặt lại bằng `at`. Tên bác sĩ và Bệnh nhân đặt KHÁC NHAU ở `setup` (`nameDoctorAndPatient`); tên chi nhánh, chuyên khoa đọc từ DB bằng SQL riêng (`branchName`…), không chép hằng.
// "Mồi" (decoy): dòng `ho_so_kham` và `danh_gia_bac_si` của lịch KHÁC mang khoá chính TRÙNG `lich_hen_id` của lịch đang đọc: join sai khoá (`hsk.ho_so_kham_id = lh.lich_hen_id`) sẽ lấy nhầm dòng mồi, còn join đúng thì không.
useStatusWorldHooks();

const NOW = new Date('2026-11-10T09:00:00+07:00');
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};
const SELECT = /^\s*SELECT\b/i;

async function setup() {
  vi.setSystemTime(NOW);
  const w = await world();
  // tên bác sĩ KHÁC tên Bệnh nhân (bộ dựng mặc định cho mọi tài khoản cùng tên): lộn hai tên thì đỏ
  const names = await nameDoctorAndPatient(db, w);
  return {
    w,
    ...names,
    service: detailService(db),
    exam: new ExamFixtures(db),
    doctorId: w.doctor.account.taiKhoanId,
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Lỗi ném ra (hoặc `null` nếu không lỗi): để so CẢ thân của 404, không chỉ mã. */
const failureOf = (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => null,
    (error: unknown) => error,
  );

async function expectNotFound(work: Promise<unknown>): Promise<void> {
  const error = await failureOf(work);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).getStatus()).toBe(404);
  expect((error as AppException).getResponse()).toStrictEqual(NOT_FOUND_BODY);
}

/** Dòng mồi mang khoá chính `id` (xem đầu file): chèn TRƯỚC dòng thật để dòng thật nhận khoá tự tăng KHÁC `id`. */
async function decoys(otherLichHenId: string, id: string): Promise<void> {
  await db.query(
    `INSERT INTO ho_so_kham (ho_so_kham_id, lich_hen_id, trieu_chung, chan_doan_so_bo, huong_xu_ly, cap_nhat_lan_cuoi)
     VALUES (?, ?, 'MỒI triệu chứng', 'MỒI chẩn đoán', 'MỒI hướng xử lý', '2026-01-01 00:00:00')`,
    [id, otherLichHenId],
  );
  await db.query(
    `INSERT INTO danh_gia_bac_si (danh_gia_bac_si_id, lich_hen_id, so_sao, nhan_xet, thoi_diem_tao)
     VALUES (?, ?, 1, 'MỒI nhận xét', '2026-01-01 00:00:00')`,
    [id, otherLichHenId],
  );
}

const relationOf = async (relativeId: string): Promise<string> => {
  const rows = await db.query<{ v: string }[]>(
    'SELECT moi_quan_he AS v FROM ho_so_nguoi_than WHERE ho_so_nguoi_than_id = ?',
    [relativeId],
  );
  return rows[0]?.v ?? '';
};

describe('XHS-06 chi tiết đủ bốn trường, đánh giá, chi nhánh; khoá chính lệch lịch', () => {
  it('khám cho NGƯỜI THÂN có hồ sơ và đánh giá: đúng từng giá trị theo DB, ĐÚNG chín khoá, sáu khoá hồ sơ, ba khoá đánh giá; join đúng khoá dù có dòng mồi trùng khoá chính', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      other: { at: '2026-11-02 09:00:00', patientId: t.w.secondPatientId },
      mine: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: t.w.relativeId },
    });
    await decoys(v.other.lichHenId, v.mine.lichHenId);
    const recordId = await t.exam.record(v.mine.lichHenId, {
      trieuChung: 'Ho khan, sốt nhẹ hai ngày',
      chanDoanSoBo: 'Viêm họng cấp',
      huongXuLy: 'Uống đủ nước, nghỉ ngơi',
      ngayTaiKhamDuKien: '2026-11-24',
      capNhatLanCuoi: '2026-11-03 11:30:15',
    });
    const ratingId = await t.exam.rating(v.mine.lichHenId, {
      soSao: 4,
      nhanXet: 'Bác sĩ tận tình',
      thoiDiemTao: '2026-11-04 08:00:00',
    });
    // dữ liệu dựng ĐÚNG như thiết kế: khoá chính của dòng thật KHÁC lich_hen_id (nếu không, ca không còn thử được join sai khoá)
    expect(recordId).not.toBe(v.mine.lichHenId);
    expect(ratingId).not.toBe(v.mine.lichHenId);

    const doctorName = t.doctorName;
    const detail = await t.service.detail(t.w.patientId, v.mine.maLichHen);
    expect(detail).toEqual({
      maLichHen: v.mine.maLichHen,
      thoiGian: '2026-11-03T02:00:00.000Z',
      chuyenKhoa: await specialtyName(db, t.doctorId),
      chiNhanh: await branchName(db, t.w.branch.chiNhanhId),
      bacSi: { hoTen: doctorName, chucDanh: expect.any(String) },
      nguoiKham: {
        hoTen: 'Người thân mẫu',
        quanHe: await relationOf(t.w.relativeId),
      },
      hoSoKham: {
        trieuChung: 'Ho khan, sốt nhẹ hai ngày',
        chanDoanSoBo: 'Viêm họng cấp',
        huongXuLy: 'Uống đủ nước, nghỉ ngơi',
        ngayTaiKhamDuKien: '2026-11-24',
        capNhatLanCuoi: '2026-11-03T04:30:15.000Z',
        capNhatBoi: doctorName,
      },
      danhGia: {
        soSao: 4,
        nhanXet: 'Bác sĩ tận tình',
        thoiDiemTao: '2026-11-04T01:00:00.000Z',
      },
      coTheDanhGia: false,
    });
    expect(Object.keys(detail)).toHaveLength(9);
    expect(Object.keys(detail.hoSoKham ?? {})).toHaveLength(6);
    expect(Object.keys(detail.danhGia ?? {})).toHaveLength(3);
    expect(JSON.stringify(detail)).not.toContain('MỒI');
  });

  it('khám cho BẢN THÂN: tên là tên tài khoản Bệnh nhân (khác tên bác sĩ), quanHe null; capNhatBoi vẫn là tên BÁC SĨ', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    await t.exam.record(v.me.lichHenId);
    const detail = await t.service.detail(t.w.patientId, v.me.maLichHen);
    expect(t.patientName).not.toBe(t.doctorName);
    expect(detail.nguoiKham).toEqual({ hoTen: t.patientName, quanHe: null });
    expect(detail.hoSoKham?.capNhatBoi).toBe(t.doctorName);
    expect(detail.hoSoKham?.ngayTaiKhamDuKien).toBeNull();
  });

  it('chưa có hồ sơ và chưa đánh giá ⇒ cả hai null, coTheDanhGia true; có hồ sơ chưa đánh giá ⇒ hoSoKham đủ, danhGia null; chưa hồ sơ nhưng đã đánh giá ⇒ hoSoKham null, coTheDanhGia false', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      none: { at: '2026-11-01 08:00:00' },
      record: { at: '2026-11-02 08:00:00' },
      rated: { at: '2026-11-03 08:00:00' },
    });
    await t.exam.record(v.record.lichHenId);
    await t.exam.rating(v.rated.lichHenId, { soSao: 2 });
    const none = await t.service.detail(t.w.patientId, v.none.maLichHen);
    const record = await t.service.detail(t.w.patientId, v.record.maLichHen);
    const rated = await t.service.detail(t.w.patientId, v.rated.maLichHen);
    expect([none.hoSoKham, none.danhGia, none.coTheDanhGia]).toEqual([
      null,
      null,
      true,
    ]);
    expect(record.hoSoKham?.trieuChung).toBe('Ho khan, sốt nhẹ hai ngày');
    expect([record.danhGia, record.coTheDanhGia]).toEqual([null, true]);
    expect([rated.hoSoKham, rated.danhGia?.soSao, rated.coTheDanhGia]).toEqual([
      null,
      2,
      false,
    ]);
  });

  it('chi nhánh là SNAPSHOT của lịch: bác sĩ chuyển sang chi nhánh khác sau đó, chi nhánh trả về vẫn là chi nhánh LÚC ĐẶT', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    const original = await branchName(db, t.w.branch.chiNhanhId);
    const moved = await branchName(db, t.w.otherBranch.chiNhanhId);
    expect(moved).not.toBe(original);
    await db.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [t.w.otherBranch.chiNhanhId, t.doctorId],
    );
    const detail = await t.service.detail(t.w.patientId, v.me.maLichHen);
    expect(detail.chiNhanh).toBe(original);
  });
});

describe('XHS-07, QHK-05 mọi trường hợp "không thấy" ra CÙNG 404 KHONG_TIM_THAY (so cả thân)', () => {
  it('lịch của Bệnh nhân khác (kể cả lịch khám cho hồ sơ người thân của họ) và mã không tồn tại: 404 cùng thân; chính chủ vẫn đọc được lịch của mình', async () => {
    const t = await setup();
    const aRel = await fx.relative(t.w.patientId, {
      hoTen: 'Người thân của A',
    });
    const v = await seedVisits(db, fx, t.w, {
      a1: { at: '2026-11-02 09:00:00' },
      aRel: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: aRel },
      b1: { at: '2026-11-04 09:00:00', patientId: t.w.secondPatientId },
    });
    for (const lich of [v.a1, v.aRel])
      await expectNotFound(
        t.service.detail(t.w.secondPatientId, lich.maLichHen),
      );
    await expectNotFound(t.service.detail(t.w.patientId, v.b1.maLichHen));
    await expectNotFound(t.service.detail(t.w.patientId, 'CLX-20990101-ZZZZZ'));
    await expect(
      t.service.detail(t.w.patientId, v.a1.maLichHen),
    ).resolves.toMatchObject({ maLichHen: v.a1.maLichHen });
    await expect(
      t.service.detail(t.w.secondPatientId, v.b1.maLichHen),
    ).resolves.toMatchObject({ maLichHen: v.b1.maLichHen });
  });

  it('sáu trạng thái khác HoanThanh (ChoThanhToan, DaXacNhan, DaTiepDon, DaHuy, VangMat, DaDoiLich) ⇒ 404 cùng thân, dù lịch là của chính mình và đã có hồ sơ', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      hold: { state: 'ChoThanhToan' },
      confirmed: { state: 'DaXacNhan' },
      inVisit: { state: 'DaTiepDon' },
      cancelled: { state: 'DaHuy' },
      absent: { state: 'VangMat' },
      moved: { state: 'DaDoiLich' },
      done: { state: 'HoanThanh' },
    });
    for (const lich of Object.values(v)) await t.exam.record(lich.lichHenId);
    const { done, ...others } = v;
    for (const lich of Object.values(others))
      await expectNotFound(t.service.detail(t.w.patientId, lich.maLichHen));
    await expect(
      t.service.detail(t.w.patientId, done.maLichHen),
    ).resolves.toMatchObject({ maLichHen: done.maLichHen });
  });

  it('mã chữ thường nguyên văn vẫn khớp vì collation không phân biệt hoa thường: pipe là chỗ DUY NHẤT chuẩn hoá và chặn mã sai dạng (đặc tả M22), không phải DB', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    const lower = v.me.maLichHen.toLowerCase();
    await expect(t.service.detail(t.w.patientId, lower)).resolves.toMatchObject(
      { maLichHen: v.me.maLichHen },
    );
  });
});

describe('XHS-08 (phần chi tiết), Q18 hồ sơ người thân đã ngừng dùng vẫn xem được', () => {
  it('lịch khám cho hồ sơ người thân trang_thai_hieu_luc = false ⇒ 200 với tên và quan hệ của hồ sơ', async () => {
    const t = await setup();
    const stopped = await fx.relative(t.w.patientId, {
      active: false,
      hoTen: 'Người thân đã ngừng dùng',
    });
    const v = await seedVisits(db, fx, t.w, {
      old: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: stopped },
    });
    const detail = await t.service.detail(t.w.patientId, v.old.maLichHen);
    expect(detail.nguoiKham).toEqual({
      hoTen: 'Người thân đã ngừng dùng',
      quanHe: await relationOf(stopped),
    });
  });
});

describe('XHS-09 Bác sĩ ghi và sửa hồ sơ bằng ExamRecordService THẬT, Bệnh nhân đọc thấy ngay', () => {
  it('lần đầu: từ hoSoKham null thành có; sửa: thấy bản mới và capNhatLanCuoi mới (đồng hồ giả 09:00 giờ VN = 02:00Z)', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    const write = recordService(db);
    expect(
      (await t.service.detail(t.w.patientId, v.me.maLichHen)).hoSoKham,
    ).toBeNull();

    await write.save(
      t.doctorId,
      v.me.maLichHen,
      recordBody({
        trieuChung: 'V1 triệu chứng',
        ngayTaiKhamDuKien: '2026-12-01',
      }),
    );
    const first = await t.service.detail(t.w.patientId, v.me.maLichHen);
    expect(first.hoSoKham).toMatchObject({
      trieuChung: 'V1 triệu chứng',
      ngayTaiKhamDuKien: '2026-12-01',
      capNhatLanCuoi: '2026-11-10T02:00:00.000Z',
    });

    vi.setSystemTime(new Date('2026-11-10T15:30:00+07:00'));
    await write.save(
      t.doctorId,
      v.me.maLichHen,
      recordBody({
        trieuChung: 'V2 triệu chứng',
        ngayTaiKhamDuKien: null,
        capNhatLanCuoi: '2026-11-10T02:00:00.000Z',
      }),
    );
    const second = await t.service.detail(t.w.patientId, v.me.maLichHen);
    expect(second.hoSoKham).toMatchObject({
      trieuChung: 'V2 triệu chứng',
      ngayTaiKhamDuKien: null,
      capNhatLanCuoi: '2026-11-10T08:30:00.000Z',
    });
  });
});

describe('XHS-10, Q19 đánh giá bị ẩn vẫn hiện nguyên vẹn, không lộ lý do', () => {
  it('bi_an = 1 với lý do ẩn: danhGia đủ sao, nhận xét, thời điểm; coTheDanhGia false; không khoá cấm ở độ sâu nào; chuỗi lý do không xuất hiện', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      hidden: { at: '2026-11-05 08:00:00' },
    });
    await t.exam.record(v.hidden.lichHenId);
    await t.exam.rating(v.hidden.lichHenId, {
      soSao: 1,
      nhanXet: 'Nhận xét bị ẩn',
      biAn: true,
      lyDoAn: 'Nội dung vi phạm quy định',
      thoiDiemTao: '2026-11-06 08:00:00',
    });
    const detail = await t.service.detail(t.w.patientId, v.hidden.maLichHen);
    expect(detail.danhGia).toEqual({
      soSao: 1,
      nhanXet: 'Nhận xét bị ẩn',
      thoiDiemTao: '2026-11-06T01:00:00.000Z',
    });
    expect(detail.coTheDanhGia).toBe(false);
    const forbidden = new Set<string>(FORBIDDEN_DETAIL_KEYS);
    expect(keysDeep(detail).filter((key) => forbidden.has(key))).toEqual([]);
    expect(JSON.stringify(detail)).not.toContain('vi phạm');
  });
});

describe('XHS-14 cột chữ NULL và nhận xét NULL không lỗi', () => {
  it('ba cột chữ NULL ⇒ chuỗi rỗng, hoSoKham vẫn là đối tượng; ngày tái khám NULL ⇒ null; nhận xét NULL ⇒ nhanXet null', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      nulls: { at: '2026-11-05 08:00:00' },
    });
    await t.exam.record(v.nulls.lichHenId, {
      trieuChung: null,
      chanDoanSoBo: null,
      huongXuLy: null,
    });
    await t.exam.rating(v.nulls.lichHenId, { nhanXet: null });
    const detail = await t.service.detail(t.w.patientId, v.nulls.maLichHen);
    expect(detail.hoSoKham).toMatchObject({
      trieuChung: '',
      chanDoanSoBo: '',
      huongXuLy: '',
      ngayTaiKhamDuKien: null,
    });
    expect(detail.danhGia?.nhanXet).toBeNull();
    expect(detail.coTheDanhGia).toBe(false);
  });
});

describe('XHS-20 nội dung NGUYÊN VĂN khứ hồi qua DB', () => {
  it('HTML, emoji 4 byte, CRLF, khoảng trắng đầu cuối, dấu tiếng Việt: về y nguyên; 2.000 ký tự ba trường và 1.000 ký tự nhận xét không bị cắt', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      raw: { at: '2026-11-05 08:00:00' },
    });
    const tricky =
      '  <b>đậm</b> <script>alert(1)</script> 😷\r\nDòng hai\n\n  ';
    const long = 'ế'.repeat(2000);
    await t.exam.record(v.raw.lichHenId, {
      trieuChung: tricky,
      chanDoanSoBo: long,
      huongXuLy: `${tricky}${long}`.slice(0, 2000),
    });
    await t.exam.rating(v.raw.lichHenId, { nhanXet: 'ạ'.repeat(1000) });
    const detail = await t.service.detail(t.w.patientId, v.raw.maLichHen);
    expect(detail.hoSoKham?.trieuChung).toBe(tricky);
    expect(detail.hoSoKham?.chanDoanSoBo).toBe(long);
    expect(detail.hoSoKham?.huongXuLy).toBe(`${tricky}${long}`.slice(0, 2000));
    expect(detail.danhGia?.nhanXet).toBe('ạ'.repeat(1000));
  });
});

describe('XHS-19 chuỗi câu SQL thật: chỉ đọc, một giao dịch, một câu có chủ sở hữu', () => {
  async function statementsOf(t: Setup, code: string) {
    const seen = recordStatements(db);
    await failureOf(t.service.detail(t.w.patientId, code));
    return [...seen];
  }

  it('đúng MỘT SELECT, không ghi hay khoá, giao dịch READ ONLY và REPEATABLE READ bao câu đó; không dòng nào bị đổi', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    await t.exam.record(v.me.lichHenId);
    await t.exam.rating(v.me.lichHenId);
    const tables = ['lich_hen', 'ho_so_kham', 'danh_gia_bac_si', 'thong_bao'];
    const count = async () =>
      Promise.all(
        tables.map(async (table) => {
          const rows = await db.query<{ n: string }[]>(
            `SELECT COUNT(*) AS n FROM ${table}`,
          );
          return Number(rows[0]?.n);
        }),
      );
    const before = await count();
    const during = await statementsOf(t, v.me.maLichHen);
    const selects = during.filter((sql) => SELECT.test(sql));
    expect(selects).toHaveLength(1);
    expect(during.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    expect(selects[0]).toContain('lh.benh_nhan_id = ?');
    const at = (pattern: RegExp) =>
      during.findIndex((sql) => pattern.test(sql));
    const select = during.findIndex((sql) => SELECT.test(sql));
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeGreaterThanOrEqual(0);
    expect(at(/SET TRANSACTION READ ONLY/i)).toBeLessThan(select);
    expect(at(/REPEATABLE READ/i)).toBeLessThan(select);
    expect(at(/^\s*START TRANSACTION/i)).toBeLessThan(select);
    expect(at(/^\s*COMMIT/i)).toBeGreaterThan(select);
    expect(await count()).toEqual(before);
  });

  it('mã không có: vẫn đúng MỘT SELECT (không dò thêm), rồi giao dịch kết thúc (COMMIT) và kết nối được trả', async () => {
    const t = await setup();
    const during = await statementsOf(t, 'CLX-20990101-ZZZZZ');
    expect(during.filter((sql) => SELECT.test(sql))).toHaveLength(1);
    expect(
      during.findLastIndex((sql) => /^\s*COMMIT/i.test(sql)),
    ).toBeGreaterThan(during.findIndex((sql) => SELECT.test(sql)));
  });
});

describe('XHS-18 EXPLAIN câu SQL thật ở DB nhỏ (đo ≈ 100.000 lịch: spec đo tạm, TRACKING 18.8)', () => {
  it('lich_hen truy cập `const` qua chỉ mục UNIQUE của ma_lich_hen và không bảng nào quét toàn bộ (`ALL`)', async () => {
    const t = await setup();
    const v = await seedVisits(db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    await t.exam.record(v.me.lichHenId);
    await t.exam.rating(v.me.lichHenId);
    const captured: StatementCall[] = [];
    interceptStatements(db, (call, run) => {
      captured.push(call);
      return run();
    });
    await t.service.detail(t.w.patientId, v.me.maLichHen);
    const select = captured.find((call) => SELECT.test(call.sql));
    expect(select).toBeDefined();
    const plan = await db.query<
      { table: string; type: string; key: string | null }[]
    >(`EXPLAIN ${select?.sql ?? ''}`, select?.params);
    const lich = plan.find((row) => row.table === 'lh');
    expect(lich?.type).toBe('const');
    const keyColumns = await db.query<
      { Column_name: string; Non_unique: number }[]
    >('SHOW INDEX FROM lich_hen WHERE Key_name = ?', [lich?.key]);
    expect(
      keyColumns.map((row) => [row.Column_name, Number(row.Non_unique)]),
    ).toEqual([['ma_lich_hen', 0]]);
    expect(plan.filter((row) => row.type === 'ALL')).toEqual([]);
  });
});
