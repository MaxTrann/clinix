import { QueryFailedError, type DataSource } from 'typeorm';
import { AdminFixtures } from '../../admin/testing/admin-fixtures.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { GiaoDichThanhToan } from '../../payment/entities/giao-dich-thanh-toan.entity.js';
import { GiaoDichVi } from './giao-dich-vi.entity.js';
import { LichSuHoanTien } from './lich-su-hoan-tien.entity.js';

// payment P1 (#441) — năm bảng tiền trên MySQL 8.4 THẬT: CHECK, UNIQUE, khóa ngoại và kiểu dữ liệu của entity (MGT-03…MGT-09, MGT-12).
// MGT-01, MGT-14, MGT-15 (up/down) ở database/migrations.int-spec.ts, MGT-02 (chữ DDL) ở database/migration-source.spec.ts,
// MGT-02 (SHOW CREATE TABLE) ở database/schema-parity.int-spec.ts, MGT-10 ở audit/test/audit-enum-parity.int-spec.ts, MGT-11 ở database/registry.spec.ts.
let db: DataSource;
let fx: AdminFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new AdminFixtures(d);
});

const AT = '2026-11-02 09:00:00';
const CHECK_VIOLATED = 3819; // ER_CHECK_CONSTRAINT_VIOLATED
const DUPLICATE_ENTRY = 1062; // ER_DUP_ENTRY
const FOREIGN_KEY_FAILED = 1452; // ER_NO_REFERENCED_ROW_2

/** Câu lệnh phải bị MySQL từ chối; trả mã lỗi (câu chạy thành công làm test đỏ). */
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

interface World {
  walletId: string;
  appointmentId: string;
  receptionistId: string;
  adminId: string;
}

async function world(): Promise<World> {
  const branch = await fx.branch();
  const doctor = await fx.doctor(branch);
  const patient = await fx.patient();
  const slot = await fx.slot(await fx.shift(doctor.profile));
  const appointment = await fx.appointment(
    doctor.profile,
    slot,
    patient.account.taiKhoanId,
  );
  const receptionist = await fx.receptionist(branch);
  const admin = await fx.admin();
  return {
    walletId: patient.wallet.viNoiBoId,
    appointmentId: appointment.lichHenId,
    receptionistId: receptionist.account.taiKhoanId,
    adminId: admin.account.taiKhoanId,
  };
}

interface PaymentRow {
  viNoiBoId: string | null;
  lichHenId: string | null;
  loai: 'NapVi' | 'ThanhToanLichHen';
  phuongThuc: 'Vi' | 'VNPay' | 'MoMo' | 'TienMatTaiQuay';
  soTien: string;
  trangThai: string;
  maGiaoDichCong: string | null;
  nguoiThuId: string | null;
}

