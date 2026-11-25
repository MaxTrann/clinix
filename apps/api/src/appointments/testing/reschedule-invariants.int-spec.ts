import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { isDuplicateKeyError } from '../../database/mysql-errors.js';
import { MAX_CHAIN_DEPTH } from '../../payment/ports/payment-chain.js';
import { PaymentFixtures } from '../../payment/testing/payment-fixtures.js';
import { BookingFixtures } from './booking-fixtures.js';
import {
  CHILD_COPIED_COLUMNS,
  assertRescheduleInvariants,
  captureMoneyTotals,
  checkChainHasOneLeaf,
  checkChildMatchesParent,
  checkMoneyUnchanged,
  checkReplacedHasOneChild,
  type Violation,
} from './invariants.js';
import { buildRescheduleChain } from './reschedule-world.js';

// reschedule B1 — INV-7, INV-8, INV-9, INV-10 (PLAN reschedule 5.3, 7.9) trên MySQL 8.4 THẬT, nếp `invariants.int-spec.ts`: mỗi bất biến kiểm HAI chiều, dữ liệu sạch ⇒ rỗng, gài lỗi có chủ đích ⇒ bị bắt ĐÚNG hàng
// (lỗi gài bằng `UPDATE` thẳng vì DB không ép các bất biến này, trừ UNIQUE của `lich_hen_truoc_id`). INV-1 đến INV-6 ở `invariants.int-spec.ts` và KHÔNG gộp với các hàm ở đây (xem đầu `invariants.ts`).
let db: DataSource;
let fx: BookingFixtures;
let payments: PaymentFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
  payments = new PaymentFixtures(d, fx);
});

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const doctor = w.doctor.profile;
  return {
    ...w,
    patientId,
    doctor,
    /** Chuỗi `length` lịch trên khung giờ thứ `slot` (các lịch DaDoiLich dùng chung khung giờ được) */
    chain: (length: number, slot = 0) =>
      buildRescheduleChain(db, fx, {
        doctor,
        patientId,
        khungGioId: w.slotIds[slot]!,
        length,
      }),
    appt: (
      trangThai: Parameters<BookingFixtures['appointmentIn']>[0],
      slot: number,
    ) =>
      fx.appointmentIn(trangThai, {
        doctor,
        khungGioId: w.slotIds[slot]!,
        patientId,
      }),
  };
}

/** Tám cột lịch con PHẢI bằng lịch cha (PLAN reschedule 5.3, INV-8), viết riêng ở đây để bắt đột biến bỏ cột khỏi `CHILD_COPIED_COLUMNS`. */
const EIGHT_COLUMNS = [
  'benh_nhan_id',
  'ho_so_nguoi_than_id',
  'bac_si_id',
  'chi_nhanh_id',
  'dich_vu_kham_id',
  'gia_snapshot',
  'tien_coc_snapshot',
  'chinh_sach_hoan_snapshot',
] as const;

const ids = (violations: Violation[], key: string) =>
  violations.map((violation) => String(violation[key]));

/** `lich_hen_truoc_id` ĐỌC TỪ DB (thực thể trả về từ `buildRescheduleChain` được tạo TRƯỚC khi nối chuỗi nên không có giá trị này). */
async function parentOf(lichHenId: string): Promise<string> {
  const rows: { truoc: string | null }[] = await db.query(
    'SELECT CAST(lich_hen_truoc_id AS CHAR) AS truoc FROM lich_hen WHERE lich_hen_id = ?',
    [lichHenId],
  );
  const parent = rows[0]?.truoc;
  if (parent === null || parent === undefined)
    throw new Error(`lịch ${lichHenId} không có lịch cũ`);
  return parent;
}

