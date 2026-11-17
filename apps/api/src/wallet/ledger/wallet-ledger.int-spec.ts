import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  runConcurrently,
  tallyOutcomes,
  withRowLock,
} from '../../appointments/testing/concurrency-harness.js';
import { assertWalletInvariants } from '../testing/wallet-invariants.js';
import { WalletFixtures } from '../testing/wallet-fixtures.js';
import { WalletLedger, type LockedWallet } from './wallet-ledger.js';

// payment P3 — WalletLedger trên MySQL 8.4 THẬT. Mã `WLG-nn` là `[đề xuất]` (PLAN payment chưa gán mã cho ledger; bất biến IVT-01…IVT-07 kiểm ở cuối mỗi ca và ở wallet-invariants.int-spec.ts).
// Ledger chạy TRONG giao dịch của người gọi: mọi ca mở `db.transaction` rồi khoá ví trước (hạng 7b).
let db: DataSource;
let wf: WalletFixtures;
useIntegrationHooks((d) => {
  db = d;
  wf = new WalletFixtures(d);
});
const ledger = new WalletLedger();
const NOW = new Date('2026-11-02T08:00:00+07:00');

/** Ví có `soDu` NHẤT QUÁN với sổ cái; trả cả `patientId` để khoá theo `benh_nhan_id`. */
async function fundedWallet(soDu: string) {
  const { patientId, walletId } = await wf.patientWithWallet();
  if (soDu !== '0.00') await wf.fundWallet(walletId, soDu);
  return { patientId, walletId };
}

/** Một giao dịch READ COMMITTED (như `withBookingTransaction`) khoá ví rồi chạy `work`. */
const inTx = <T>(
  patientId: string,
  work: (
    em: Parameters<WalletLedger['credit']>[0],
    wallet: LockedWallet,
  ) => Promise<T>,
) =>
  db.transaction('READ COMMITTED', async (em) => {
    const wallet = await ledger.lockWallet(em, patientId);
    if (wallet === null) throw new Error('ví không tồn tại');
    return work(em, wallet);
  });

const ledgerRows = (walletId: string) =>
  db.query<{ loai: string; soTien: string; soDuSau: string }[]>(
    'SELECT loai, so_tien AS soTien, so_du_sau AS soDuSau FROM giao_dich_vi WHERE vi_noi_bo_id = ? ORDER BY giao_dich_vi_id',
    [walletId],
  );

describe('WLG-02 lockWallet', () => {
  it('trả số dư và số đang giữ dạng chuỗi decimal; theo benh_nhan_id hoặc vi_noi_bo_id đều ra cùng ví', async () => {
    const { patientId, walletId } = await fundedWallet('120000.00');
    await db.transaction(async (em) => {
      const byPatient = await ledger.lockWallet(em, patientId);
      const byId = await ledger.lockWalletById(em, walletId);
      expect(byPatient).toEqual({
        viNoiBoId: walletId,
        benhNhanId: patientId,
        soDu: '120000.00',
        soTienDangGiu: '0.00',
      });
      expect(byId).toEqual(byPatient);
    });
  });

  it('không có ví ⇒ null (không ném lỗi)', async () => {
    await db.transaction(async (em) => {
      expect(await ledger.lockWallet(em, '987654')).toBeNull();
      expect(await ledger.lockWalletById(em, '987654')).toBeNull();
    });
  });

  it('khoá thật: giao dịch khoá cùng ví phải CHỜ giao dịch đang giữ khoá commit, rồi mới thấy số dư mới (không đọc số dư cũ)', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const waiter = await withRowLock(
      db,
      {
        sql: 'SELECT vi_noi_bo_id FROM vi_noi_bo WHERE benh_nhan_id = ? FOR UPDATE',
        params: [patientId],
      },
      async (held) => {
        let finished = false;
        const second = inTx(patientId, (_em, wallet) =>
          Promise.resolve(wallet.soDu),
        ).then((balance) => {
          finished = true;
          return balance;
        });
        await new Promise((resolve) => setTimeout(resolve, 400));
        // giao dịch hai vẫn đang chờ khoá
        expect(finished).toBe(false);
        await held.manager.query(
          'UPDATE vi_noi_bo SET so_du = 40000.00 WHERE vi_noi_bo_id = ?',
          [walletId],
        );
        await held.release('commit');
        return second;
      },
    );
    expect(waiter).toBe('40000.00');
  });
});

