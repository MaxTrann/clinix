import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import { failureOf } from '../../appointments/testing/create-appointment-world.js';
import { assertBookingInvariants } from '../../appointments/testing/invariants.js';
import { recordStatements } from '../../appointments/testing/statement-recorder.js';
import {
  IN_WINDOW,
  WINDOW_END,
  WINDOW_START,
} from '../../appointments/testing/status-world.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import {
  CASH_PRICE,
  cashRows,
  cashWorld,
  stateOf,
  type CashWorld,
} from '../testing/cash-stack.js';

// payment B6 — thu tiền mặt tại quầy trên MySQL 8.4 THẬT với `checkIn` thật của booking (PLAN payment 5.7, E7, 7.x TTQ): TTQ-01…TTQ-05, TTQ-07…TTQ-09, TTQ-11, TTQ-13, TTQ-14, HDT-13, QTT-04 (phần dịch vụ).
// Đồng thời (TTQ-06 = DTT-11) và hoàn tác lặp (M3) ở `cash-payment.concurrency.int-spec.ts`; HTTP (TTQ-10, TTQ-12, QTT-04) ở `test/payment-cash.e2e-spec.ts`. Lịch ở khung giờ số 0 có giờ hẹn 08:00
// ngày 10/11/2026; cửa sổ tiếp đón 07:30 đến 08:15 (cấu hình của thế giới). Đồng hồ giả đặt ĐÚNG giờ hẹn trừ ca cửa sổ. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const world = async () => {
  vi.setSystemTime(IN_WINDOW);
  return cashWorld(db, fx);
};
const collect = (
  w: CashWorld,
  maLichHen: string,
  soTien: string,
  accountId = w.receptionId,
) => w.service.collect(accountId, maLichHen, soTien);
/** Sau mọi ca ghi hay từ chối: bất biến booking (INV-01…05) và sổ ví (IVT-01…07) */
const settled = async () => {
  await assertBookingInvariants(db);
  await assertWalletInvariants(db);
};