const insertPayment = async (row: PaymentRow): Promise<string> => {
  const result = (await db.query(
    `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, nguoi_thu_id, thoi_diem_tao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.viNoiBoId,
      row.lichHenId,
      row.loai,
      row.phuongThuc,
      row.soTien,
      row.trangThai,
      row.maGiaoDichCong,
      row.nguoiThuId,
      AT,
    ],
  )) as { insertId: number };
  return String(result.insertId);
};

/** Giao dịch nạp ví hợp lệ, ghi đè từng phần để dựng ca sai. */
const napVi = (w: World, over: Partial<PaymentRow> = {}): PaymentRow => ({
  viNoiBoId: w.walletId,
  lichHenId: null,
  loai: 'NapVi',
  phuongThuc: 'VNPay',
  soTien: '100000.00',
  trangThai: 'DangXuLy',
  maGiaoDichCong: null,
  nguoiThuId: null,
  ...over,
});

/** Thu tiền mặt tại quầy hợp lệ. */
const tienMat = (w: World, over: Partial<PaymentRow> = {}): PaymentRow => ({
  viNoiBoId: null,
  lichHenId: w.appointmentId,
  loai: 'ThanhToanLichHen',
  phuongThuc: 'TienMatTaiQuay',
  soTien: '100000.00',
  trangThai: 'ThanhCong',
  maGiaoDichCong: null,
  nguoiThuId: w.receptionistId,
  ...over,
});

describe('năm bảng tiền trên MySQL thật', () => {
  it('MGT-03: chk_vi_so_du chặn so_tien_dang_giu > so_du (3819); bằng đúng so_du là hợp lệ (biên); âm bị chặn', async () => {
    const w = await world();
    await db.query(
      'UPDATE vi_noi_bo SET so_du = 100000, so_tien_dang_giu = 100000 WHERE vi_noi_bo_id = ?',
      [w.walletId],
    );
    expect(
      await errnoOf(
        db.query(
          'UPDATE vi_noi_bo SET so_tien_dang_giu = 100000.01 WHERE vi_noi_bo_id = ?',
          [w.walletId],
        ),
      ),
    ).toBe(CHECK_VIOLATED);
    expect(
      await errnoOf(
        db.query('UPDATE vi_noi_bo SET so_du = -1 WHERE vi_noi_bo_id = ?', [
          w.walletId,
        ]),
      ),
    ).toBe(CHECK_VIOLATED);
  });

  it('MGT-04: chk_gd_thanh_toan_loai — NapVi cần ví và không lịch; ThanhToanLichHen cần lịch; hai dạng hợp lệ nhận được', async () => {
    const w = await world();
    const bad: Partial<PaymentRow>[] = [
      { lichHenId: w.appointmentId }, // NapVi có lịch
      { viNoiBoId: null }, // NapVi không ví
    ];
    for (const over of bad) {
      expect(await errnoOf(insertPayment(napVi(w, over)))).toBe(CHECK_VIOLATED);
    }
    expect(
      await errnoOf(
        insertPayment(
          napVi(w, {
            loai: 'ThanhToanLichHen',
            phuongThuc: 'Vi',
            lichHenId: null,
          }),
        ),
      ),
    ).toBe(CHECK_VIOLATED); // ThanhToanLichHen không lịch
    await insertPayment(napVi(w));
    await insertPayment(
      napVi(w, {
        loai: 'ThanhToanLichHen',
        phuongThuc: 'Vi',
        lichHenId: w.appointmentId,
        trangThai: 'ThanhCong',
      }),
    );
  });

  it('MGT-05: chk_gd_tien_mat_nguoi_thu — sáu kiểu vi phạm của tiền mặt và người thu ở phương thức khác đều bị chặn; dòng đúng nhận được; người thu phải là Lễ tân (khóa ngoại)', async () => {
    const w = await world();
    const bad: [string, Partial<PaymentRow>][] = [
      ['không có người thu', { nguoiThuId: null }],
      ['có ví', { viNoiBoId: w.walletId }],
      ['có mã cổng', { maGiaoDichCong: 'TM-1' }],
      ['số tiền 0', { soTien: '0.00' }],
      ['trạng thái chưa ThanhCong', { trangThai: 'DangXuLy' }],
      ['không gắn lịch', { lichHenId: null }],
    ];
    for (const [label, over] of bad) {
      expect(await errnoOf(insertPayment(tienMat(w, over))), label).toBe(
        CHECK_VIOLATED,
      );
    }
    // phương thức khác mà có người thu
    expect(
      await errnoOf(insertPayment(napVi(w, { nguoiThuId: w.receptionistId }))),
    ).toBe(CHECK_VIOLATED);
    // người thu không phải Lễ tân: khóa ngoại sang le_tan chặn (quản trị viên)
    expect(
      await errnoOf(insertPayment(tienMat(w, { nguoiThuId: w.adminId }))),
    ).toBe(FOREIGN_KEY_FAILED);
    await insertPayment(tienMat(w));
  });

  it('MGT-06: chk_gd_vi_tham_chieu (đúng một nguồn theo loại) và chk_gd_vi_dau_so_tien (Nap/HoanTien dương, ThanhToan/Rut âm; 0 bị chặn)', async () => {
    const w = await world();
    const payment = await insertPayment(napVi(w));
    const request = String(
      (
        (await db.query(
          "INSERT INTO yeu_cau_rut_tien (vi_noi_bo_id, so_tien, trang_thai, thoi_diem_yeu_cau) VALUES (?, 50000, 'ChoDuyet', ?)",
          [w.walletId, AT],
        )) as { insertId: number }
      ).insertId,
    );
    const refund = String(
      (
        (await db.query(
          "INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, so_tien, trang_thai, thoi_diem) VALUES (?, ?, 50000, 'ThanhCong', ?)",
          [payment, w.walletId, AT],
        )) as { insertId: number }
      ).insertId,
    );
    type Refs = [string | null, string | null, string | null]; // [giao dịch thanh toán, lịch sử hoàn, yêu cầu rút]
    const insertLedger = (loai: string, soTien: string, refs: Refs) =>
      db.query(
        `INSERT INTO giao_dich_vi (vi_noi_bo_id, loai, so_tien, so_du_sau, giao_dich_thanh_toan_id, lich_su_hoan_tien_id, yeu_cau_rut_tien_id, thoi_diem)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [w.walletId, loai, soTien, ...refs, AT],
      );
    // tham chiếu sai (dấu đúng): thiếu nguồn, hai nguồn, nguồn của loại khác
    const wrongRefs: [string, string, Refs][] = [
      ['Nap', '100', [null, null, null]],
      ['Nap', '100', [payment, refund, null]],
      ['HoanTien', '100', [payment, null, null]],
      ['Rut', '-100', [payment, null, null]],
      ['ThanhToan', '-100', [null, null, request]],
    ];
    for (const [loai, soTien, refs] of wrongRefs) {
      expect(await errnoOf(insertLedger(loai, soTien, refs)), loai).toBe(
        CHECK_VIOLATED,
      );
    }
    // dấu sai (nguồn đúng loại), kể cả số 0
    const wrongSigns: [string, string, Refs][] = [
      ['Nap', '-100', [payment, null, null]],
      ['Nap', '0', [payment, null, null]],
      ['ThanhToan', '100', [payment, null, null]],
      ['HoanTien', '-1', [null, refund, null]],
      ['Rut', '100', [null, null, request]],
    ];
    for (const [loai, soTien, refs] of wrongSigns) {
      expect(
        await errnoOf(insertLedger(loai, soTien, refs)),
        `${loai} ${soTien}`,
      ).toBe(CHECK_VIOLATED);
    }
    // bốn dòng đúng
    await insertLedger('Nap', '100000', [payment, null, null]);
    await insertLedger('ThanhToan', '-100000', [payment, null, null]);
    await insertLedger('HoanTien', '50000', [null, refund, null]);
    await insertLedger('Rut', '-50000', [null, null, request]);
  });

  it('MGT-07: chk_rut_tien_xu_ly — ChoDuyet không có người và thời điểm xử lý; DaDuyet và TuChoi phải có cả hai; thiếu một trong hai bị chặn', async () => {
    const w = await world();
    const insertRequest = (
      trangThai: string,
      nguoi: string | null,
      luc: string | null,
    ) =>
      db.query(
        'INSERT INTO yeu_cau_rut_tien (vi_noi_bo_id, so_tien, trang_thai, nguoi_xu_ly_id, thoi_diem_yeu_cau, thoi_diem_xu_ly) VALUES (?, 50000, ?, ?, ?, ?)',
        [w.walletId, trangThai, nguoi, AT, luc],
      );
    expect(await errnoOf(insertRequest('ChoDuyet', w.adminId, null))).toBe(
      CHECK_VIOLATED,
    );
    expect(await errnoOf(insertRequest('ChoDuyet', null, AT))).toBe(
      CHECK_VIOLATED,
    );
    expect(await errnoOf(insertRequest('DaDuyet', null, null))).toBe(
      CHECK_VIOLATED,
    );
    expect(await errnoOf(insertRequest('DaDuyet', w.adminId, null))).toBe(
      CHECK_VIOLATED,
    );
    expect(await errnoOf(insertRequest('TuChoi', null, AT))).toBe(
      CHECK_VIOLATED,
    );
    await insertRequest('ChoDuyet', null, null);
    await insertRequest('DaDuyet', w.adminId, AT);
    await insertRequest('TuChoi', w.adminId, AT);
  });

  it('MGT-08: UNIQUE (phuong_thuc, ma_giao_dich_cong) — nhiều dòng NULL được; trùng cùng phương thức ⇒ 1062; cùng mã ở phương thức khác được', async () => {
    const w = await world();
    await insertPayment(napVi(w));
    await insertPayment(napVi(w)); // hai dòng chưa có mã cổng
    await insertPayment(napVi(w, { maGiaoDichCong: 'GD-1' }));
    expect(
      await errnoOf(insertPayment(napVi(w, { maGiaoDichCong: 'GD-1' }))),
    ).toBe(DUPLICATE_ENTRY);
    await insertPayment(
      napVi(w, { phuongThuc: 'MoMo', maGiaoDichCong: 'GD-1' }),
    );
  });

  it('MGT-09: UNIQUE (giao_dich_thanh_toan_id, so_lan_thu) ở lich_su_hoan_tien và lan_doi_soat_nap_vi; lần thử khác nhau hoặc giao dịch khác được; mặc định loai = TuDong và so_lan_thu = 1', async () => {
    const w = await world();
    const first = await insertPayment(napVi(w));
    const second = await insertPayment(napVi(w));
    const refund = (gd: string, lan: number | null) =>
      lan === null
        ? db.query(
            "INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, so_tien, trang_thai, thoi_diem) VALUES (?, ?, 1000, 'ThatBai', ?)",
            [gd, w.walletId, AT],
          )
        : db.query(
            "INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, so_tien, trang_thai, so_lan_thu, thoi_diem) VALUES (?, ?, 1000, 'ThatBai', ?, ?)",
            [gd, w.walletId, lan, AT],
          );
    await refund(first, null); // lần mặc định = 1
    expect(await errnoOf(refund(first, 1))).toBe(DUPLICATE_ENTRY);
    await refund(first, 2);
    await refund(second, 1);
    const rows = (await db.query(
      'SELECT loai, so_lan_thu AS lan FROM lich_su_hoan_tien ORDER BY lich_su_hoan_tien_id LIMIT 1',
    )) as { loai: string; lan: number }[];
    expect(rows[0]).toEqual({ loai: 'TuDong', lan: 1 });

    const reconcile = (gd: string, lan: number) =>
      db.query(
        "INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, thoi_diem) VALUES (?, ?, 'ThatBai', ?)",
        [gd, lan, AT],
      );
    await reconcile(first, 0);
    expect(await errnoOf(reconcile(first, 0))).toBe(DUPLICATE_ENTRY);
    await reconcile(first, 1);
    await reconcile(second, 0);
    // khóa ngoại: giao dịch không tồn tại và người xử lý không phải quản trị viên bị từ chối
    expect(await errnoOf(reconcile('999999', 0))).toBe(FOREIGN_KEY_FAILED);
    expect(
      await errnoOf(
        db.query(
          "INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, nguoi_xu_ly_id, thoi_diem) VALUES (?, 9, 'KhongTheXuLy', ?, ?)",
          [first, w.receptionistId, AT],
        ),
      ),
    ).toBe(FOREIGN_KEY_FAILED);
    await db.query(
      "INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, nguoi_xu_ly_id, ly_do, thoi_diem) VALUES (?, 9, 'KhongTheXuLy', ?, 'Không đủ thông tin', ?)",
      [first, w.adminId, AT],
    );
  });

  it('MGT-12: entity — decimal và BIGINT trả CHUỖI, số tiền âm của sổ ví giữ dấu và hai chữ số lẻ, enum và mặc định đúng', async () => {
    const w = await world();
    const payments = db.getRepository(GiaoDichThanhToan);
    const saved = await payments.save(
      payments.create({
        viNoiBoId: w.walletId,
        loai: 'NapVi',
        phuongThuc: 'VNPay',
        soTien: '123456.50',
        thoiDiemTao: new Date('2026-11-02T09:00:00+07:00'),
      }),
    );
    const found = await payments.findOneByOrFail({
      giaoDichThanhToanId: saved.giaoDichThanhToanId,
    });
    expect(typeof found.giaoDichThanhToanId).toBe('string');
    expect(found.soTien).toBe('123456.50');
    expect(typeof found.soTien).toBe('string');
    expect(found.trangThai).toBe('KhoiTao');
    expect(found.trangThaiDoiSoat).toBe('KhongCan');
    expect(found.maGiaoDichCong).toBeNull();
    expect(found.nguoiThuId).toBeNull();
    expect(found.lichHenId).toBeNull();

    const refunds = db.getRepository(LichSuHoanTien);
    const refund = await refunds.save(
      refunds.create({
        giaoDichThanhToanId: found.giaoDichThanhToanId,
        viNoiBoId: w.walletId,
        soTien: '50000.00',
        trangThai: 'ThanhCong',
        thoiDiem: new Date('2026-11-02T09:00:00+07:00'),
      }),
    );
    const refundFound = await refunds.findOneByOrFail({
      lichSuHoanTienId: refund.lichSuHoanTienId,
    });
    expect(refundFound.loai).toBe('TuDong');
    expect(refundFound.soLanThu).toBe(1);
    expect(refundFound.soTien).toBe('50000.00');

    const ledger = db.getRepository(GiaoDichVi);
    const entry = await ledger.save(
      ledger.create({
        viNoiBoId: w.walletId,
        loai: 'ThanhToan',
        soTien: '-100000.00',
        soDuSau: '0.00',
        giaoDichThanhToanId: found.giaoDichThanhToanId,
        thoiDiem: new Date('2026-11-02T09:00:00+07:00'),
      }),
    );
    const entryFound = await ledger.findOneByOrFail({
      giaoDichViId: entry.giaoDichViId,
    });
    expect(entryFound.soTien).toBe('-100000.00');
    expect(entryFound.soDuSau).toBe('0.00');
    expect(typeof entryFound.giaoDichViId).toBe('string');
    expect(entryFound.lichSuHoanTienId).toBeNull();
  });
});