const paymentOf = (walletId: string, soTien: string) =>
  wf.insertPayment({
    viNoiBoId: walletId,
    lichHenId: null,
    loai: 'NapVi',
    phuongThuc: 'VNPay',
    soTien,
    trangThai: 'DangXuLy',
  });

describe('WLG-03 credit', () => {
  it('Nap: cộng so_du và ghi đúng MỘT dòng sổ cái dương kèm so_du_sau; trả ví mới', async () => {
    const { patientId, walletId } = await fundedWallet('0.00');
    const nap = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien: '200000.00',
      trangThai: 'ThanhCong',
    });
    const after = await inTx(patientId, (em, wallet) =>
      ledger.credit(em, wallet, {
        loai: 'Nap',
        soTien: '200000.00',
        ref: { giaoDichThanhToanId: nap },
        now: NOW,
      }),
    );
    expect(after.soDu).toBe('200000.00');
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '200000.00',
      soTienDangGiu: '0.00',
    });
    expect(await ledgerRows(walletId)).toEqual([
      { loai: 'Nap', soTien: '200000.00', soDuSau: '200000.00' },
    ]);
    await assertWalletInvariants(db);
  });

  it('HoanTien: cộng so_du, dòng sổ cái HoanTien trỏ lịch sử hoàn; số tiền lẻ 0,01 không sai số', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const paid = await wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'MoMo',
      soTien: '100000.00',
    });
    const refund = await wf.insertRefund({
      giaoDichThanhToanId: paid,
      viNoiBoId: walletId,
      soTien: '0.01',
    });
    await inTx(patientId, (em, wallet) =>
      ledger.credit(em, wallet, {
        loai: 'HoanTien',
        soTien: '0.01',
        ref: { lichSuHoanTienId: refund },
        now: NOW,
      }),
    );
    expect((await wf.readWallet(walletId)).soDu).toBe('100000.01');
    expect((await ledgerRows(walletId)).at(-1)).toEqual({
      loai: 'HoanTien',
      soTien: '0.01',
      soDuSau: '100000.01',
    });
  });

  it('hai lần cộng liên tiếp trong một giao dịch dùng ví MỚI của lần trước: so_du_sau tăng dần đúng', async () => {
    const { patientId, walletId } = await fundedWallet('0.00');
    const a = await paymentOf(walletId, '10000.00');
    const b = await paymentOf(walletId, '5000.00');
    await inTx(patientId, async (em, wallet) => {
      const one = await ledger.credit(em, wallet, {
        loai: 'Nap',
        soTien: '10000.00',
        ref: { giaoDichThanhToanId: a },
        now: NOW,
      });
      await ledger.credit(em, one, {
        loai: 'Nap',
        soTien: '5000.00',
        ref: { giaoDichThanhToanId: b },
        now: NOW,
      });
    });
    expect((await ledgerRows(walletId)).map((row) => row.soDuSau)).toEqual([
      '10000.00',
      '15000.00',
    ]);
    expect((await wf.readWallet(walletId)).soDu).toBe('15000.00');
  });

  it('số tiền không hợp lệ (0, âm, sai dạng) ⇒ ném lỗi và không ghi gì', async () => {
    const { patientId, walletId } = await fundedWallet('50000.00');
    const ref = { giaoDichThanhToanId: await paymentOf(walletId, '1.00') };
    for (const bad of ['0.00', '0', '-1.00', '1.234', 'abc', '']) {
      await expect(
        inTx(patientId, (em, wallet) =>
          ledger.credit(em, wallet, {
            loai: 'Nap',
            soTien: bad,
            ref,
            now: NOW,
          }),
        ),
      ).rejects.toThrow();
    }
    expect(await ledgerRows(walletId)).toHaveLength(1); // chỉ dòng của fundWallet
    expect((await wf.readWallet(walletId)).soDu).toBe('50000.00');
  });

  it('tham chiếu sai loại (Nap kèm lịch sử hoàn, HoanTien kèm giao dịch thanh toán) ⇒ ném lỗi', async () => {
    const { patientId, walletId } = await fundedWallet('0.00');
    const id = await paymentOf(walletId, '1.00');
    await expect(
      inTx(patientId, (em, wallet) =>
        ledger.credit(em, wallet, {
          loai: 'Nap',
          soTien: '1.00',
          ref: { lichSuHoanTienId: id },
          now: NOW,
        }),
      ),
    ).rejects.toThrow(/tham chiếu/);
    await expect(
      inTx(patientId, (em, wallet) =>
        ledger.credit(em, wallet, {
          loai: 'HoanTien',
          soTien: '1.00',
          ref: { giaoDichThanhToanId: id },
          now: NOW,
        }),
      ),
    ).rejects.toThrow(/tham chiếu/);
  });
});