describe('đường thành công', () => {
  it('TTQ-01 ★ thu đủ trong khung giờ: một dòng TienMatTaiQuay ThanhCong, nguoi_thu_id = Lễ tân từ token, so_tien = còn phải thu, không ví, không mã cổng; lịch DaTiepDon; phiếu thu đủ khoá', async () => {
    const w = await world();
    const lich = await w.appointment(0);

    const result = await collect(w, lich.maLichHen, '300000');

    expect(result).toStrictEqual({
      maLichHen: lich.maLichHen,
      trangThai: 'DaTiepDon',
      phieuThu: {
        soPhieu: expect.stringMatching(/^\d+$/),
        giaKham: '300000.00',
        daThanhToanTruoc: '0.00',
        thuTaiQuay: '300000.00',
        thoiDiem: IN_WINDOW.toISOString(),
        nguoiThu: w.receptionist.account.hoTen,
      },
    });
    expect(await stateOf(db, lich.lichHenId)).toBe('DaTiepDon');
    const rows = await cashRows(db);
    expect(rows).toStrictEqual([
      {
        id: result.phieuThu.soPhieu,
        lichHenId: lich.lichHenId,
        soTien: '300000.00',
        nguoiThuId: w.receptionId,
        viNoiBoId: null,
        maCong: null,
        trangThai: 'ThanhCong',
        doiSoat: 'KhongCan',
      },
    ]);
    await settled();
  });

  it('TTQ-02 giá 300.000, đã cọc 100.000 qua ví ⇒ thu 200.000; phiếu ghi giá, đã thanh toán trước và số thu tại quầy do máy chủ tính', async () => {
    const w = await world();
    const lich = await w.appointment(0, { coc: '100000.00' });

    const result = await collect(w, lich.maLichHen, '200000');

    expect(result.phieuThu).toMatchObject({
      giaKham: '300000.00',
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
    expect((await cashRows(db)).map((r) => r.soTien)).toEqual(['200000.00']);
    await settled();
  });

  it('TTQ-13 lịch trong chuỗi đổi lịch: ghi lich_hen_id = lịch GỐC, còn phải thu tính theo cả chuỗi (cọc trả ở lịch gốc)', async () => {
    const w = await world();
    const root = await w.appointment(1, {
      trangThai: 'DaDoiLich',
      coc: '100000.00',
    });
    const leaf = await w.appointment(0);
    await db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [root.lichHenId, leaf.lichHenId],
    );

    const result = await collect(w, leaf.maLichHen, '200000');

    expect(result.phieuThu).toMatchObject({
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
    const rows = await cashRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lichHenId).toBe(root.lichHenId);
    expect(await stateOf(db, leaf.lichHenId)).toBe('DaTiepDon');
  });

  it('TTQ-14 không ghi nhật ký; payment KHÔNG tự thêm thong_bao; DMS-10 (notification B6, đường thu tiền mặt): `checkIn` của booking thêm đúng MỘT LichHenDaTiepDon cho Bác sĩ phụ trách (payment Q26, L18 đã chuyển cho booking)', async () => {
    const w = await world();
    const lich = await w.appointment(0);
    const count = async (table: string) =>
      Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
    const before = {
      log: await count('nhat_ky_hanh_dong'),
      notice: await count('thong_bao'),
    };

    await collect(w, lich.maLichHen, '300000');

    expect(await count('nhat_ky_hanh_dong')).toBe(before.log);
    expect(await count('thong_bao')).toBe(before.notice + 1);
    const added: { taiKhoanId: string; loai: string }[] = await db.query(
      "SELECT CAST(tai_khoan_id AS CHAR) AS taiKhoanId, loai_su_kien AS loai FROM thong_bao WHERE lich_hen_id = ? AND loai_su_kien = 'LichHenDaTiepDon'",
      [lich.lichHenId],
    );
    expect(added).toEqual([
      { taiKhoanId: w.doctor.account.taiKhoanId, loai: 'LichHenDaTiepDon' },
    ]);
  });

  it('HDT-13 trình tự câu SQL trong giao dịch: checkIn (khoá rồi UPDATE lich_hen) TRƯỚC INSERT giao_dich_thanh_toan', async () => {
    const w = await world();
    const lich = await w.appointment(0);
    const statements = recordStatements(db);

    await collect(w, lich.maLichHen, '300000');

    const update = statements.findIndex((sql) =>
      /^\s*UPDATE\s+lich_hen\b/i.test(sql),
    );
    const insert = statements.findIndex((sql) =>
      /^\s*INSERT\s+INTO\s+giao_dich_thanh_toan\b/i.test(sql),
    );
    expect(update).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(update);
    // Khoá lịch (FOR UPDATE) có trước cả hai
    const lock = statements.findIndex((sql) =>
      /FROM\s+lich_hen\b[\s\S]*FOR UPDATE/i.test(sql),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(update);
  });
});

describe('từ chối, không ghi gì', () => {
  it('TTQ-03 ★ lịch ngoài chi nhánh của Lễ tân ⇒ 404 CÙNG thân với lịch không tồn tại; kiểm TRƯỚC checkIn nên lịch giữ DaXacNhan, không giao dịch', async () => {
    const w = await world();
    const lich = await w.appointment(0);

    const outside = await failureOf(
      collect(w, lich.maLichHen, '300000', w.otherReceptionId),
    );
    const missing = await failureOf(collect(w, 'CLX-20261110-ZZZZZ', '300000'));

    expect(outside).toStrictEqual(missing);
    expect(outside.status).toBe(404);
    expect(outside.body.maLoi).toBe('KHONG_TIM_THAY');
    expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
    expect(await cashRows(db)).toEqual([]);
  });

  it('QTT-04 tài khoản Lễ tân NgungHoatDong (bị khoá) ⇒ 403 KHONG_DU_QUYEN; không ghi gì', async () => {
    const w = await world();
    const lich = await w.appointment(0);
    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const failure = await failureOf(collect(w, lich.maLichHen, '300000'));
    expect(failure.status).toBe(403);
    expect(failure.body.maLoi).toBe('KHONG_DU_QUYEN');
    expect(await cashRows(db)).toEqual([]);
  });

  it.each([
    ['sớm 1 giây', new Date(WINDOW_START.getTime() - 1000)],
    ['muộn 1 giây', new Date(WINDOW_END.getTime() + 1000)],
  ])(
    'TTQ-04 ngoài khung giờ (%s) ⇒ 409 NGOAI_KHUNG_GIO_TIEP_DON kèm tu, den; lịch giữ DaXacNhan; không giao dịch',
    async (_name, now) => {
      const w = await world();
      const lich = await w.appointment(0);
      vi.setSystemTime(now);

      const failure = await failureOf(collect(w, lich.maLichHen, '300000'));

      expect(failure.status).toBe(409);
      expect(failure.body).toMatchObject({
        maLoi: 'NGOAI_KHUNG_GIO_TIEP_DON',
        chiTiet: {
          tu: WINDOW_START.toISOString(),
          den: WINDOW_END.toISOString(),
        },
      });
      expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
      expect(await cashRows(db)).toEqual([]);
    },
  );

  it.each([
    ['đúng đầu cửa sổ', WINDOW_START],
    ['đúng cuối cửa sổ', WINDOW_END],
  ])('TTQ-04 biên: %s ⇒ thu được', async (_name, now) => {
    const w = await world();
    const lich = await w.appointment(0);
    vi.setSystemTime(now);
    await expect(collect(w, lich.maLichHen, '300000')).resolves.toMatchObject({
      trangThai: 'DaTiepDon',
    });
  });

  it.each(['DaTiepDon', 'DaHuy', 'VangMat'] as const)(
    'TTQ-05 lịch %s ⇒ 409 LICH_HEN_KHONG_CHO_THU_TIEN kèm trạng thái; không ghi',
    async (trangThai) => {
      const w = await world();
      const lich = await w.appointment(0, { trangThai });

      const failure = await failureOf(collect(w, lich.maLichHen, '300000'));

      expect(failure.status).toBe(409);
      expect(failure.body).toMatchObject({
        maLoi: 'LICH_HEN_KHONG_CHO_THU_TIEN',
        thongBao: 'Lịch hẹn không còn ở trạng thái đã xác nhận.',
        chiTiet: { trangThai },
      });
      expect(await cashRows(db)).toEqual([]);
    },
  );

  it('TTQ-07 ★ soTien ≠ còn phải thu ⇒ 409 SO_TIEN_KHONG_KHOP kèm conPhaiThu; HOÀN TÁC cả checkIn (lịch vẫn DaXacNhan); không giao dịch; nhỏ hơn hay lớn hơn đều bị từ chối', async () => {
    const w = await world();
    const lich = await w.appointment(0, { coc: '100000.00' });

    for (const sai of ['199999', '200001', '300000']) {
      const failure = await failureOf(collect(w, lich.maLichHen, sai));
      expect(failure.status).toBe(409);
      expect(failure.body).toMatchObject({
        maLoi: 'SO_TIEN_KHONG_KHOP',
        chiTiet: { conPhaiThu: '200000.00' },
      });
    }
    expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
    expect(await cashRows(db)).toEqual([]);
    await settled();
  });

  it('TTQ-08 còn phải thu 0 (đã trả đủ bằng ví) ⇒ 409 KHONG_CON_PHAI_THU; lịch vẫn DaXacNhan; không ghi dòng so_tien = 0', async () => {
    const w = await world();
    const lich = await w.appointment(0, { gia: '100000.00', coc: '100000.00' });

    const failure = await failureOf(collect(w, lich.maLichHen, '0'));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHONG_CON_PHAI_THU');
    expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
    expect(await cashRows(db)).toEqual([]);
  });

  it('TTQ-09 chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH; không ghi', async () => {
    const w = await world();
    const lich = await w.appointment(0);
    await db.query('DELETE FROM cau_hinh_he_thong');

    const failure = await failureOf(collect(w, lich.maLichHen, '300000'));

    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
    expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
    expect(await cashRows(db)).toEqual([]);
  });
});

describe('payment F4 — bản xem trước của hộp thu tiền (GET cash-preview), chỉ đọc', () => {
  const preview = (
    w: CashWorld,
    maLichHen: string,
    accountId = w.receptionId,
  ) => w.service.preview(accountId, maLichHen);

  it('TTQ-16 ★ ba số do máy chủ tính: giá 300.000, đã cọc 100.000 qua ví ⇒ đã thanh toán trước 100.000, thu tại quầy 200.000; không ghi gì, lịch giữ DaXacNhan', async () => {
    const w = await world();
    const lich = await w.appointment(0, { coc: '100000.00' });

    expect(await preview(w, lich.maLichHen)).toStrictEqual({
      maLichHen: lich.maLichHen,
      giaKham: '300000.00',
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
    expect(await stateOf(db, lich.lichHenId)).toBe('DaXacNhan');
    expect(await cashRows(db)).toEqual([]);
    // Số xem trước đúng là số `collect` nhận
    await expect(collect(w, lich.maLichHen, '200000')).resolves.toMatchObject({
      trangThai: 'DaTiepDon',
    });
  });

  it('TTQ-16 chưa cọc ⇒ đã thanh toán trước 0, thu tại quầy = giá; lịch trong chuỗi đổi lịch tính theo cả chuỗi (cọc ở lịch gốc)', async () => {
    const w = await world();
    const plain = await w.appointment(2);
    expect(await preview(w, plain.maLichHen)).toMatchObject({
      daThanhToanTruoc: '0.00',
      thuTaiQuay: '300000.00',
    });

    const root = await w.appointment(1, {
      trangThai: 'DaDoiLich',
      coc: '100000.00',
    });
    const leaf = await w.appointment(0);
    await db.query(
      'UPDATE lich_hen SET lich_hen_truoc_id = ? WHERE lich_hen_id = ?',
      [root.lichHenId, leaf.lichHenId],
    );
    expect(await preview(w, leaf.maLichHen)).toMatchObject({
      giaKham: '300000.00',
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
  });

  it('TTQ-16 không kiểm cửa sổ tiếp đón (collect kiểm dưới khoá): ngoài khung giờ vẫn xem được', async () => {
    const w = await world();
    const lich = await w.appointment(0);
    vi.setSystemTime(new Date(WINDOW_END.getTime() + 60_000));
    await expect(preview(w, lich.maLichHen)).resolves.toMatchObject({
      thuTaiQuay: '300000.00',
    });
  });

  it('TTQ-17 ★ lịch ngoài chi nhánh của Lễ tân ⇒ 404 CÙNG thân với lịch không tồn tại; Lễ tân bị khoá ⇒ 403 KHONG_DU_QUYEN', async () => {
    const w = await world();
    const lich = await w.appointment(0);

    const outside = await failureOf(
      preview(w, lich.maLichHen, w.otherReceptionId),
    );
    const missing = await failureOf(preview(w, 'CLX-20261110-ZZZZZ'));
    expect(outside).toStrictEqual(missing);
    expect(outside.status).toBe(404);
    expect(outside.body.maLoi).toBe('KHONG_TIM_THAY');

    await db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const locked = await failureOf(preview(w, lich.maLichHen));
    expect(locked.status).toBe(403);
    expect(locked.body.maLoi).toBe('KHONG_DU_QUYEN');
  });

  it.each(['DaTiepDon', 'DaHuy', 'VangMat'] as const)(
    'TTQ-18 lịch %s ⇒ 409 LICH_HEN_KHONG_CHO_THU_TIEN kèm trạng thái (cùng mã với collect)',
    async (trangThai) => {
      const w = await world();
      const lich = await w.appointment(0, { trangThai });
      const failure = await failureOf(preview(w, lich.maLichHen));
      expect(failure.status).toBe(409);
      expect(failure.body).toMatchObject({
        maLoi: 'LICH_HEN_KHONG_CHO_THU_TIEN',
        chiTiet: { trangThai },
      });
    },
  );

  it('TTQ-18 đã trả đủ bằng ví (còn phải thu 0) ⇒ 409 KHONG_CON_PHAI_THU', async () => {
    const w = await world();
    const lich = await w.appointment(0, { gia: '100000.00', coc: '100000.00' });
    const failure = await failureOf(preview(w, lich.maLichHen));
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('KHONG_CON_PHAI_THU');
  });
});

describe('TTQ-11 lưới thứ hai ở DB (CHECK chk_gd_tien_mat_nguoi_thu, khoá ngoại nguoi_thu_id → le_tan)', () => {
  it.each([
    ['thiếu nguoi_thu_id', { nguoiThu: null, soTien: '1000.00', cong: null }],
    [
      'có ma_giao_dich_cong',
      { nguoiThu: 'LE_TAN', soTien: '1000.00', cong: 'MA-CONG-1' },
    ],
    ['so_tien = 0', { nguoiThu: 'LE_TAN', soTien: '0.00', cong: null }],
    [
      'nguoi_thu_id không phải Lễ tân',
      { nguoiThu: 'BENH_NHAN', soTien: '1000.00', cong: null },
    ],
  ])('INSERT trực tiếp %s ⇒ DB từ chối', async (_name, input) => {
    const w = await world();
    const lich = await w.appointment(0);
    const nguoiThu =
      input.nguoiThu === 'LE_TAN'
        ? w.receptionId
        : input.nguoiThu === 'BENH_NHAN'
          ? w.patientId
          : null;
    await expect(
      db.query(
        `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, trang_thai_doi_soat, nguoi_thu_id, thoi_diem_tao)
         VALUES (NULL, ?, 'ThanhToanLichHen', 'TienMatTaiQuay', ?, 'ThanhCong', ?, 'KhongCan', ?, ?)`,
        [lich.lichHenId, input.soTien, input.cong, nguoiThu, IN_WINDOW],
      ),
    ).rejects.toThrow();
    expect(await cashRows(db)).toEqual([]);
    // Đối chứng: đúng mọi điều kiện thì DB nhận (nên các ca trên đỏ vì đúng điều kiện bị vi phạm)
    await db.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, trang_thai_doi_soat, nguoi_thu_id, thoi_diem_tao)
       VALUES (NULL, ?, 'ThanhToanLichHen', 'TienMatTaiQuay', 1000.00, 'ThanhCong', 'KhongCan', ?, ?)`,
      [lich.lichHenId, w.receptionId, IN_WINDOW],
    );
    expect(await cashRows(db)).toHaveLength(1);
  });

  it('giá trị minh hoạ của thế giới là 300.000', () => {
    expect(CASH_PRICE).toBe('300000.00');
  });
});