describe('INV-7 lịch DaDoiLich ⇔ đúng một lịch con; lịch có lich_hen_truoc_id thì cha là DaDoiLich', () => {
  it.each([1, 2, 5])('sạch ⇒ rỗng: chuỗi %i lịch', async (length) => {
    const w = await world();
    await w.chain(length);

    expect(await checkReplacedHasOneChild(db)).toEqual([]);
  });

  it('DaDoiLich KHÔNG có lịch con ⇒ bắt đúng lịch đó (loi DaDoiLichKhongCoDungMotCon, soCon 0)', async () => {
    const w = await world();
    const orphan = await w.appt('DaDoiLich', 0);
    await w.chain(2, 1);

    expect(await checkReplacedHasOneChild(db)).toEqual([
      {
        loi: 'DaDoiLichKhongCoDungMotCon',
        lichHenId: orphan.lichHenId,
        soCon: 0,
      },
    ]);
  });

  it('lịch con mà cha KHÔNG phải DaDoiLich ⇒ bắt lịch CON, kèm trạng thái của cha', async () => {
    const w = await world();
    const parent = await w.appt('DaXacNhan', 0);
    const child = await w.appt('DaXacNhan', 1);
    await payments.linkPrevious(child.lichHenId, parent.lichHenId);

    expect(await checkReplacedHasOneChild(db)).toEqual([
      {
        loi: 'ChaKhongPhaiDaDoiLich',
        lichHenId: child.lichHenId,
        trangThaiCha: 'DaXacNhan',
      },
    ]);
  });

  it('DB ép nửa "đúng một" bằng UNIQUE: lịch cha không thể có HAI con (1062), nên vế sai duy nhất của DaDoiLich là không có con', async () => {
    const w = await world();
    const last = await w.chain(2);
    const parentId = await parentOf(last.lichHenId);
    const other = await w.appt('DaXacNhan', 3);

    const error = await payments
      .linkPrevious(other.lichHenId, parentId)
      .catch((e: unknown) => e);

    expect(isDuplicateKeyError(error)).toBe(true);
  });
});

describe('INV-8 lịch con cùng cha về 8 cột và bộ đếm bằng cha hoặc cha + 1', () => {
  it('sạch ⇒ rỗng: chuỗi do fixture dựng (bộ đếm 0, ba bản chụp mặc định)', async () => {
    const w = await world();
    await w.chain(4);

    expect(await checkChildMatchesParent(db)).toEqual([]);
  });

  it('bộ đếm của con = cha và = cha + 1 đều hợp lệ (đổi hộ, tự đổi)', async () => {
    const w = await world();
    const [parent, equal, plusOne] = await Promise.all([
      w.appt('DaDoiLich', 0),
      w.appt('DaDoiLich', 1),
      w.appt('DaXacNhan', 2),
    ]);
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 2 WHERE lich_hen_id = ?',
      [parent.lichHenId],
    );
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 2 WHERE lich_hen_id = ?',
      [equal.lichHenId],
    );
    await db.query(
      'UPDATE lich_hen SET so_lan_tu_doi_lich = 3 WHERE lich_hen_id = ?',
      [plusOne.lichHenId],
    );
    await payments.linkPrevious(equal.lichHenId, parent.lichHenId);
    await payments.linkPrevious(plusOne.lichHenId, equal.lichHenId);

    expect(await checkChildMatchesParent(db)).toEqual([]);
  });

  it.each([
    ['cha + 2', 4],
    ['nhỏ hơn cha', 1],
  ])(
    'bộ đếm của con %s ⇒ bắt, cotLech = so_lan_tu_doi_lich',
    async (_name, childCount) => {
      const w = await world();
      const child = await w.chain(2);
      const parentId = await parentOf(child.lichHenId);
      await db.query(
        'UPDATE lich_hen SET so_lan_tu_doi_lich = 2 WHERE lich_hen_id = ?',
        [parentId],
      );
      await db.query(
        'UPDATE lich_hen SET so_lan_tu_doi_lich = ? WHERE lich_hen_id = ?',
        [childCount, child.lichHenId],
      );

      expect(await checkChildMatchesParent(db)).toEqual([
        {
          lichHenId: child.lichHenId,
          lichHenTruocId: parentId,
          cotLech: 'so_lan_tu_doi_lich',
        },
      ]);
    },
  );

  // Danh sách tám cột viết RIÊNG theo PLAN 5.3 (không đọc lại từ mã): nếu lặp theo `CHILD_COPIED_COLUMNS` thì bỏ một cột khỏi danh sách đó làm mất luôn ca của cột ấy
  it('danh sách cột lịch con phải bằng cha đúng tám cột của PLAN 5.3, theo thứ tự', () => {
    expect([...CHILD_COPIED_COLUMNS]).toEqual([...EIGHT_COLUMNS]);
  });

  it.each(EIGHT_COLUMNS)(
    'cột %s của con khác cha ⇒ bắt đúng cột đó (và chỉ cột đó)',
    async (column) => {
      const w = await world();
      const child = await w.chain(2);
      const otherDoctor = await fx.admin.doctor(w.branch);
      const otherBranch = await fx.admin.branch();
      const [otherPatient] = await fx.patients(1);
      const changed: Record<(typeof EIGHT_COLUMNS)[number], unknown> = {
        benh_nhan_id: otherPatient!.account.taiKhoanId,
        ho_so_nguoi_than_id: w.relativeId,
        bac_si_id: otherDoctor.profile.taiKhoanId,
        chi_nhanh_id: otherBranch.chiNhanhId,
        dich_vu_kham_id: otherDoctor.profile.dichVuKhamId,
        gia_snapshot: '999999.00',
        tien_coc_snapshot: '1.00',
        chinh_sach_hoan_snapshot:
          '[{"so_gio_truoc_toi_thieu":1,"ty_le_hoan":10}]',
      };

      await db.query(
        `UPDATE lich_hen SET ${column} = ? WHERE lich_hen_id = ?`,
        [changed[column], child.lichHenId],
      );

      const violations = await checkChildMatchesParent(db);
      expect(ids(violations, 'lichHenId')).toEqual([child.lichHenId]);
      expect(violations[0]?.['cotLech']).toBe(column);
    },
  );

  it('JSON so theo GIÁ TRỊ đã phân tích, không theo chuỗi: khác khoảng trắng và thứ tự khoá vẫn bằng nhau; khác giá trị thì lệch', async () => {
    const w = await world();
    const child = await w.chain(2);
    const parentId = await parentOf(child.lichHenId);
    await db.query(
      'UPDATE lich_hen SET chinh_sach_hoan_snapshot = ? WHERE lich_hen_id = ?',
      ['{"b": 1, "a": 2}', parentId],
    );
    await db.query(
      'UPDATE lich_hen SET chinh_sach_hoan_snapshot = ? WHERE lich_hen_id = ?',
      ['{"a":2,"b":1}', child.lichHenId],
    );
    expect(await checkChildMatchesParent(db)).toEqual([]);

    await db.query(
      'UPDATE lich_hen SET chinh_sach_hoan_snapshot = ? WHERE lich_hen_id = ?',
      ['{"a":2,"b":9}', child.lichHenId],
    );
    expect(ids(await checkChildMatchesParent(db), 'lichHenId')).toEqual([
      child.lichHenId,
    ]);
  });

  it('NULL an toàn (<=>): cả cha và con cùng hồ sơ BẢN THÂN (NULL) hay cùng chinh_sach NULL không bị coi là lệch; chỉ một bên NULL thì lệch', async () => {
    const w = await world();
    const child = await w.chain(2);
    expect(await checkChildMatchesParent(db)).toEqual([]);

    await db.query(
      'UPDATE lich_hen SET ho_so_nguoi_than_id = ? WHERE lich_hen_id = ?',
      [w.relativeId, child.lichHenId],
    );

    const violations = await checkChildMatchesParent(db);
    expect(violations[0]?.['cotLech']).toBe('ho_so_nguoi_than_id');
  });
});

