import type { DataSource } from 'typeorm';
import { AuditRepository } from '../../audit/audit.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { AdminUnpostedTopupRepository } from '../reconcile/admin-unposted-topup.repository.js';
import { AdminUnpostedTopupService } from '../reconcile/admin-unposted-topup.service.js';
import { ReconcileRepository } from '../reconcile/reconcile.repository.js';
import { ReconcileService } from '../reconcile/reconcile.service.js';
import { TopupReconcileJob } from '../reconcile/topup-reconcile.job.js';
import { TopupNotifier } from '../topup/topup-notifier.js';
import { TopupRepository } from '../topup/topup.repository.js';

// Hạ tầng test của job đối soát nạp ví (payment B14): `TopupReconcileJob` và `ReconcileService` THẬT, dựng bằng tay (không qua Nest) để test chủ động bọc `DataSource`.
// Gom một chỗ vì int-spec và int-spec đồng thời cùng cần (jscpd quét `*.int-spec.ts`).

export function reconcileStack(db: DataSource) {
  const repository = new ReconcileRepository();
  const service = new ReconcileService(
    db,
    new TopupRepository(),
    repository,
    new WalletLedger(),
    new TopupNotifier(),
  );
  return {
    repository,
    service,
    job: new TopupReconcileJob(db, repository, service),
  };
}

/** Một lần thử đã ghi: số lần, kết quả, thời điểm `YYYY-MM-DD HH:mm:ss` (giờ VN). */
export interface AttemptInput {
  n: number;
  ketQua?: 'ThanhCong' | 'ThatBai' | 'KhongTheXuLy';
  at: string;
}

/**
 * Dựng thẳng một giao dịch nạp VNPay `ThanhCong` + `ChoDoiSoat` (đúng trạng thái B4 để lại khi cộng ví lỗi) kèm các lần thử đã ghi. Mặc định một lần 0 `ThatBai` lúc `at` (lần cộng đầu lúc xác minh).
 * Ví KHÔNG đổi: tiền chưa vào ví. Trả id giao dịch.
 */
export async function pendingTopup(
  db: DataSource,
  wf: WalletFixtures,
  input: {
    walletId: string;
    soTien?: string;
    trangThaiDoiSoat?: 'ChoDoiSoat' | 'DaDoiSoat' | 'KhongCan';
    attempts?: AttemptInput[];
    at?: string;
  },
): Promise<string> {
  const at = input.at ?? '2026-11-02 08:00:00';
  const id = await wf.insertPayment({
    viNoiBoId: input.walletId,
    loai: 'NapVi',
    phuongThuc: 'VNPay',
    soTien: input.soTien ?? '100000.00',
    trangThai: 'ThanhCong',
    trangThaiDoiSoat: input.trangThaiDoiSoat ?? 'ChoDoiSoat',
    thoiDiemTao: at,
  });
  for (const attempt of input.attempts ?? [{ n: 0, at }])
    await db.query(
      `INSERT INTO lan_doi_soat_nap_vi (giao_dich_thanh_toan_id, so_lan_thu, ket_qua, nguoi_xu_ly_id, ly_do, thoi_diem)
       VALUES (?, ?, ?, NULL, 'MA_GIA', ?)`,
      [id, attempt.n, attempt.ketQua ?? 'ThatBai', attempt.at],
    );
  return id;
}

/**
 * B15: `AdminUnpostedTopupService` THẬT dựng bằng tay. `audit` truyền vào để ca "nhật ký lỗi" (NVC-08) thay bằng bản ném lỗi.
 */
export function unpostedStack(
  db: DataSource,
  audit: Pick<AuditService, 'record'> = new AuditService(new AuditRepository()),
) {
  return new AdminUnpostedTopupService(
    db,
    new AdminUnpostedTopupRepository(),
    new TopupRepository(),
    new ReconcileRepository(),
    new WalletLedger(),
    new TopupNotifier(),
    audit as AuditService,
  );
}

/** Lần 0 (xác minh) và ba lần job đều `ThatBai`: giao dịch đã vào hàng đợi "Nạp ví chưa cộng" (B15). */
export const EXHAUSTED_ATTEMPTS: AttemptInput[] = [
  { n: 0, at: '2026-11-02 08:00:00' },
  { n: 1, at: '2026-11-02 08:05:00' },
  { n: 2, at: '2026-11-02 08:10:00' },
  { n: 3, at: '2026-11-02 08:15:00' },
];