describe('WLG-04 debit ThanhToan (tiêu từ số dư KHẢ DỤNG = so_du − so_tien_dang_giu)', () => {
  const payment = (walletId: string, soTien: string) =>
    wf.insertPayment({
      viNoiBoId: walletId,
      loai: 'NapVi',
      phuongThuc: 'VNPay',
      soTien,
    });

  it('đủ tiền: trừ so_du, ghi một dòng ThanhToan ÂM; trả Ok kèm ví mới', async () => {
    const { patientId, walletId } = await fundedWallet('300000.00');
    const ref = { giaoDichThanhToanId: await payment(walletId, '100000.00') };
    const outcome = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'ThanhToan',
        soTien: '100000.00',
        ref,
        now: NOW,
      }),
    );
    expect(outcome.kind).toBe('Ok');
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '200000.00',
      soTienDangGiu: '0.00',
    });
    expect((await ledgerRows(walletId)).at(-1)).toEqual({
      loai: 'ThanhToan',
      soTien: '-100000.00',
      soDuSau: '200000.00',
    });
  });

  it('biên: trừ đúng bằng số khả dụng ⇒ Ok, so_du về 0', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const ref = { giaoDichThanhToanId: await payment(walletId, '100000.00') };
    const outcome = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'ThanhToan',
        soTien: '100000.00',
        ref,
        now: NOW,
      }),
    );
    expect(outcome.kind).toBe('Ok');
    expect((await wf.readWallet(walletId)).soDu).toBe('0.00');
  });

  it('không đủ (thiếu 0,01): trả InsufficientBalance kèm số khả dụng, KHÔNG ném lỗi, KHÔNG ghi gì', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const ref = { giaoDichThanhToanId: await payment(walletId, '100000.01') };
    const outcome = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'ThanhToan',
        soTien: '100000.01',
        ref,
        now: NOW,
      }),
    );
    expect(outcome).toEqual({
      kind: 'InsufficientBalance',
      soDuKhaDung: '100000.00',
    });
    expect(await ledgerRows(walletId)).toHaveLength(1);
    expect((await wf.readWallet(walletId)).soDu).toBe('100000.00');
  });

  it('số tiền đang giữ KHÔNG được tiêu: so_du 100.000, giữ 40.000 ⇒ trừ 60.001 bị từ chối, trừ 60.000 được', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    await wf.insertWithdrawal({ viNoiBoId: walletId, soTien: '40000.00' });
    await wf.setWallet(walletId, '100000.00', '40000.00');
    const ref = { giaoDichThanhToanId: await payment(walletId, '60001.00') };
    const refused = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'ThanhToan',
        soTien: '60001.00',
        ref,
        now: NOW,
      }),
    );
    expect(refused).toEqual({
      kind: 'InsufficientBalance',
      soDuKhaDung: '60000.00',
    });
    const ok = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'ThanhToan',
        soTien: '60000.00',
        ref,
        now: NOW,
      }),
    );
    expect(ok.kind).toBe('Ok');
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '40000.00',
      soTienDangGiu: '40000.00',
    });
  });

  it('số tiền không hợp lệ hoặc tham chiếu sai loại ⇒ ném lỗi', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const id = await payment(walletId, '1.00');
    await expect(
      inTx(patientId, (em, wallet) =>
        ledger.debit(em, wallet, {
          loai: 'ThanhToan',
          soTien: '-5.00',
          ref: { giaoDichThanhToanId: id },
          now: NOW,
        }),
      ),
    ).rejects.toThrow();
    await expect(
      inTx(patientId, (em, wallet) =>
        ledger.debit(em, wallet, {
          loai: 'ThanhToan',
          soTien: '5.00',
          ref: { yeuCauRutTienId: id },
          now: NOW,
        }),
      ),
    ).rejects.toThrow(/tham chiếu/);
  });
});