describe('INV-9 mỗi chuỗi có đúng một lịch không phải DaDoiLich, không vòng, độ dài <= MAX_CHAIN_DEPTH', () => {
  it.each([1, 2, 19, MAX_CHAIN_DEPTH])(
    'sạch ⇒ rỗng: chuỗi %i lịch (kể cả đúng MAX_CHAIN_DEPTH)',
    async (length) => {
      const w = await world();
      await w.chain(length);

      expect(await checkChainHasOneLeaf(db)).toEqual([]);
    },
  );

  it('chuỗi vượt MAX_CHAIN_DEPTH (21 lịch) ⇒ bắt (loi ChuoiQuaDai, kèm gốc và số lịch)', async () => {
    const w = await world();
    const last = await w.chain(MAX_CHAIN_DEPTH + 1);

    const violations = await checkChainHasOneLeaf(db);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      loi: 'ChuoiQuaDai',
      soLich: MAX_CHAIN_DEPTH + 1,
      soLichCuoi: 1,
    });
    expect(last.lichHenId).toBeDefined();
  });

  it('chuỗi KHÔNG có lịch cuối (mọi lịch đều DaDoiLich) ⇒ bắt (loi SoLichCuoiKhacMot, soLichCuoi 0)', async () => {
    const w = await world();
    const a = await w.appt('DaDoiLich', 0);
    const b = await w.appt('DaDoiLich', 1);
    await payments.linkPrevious(b.lichHenId, a.lichHenId);

    expect(await checkChainHasOneLeaf(db)).toEqual([
      {
        loi: 'SoLichCuoiKhacMot',
        gocId: a.lichHenId,
        soLich: 2,
        soLichCuoi: 0,
      },
    ]);
  });

  it('chuỗi có HAI lịch không phải DaDoiLich ⇒ bắt (soLichCuoi 2)', async () => {
    const w = await world();
    const a = await w.appt('DaXacNhan', 0);
    const b = await w.appt('DaXacNhan', 1);
    await payments.linkPrevious(b.lichHenId, a.lichHenId);

    expect(await checkChainHasOneLeaf(db)).toEqual([
      {
        loi: 'SoLichCuoiKhacMot',
        gocId: a.lichHenId,
        soLich: 2,
        soLichCuoi: 2,
      },
    ]);
  });

  it('VÒNG (A trỏ B, B trỏ A; không lịch nào chạm gốc) ⇒ bắt CẢ HAI lịch (loi Vong); chuỗi bình thường cạnh đó không bị ảnh hưởng', async () => {
    const w = await world();
    const a = await w.appt('DaDoiLich', 0);
    const b = await w.appt('DaDoiLich', 1);
    await payments.linkPrevious(a.lichHenId, b.lichHenId);
    await payments.linkPrevious(b.lichHenId, a.lichHenId);
    await w.chain(2, 2);

    const violations = await checkChainHasOneLeaf(db);

    expect(violations.every((violation) => violation['loi'] === 'Vong')).toBe(
      true,
    );
    expect(ids(violations, 'lichHenId').sort()).toEqual(
      [a.lichHenId, b.lichHenId].sort(),
    );
  });
});