describe('WLG-05 hold và release (giữ tiền cho yêu cầu rút: không có dòng sổ cái)', () => {
  it('hold: tăng so_tien_dang_giu, so_du và sổ cái không đổi; trả Ok', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const outcome = await inTx(patientId, (em, wallet) =>
      ledger.hold(em, wallet, '30000.00'),
    );
    expect(outcome.kind).toBe('Ok');
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '100000.00',
      soTienDangGiu: '30000.00',
    });
    expect(await ledgerRows(walletId)).toHaveLength(1);
  });

  it('hold vượt số khả dụng ⇒ InsufficientBalance, không đổi gì; hold đúng bằng số khả dụng ⇒ Ok (biên)', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    await wf.setWallet(walletId, '100000.00', '70000.00');
    const refused = await inTx(patientId, (em, wallet) =>
      ledger.hold(em, wallet, '30000.01'),
    );
    expect(refused).toEqual({
      kind: 'InsufficientBalance',
      soDuKhaDung: '30000.00',
    });
    const ok = await inTx(patientId, (em, wallet) =>
      ledger.hold(em, wallet, '30000.00'),
    );
    expect(ok.kind).toBe('Ok');
    expect((await wf.readWallet(walletId)).soTienDangGiu).toBe('100000.00');
  });

  it('release: giảm so_tien_dang_giu về đúng; nhả nhiều hơn số đang giữ ⇒ ném lỗi (lỗi lập trình, không ghi)', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    await wf.setWallet(walletId, '100000.00', '50000.00');
    const after = await inTx(patientId, (em, wallet) =>
      ledger.release(em, wallet, '20000.00'),
    );
    expect(after.soTienDangGiu).toBe('30000.00');
    expect((await wf.readWallet(walletId)).soTienDangGiu).toBe('30000.00');
    await expect(
      inTx(patientId, (em, wallet) => ledger.release(em, wallet, '30000.01')),
    ).rejects.toThrow(/nhả/);
    expect((await wf.readWallet(walletId)).soTienDangGiu).toBe('30000.00');
  });
});

describe('WLG-06 debit Rut (duyệt rút: trừ so_du VÀ nhả số đang giữ cùng lúc)', () => {
  it('trừ so_du, giảm so_tien_dang_giu cùng số, ghi một dòng Rut ÂM trỏ yêu cầu rút; số khả dụng không đổi', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const request = await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '30000.00',
      trangThai: 'DaDuyet',
      nguoiXuLyId: (await wf.admin.admin()).account.taiKhoanId,
    });
    await wf.setWallet(walletId, '100000.00', '30000.00');
    const outcome = await inTx(patientId, (em, wallet) =>
      ledger.debit(em, wallet, {
        loai: 'Rut',
        soTien: '30000.00',
        ref: { yeuCauRutTienId: request },
        now: NOW,
      }),
    );
    expect(outcome.kind).toBe('Ok');
    expect(await wf.readWallet(walletId)).toEqual({
      soDu: '70000.00',
      soTienDangGiu: '0.00',
    });
    expect((await ledgerRows(walletId)).at(-1)).toEqual({
      loai: 'Rut',
      soTien: '-30000.00',
      soDuSau: '70000.00',
    });
    await assertWalletInvariants(db);
  });

  it('rút nhiều hơn số đang giữ ⇒ ném lỗi (dữ liệu hỏng, không phải lỗi người dùng) và không ghi', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const request = await wf.insertWithdrawal({
      viNoiBoId: walletId,
      soTien: '30000.00',
    });
    await wf.setWallet(walletId, '100000.00', '30000.00');
    await expect(
      inTx(patientId, (em, wallet) =>
        ledger.debit(em, wallet, {
          loai: 'Rut',
          soTien: '30000.01',
          ref: { yeuCauRutTienId: request },
          now: NOW,
        }),
      ),
    ).rejects.toThrow(/đang giữ/);
    expect(await ledgerRows(walletId)).toHaveLength(1);
  });
});

describe('WLG-07 đồng thời trên cùng một ví (khoá 7b tuần tự hoá số dư)', () => {
  it('mười thanh toán 30.000 cùng lúc trên ví 100.000: đúng ba thành công, bảy bị từ chối, so_du 10.000, không 1213, không 500, bất biến đúng', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const refs: string[] = [];
    for (let i = 0; i < 10; i += 1)
      refs.push(await paymentOf(walletId, '30000.00'));
    const results = await runConcurrently(
      refs.map(
        (ref) => () =>
          inTx(patientId, (em, wallet) =>
            ledger.debit(em, wallet, {
              loai: 'ThanhToan',
              soTien: '30000.00',
              ref: { giaoDichThanhToanId: ref },
              now: NOW,
            }),
          ),
      ),
    );
    const tally = tallyOutcomes(results);
    expect(tally.other).toEqual([]);
    expect(tally.deadlocks).toBe(0);
    expect(tally.lockTimeouts).toBe(0);
    const kinds = results.map((result) =>
      result.status === 'fulfilled' ? result.value.kind : 'Lỗi',
    );
    expect(kinds.filter((kind) => kind === 'Ok')).toHaveLength(3);
    expect(kinds.filter((kind) => kind === 'InsufficientBalance')).toHaveLength(
      7,
    );
    expect((await wf.readWallet(walletId)).soDu).toBe('10000.00');
    await assertWalletInvariants(db);
  });

  it('thanh toán và giữ tiền rút chạy đua trên cùng ví: tổng không bao giờ vượt số dư (so_tien_dang_giu <= so_du), bất biến đúng', async () => {
    const { patientId, walletId } = await fundedWallet('100000.00');
    const refs: string[] = [];
    for (let i = 0; i < 4; i += 1)
      refs.push(await paymentOf(walletId, '40000.00'));
    const pay = (ref: string) => () =>
      inTx(patientId, (em, wallet) =>
        ledger.debit(em, wallet, {
          loai: 'ThanhToan',
          soTien: '40000.00',
          ref: { giaoDichThanhToanId: ref },
          now: NOW,
        }),
      );
    const hold = () => () =>
      inTx(patientId, (em, wallet) => ledger.hold(em, wallet, '40000.00'));
    const results = await runConcurrently([
      pay(refs[0]!),
      pay(refs[1]!),
      hold(),
      hold(),
    ]);
    expect(tallyOutcomes(results).other).toEqual([]);
    const wallet = await wf.readWallet(walletId);
    // 100.000 chỉ đủ cho hai khoản 40.000; hai khoản còn lại bị từ chối
    expect(
      results.filter((r) => r.status === 'fulfilled' && r.value.kind === 'Ok'),
    ).toHaveLength(2);
    expect(Number(wallet.soTienDangGiu)).toBeLessThanOrEqual(
      Number(wallet.soDu),
    );
    // so_tien_dang_giu không có yêu cầu rút tương ứng nên IVT-02 báo: ca này kiểm riêng chk_vi_so_du và IVT-01, IVT-03
    const rows: { id: string }[] = await db.query(
      'SELECT 1 AS id FROM vi_noi_bo WHERE so_du < so_tien_dang_giu OR so_du < 0',
    );
    expect(rows).toEqual([]);
  });
});