describe('INV-10 đổi lịch không làm đổi số hàng và tổng của giao_dich_thanh_toan, giao_dich_vi, lich_su_hoan_tien', () => {
  async function walletOf(patientId: string): Promise<string> {
    const rows: { id: string }[] = await db.query(
      'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [patientId],
    );
    return rows[0]!.id;
  }
  let codeCounter = 0;
  const addPayment = async (walletId: string, soTien: string) => {
    codeCounter += 1;
    const result: { insertId: number | string } = await db.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, NULL, 'NapVi', 'VNPay', ?, 'ThanhCong', ?, 'KhongCan', '2026-11-02 08:00:00')`,
      [walletId, soTien, `MA-B1-${String(codeCounter)}`],
    );
    return String(result.insertId);
  };
  const addLedger = (walletId: string, paymentId: string, soTien: string) =>
    db.query(
      `INSERT INTO giao_dich_vi (vi_noi_bo_id, loai, so_tien, so_du_sau, giao_dich_thanh_toan_id, thoi_diem)
       VALUES (?, 'Nap', ?, ?, ?, '2026-11-02 08:00:00')`,
      [walletId, soTien, soTien, paymentId],
    );
  // UNIQUE (giao_dich_thanh_toan_id, so_lan_thu): mỗi dòng hoàn thêm của CÙNG khoản cọc phải có `soLanThu` khác
  const addRefund = (
    walletId: string,
    paymentId: string,
    soTien: string,
    soLanThu = 1,
  ) =>
    db.query(
      `INSERT INTO lich_su_hoan_tien (giao_dich_thanh_toan_id, vi_noi_bo_id, loai, so_tien, trang_thai, so_lan_thu, thoi_diem)
       VALUES (?, ?, 'TuDong', ?, 'ThanhCong', ?, '2026-11-02 08:00:00')`,
      [paymentId, walletId, soTien, soLanThu],
    );

  async function moneyWorld() {
    const w = await world();
    const walletId = await walletOf(w.patientId);
    const paymentId = await addPayment(walletId, '100000.00');
    await addLedger(walletId, paymentId, '100000.00');
    await addRefund(walletId, paymentId, '50000.00');
    return { w, walletId, paymentId };
  }

  it('hai lần chụp liên tiếp bằng nhau ⇒ rỗng; mỗi bảng có số hàng và tổng đúng (chuỗi decimal)', async () => {
    await moneyWorld();

    const before = await captureMoneyTotals(db);

    expect(before).toEqual({
      giao_dich_thanh_toan: { soHang: 1, tong: '100000.00' },
      giao_dich_vi: { soHang: 1, tong: '100000.00' },
      lich_su_hoan_tien: { soHang: 1, tong: '50000.00' },
    });
    expect(checkMoneyUnchanged(before, await captureMoneyTotals(db))).toEqual(
      [],
    );
  });

  it('một ca đổi lịch thật (chuỗi mới, không đụng tiền) ⇒ ba bảng không đổi', async () => {
    const { w } = await moneyWorld();
    const before = await captureMoneyTotals(db);

    await w.chain(3);

    expect(checkMoneyUnchanged(before, await captureMoneyTotals(db))).toEqual(
      [],
    );
  });

  it.each([
    [
      'giao_dich_thanh_toan',
      async (m: Awaited<ReturnType<typeof moneyWorld>>) =>
        void (await addPayment(m.walletId, '1.00')),
    ],
    [
      'giao_dich_vi',
      async (m: Awaited<ReturnType<typeof moneyWorld>>) =>
        void (await addLedger(m.walletId, m.paymentId, '1.00')),
    ],
    [
      'lich_su_hoan_tien',
      async (m: Awaited<ReturnType<typeof moneyWorld>>) =>
        void (await addRefund(m.walletId, m.paymentId, '1.00', 2)),
    ],
  ])(
    'thêm một dòng vào %s ⇒ bắt đúng bảng đó (số hàng và tổng đều đổi)',
    async (table, change) => {
      const m = await moneyWorld();
      const before = await captureMoneyTotals(db);

      await change(m);

      const violations = checkMoneyUnchanged(
        before,
        await captureMoneyTotals(db),
      );
      expect(violations.map((violation) => violation['bang'])).toEqual([table]);
    },
  );

  it('đổi so_tien mà KHÔNG đổi số hàng ⇒ vẫn bắt (tổng đổi)', async () => {
    const { paymentId } = await moneyWorld();
    const before = await captureMoneyTotals(db);

    await db.query(
      'UPDATE giao_dich_thanh_toan SET so_tien = ? WHERE giao_dich_thanh_toan_id = ?',
      ['100000.01', paymentId],
    );

    const violations = checkMoneyUnchanged(
      before,
      await captureMoneyTotals(db),
    );
    expect(violations).toEqual([
      {
        bang: 'giao_dich_thanh_toan',
        truoc: { soHang: 1, tong: '100000.00' },
        sau: { soHang: 1, tong: '100000.01' },
      },
    ]);
  });

  it('xoá một dòng và thêm một dòng cùng số tiền (số hàng và tổng bằng nhau) KHÔNG bị bắt: giới hạn đã biết của phép so tổng; INV-3 của wallet và booking lo phần định danh', async () => {
    const { walletId } = await moneyWorld();
    const before = await captureMoneyTotals(db);
    await db.query('DELETE FROM lich_su_hoan_tien');
    const found: { id: string }[] = await db.query(
      'SELECT CAST(MIN(giao_dich_thanh_toan_id) AS CHAR) AS id FROM giao_dich_thanh_toan',
    );
    await addRefund(walletId, found[0]!.id, '50000.00');

    expect(checkMoneyUnchanged(before, await captureMoneyTotals(db))).toEqual(
      [],
    );
  });
});

describe('assertRescheduleInvariants', () => {
  it('sạch (kèm moneyBefore) ⇒ không ném', async () => {
    const w = await world();
    const moneyBefore = await captureMoneyTotals(db);
    await w.chain(3);

    await expect(
      assertRescheduleInvariants(db, { moneyBefore }),
    ).resolves.toBeUndefined();
    await expect(assertRescheduleInvariants(db)).resolves.toBeUndefined();
  });

  it('nêu rõ bất biến nào vỡ: INV-7 (DaDoiLich không con), INV-8 (cột lệch), INV-9 (vòng) và INV-10 (tiền) cùng lúc', async () => {
    const w = await world();
    const moneyBefore = await captureMoneyTotals(db);
    const orphan = await w.appt('DaDoiLich', 0);
    const child = await w.chain(2, 1);
    await db.query(
      'UPDATE lich_hen SET gia_snapshot = ? WHERE lich_hen_id = ?',
      ['1.00', child.lichHenId],
    );
    const walletRows: { id: string }[] = await db.query(
      'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [w.patientId],
    );
    await db.query(
      `INSERT INTO giao_dich_thanh_toan (vi_noi_bo_id, lich_hen_id, loai, phuong_thuc, so_tien, trang_thai, ma_giao_dich_cong, trang_thai_doi_soat, thoi_diem_tao)
       VALUES (?, NULL, 'NapVi', 'VNPay', '5.00', 'ThanhCong', 'MA-B1-X', 'KhongCan', '2026-11-02 08:00:00')`,
      [walletRows[0]!.id],
    );

    const error = await assertRescheduleInvariants(db, { moneyBefore }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('Bất biến đổi lịch bị vi phạm');
    expect(message).toContain('INV-7');
    expect(message).toContain(orphan.lichHenId);
    expect(message).toContain('INV-8');
    expect(message).toContain('gia_snapshot');
    expect(message).toContain('INV-10');
  });
});
