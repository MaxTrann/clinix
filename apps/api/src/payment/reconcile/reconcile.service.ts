import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { TOPUP_RECONCILE_MAX_RETRIES } from '../../wallet/wallet.constants.js';
import {
  TOPUP_RECONCILE_GAP_MINUTES,
  TOPUP_RETRY_CREDIT_FAILED,
} from '../payment.constants.js';
import { TopupNotifier } from '../topup/topup-notifier.js';
import { TopupRepository } from '../topup/topup.repository.js';
import { logErrorCode } from '../log-error-code.js';
import { ReconcileRepository } from './reconcile.repository.js';

/** Kết quả đối soát MỘT giao dịch. */
export type ReconcileOutcome =
  | 'Credited' // cộng ví thành công ở lần thử này
  | 'AlreadyCredited' // đã có dòng `Nap` từ trước (A8): chỉ đánh dấu `DaDoiSoat`, không cộng
  | 'Failed' // lần thử này lỗi; đã ghi một dòng `ThatBai` (lần thứ 3 thì đã báo Quản trị viên)
  | 'Skipped'; // không còn là ứng viên dưới khoá (bản job khác hay IPN vừa xử lý, đã đủ lượt…)

/**
 * Cộng lại MỘT giao dịch nạp đã được cổng xác nhận nhưng chưa vào ví (payment B14; PLAN 5.4 bước 5; 2.4 NTV b16 đến b18; DST-01…DST-09, DTT-08).
 *
 *  1. MỘT giao dịch CSDL: khoá 7a dòng nạp → KIỂM LẠI còn `ThanhCong` + `ChoDoiSoat` và còn lượt (bản job khác hay IPN có thể vừa xử lý) → đã có dòng `Nap` ⇒ chỉ `DaDoiSoat` (A8, KHÔNG cộng)
 *     → khoá ví 7b → `WalletLedger.credit` → `DaDoiSoat` → lần thử `ThanhCong` → thông báo `NapViDaDoiSoat`. Thứ tự khoá như IPN của B4 (7a rồi 7b rồi bảng con), nên IPN và job đua nhau
 *     chỉ xếp hàng ở khoá 7a, không vòng chờ (DTT-08).
 *  2. Lỗi ⇒ hoàn tác trọn; rồi GIAO DỊCH RIÊNG ghi một lần thử `ThatBai` (mã lý do, không văn bản lỗi gốc). Lần thứ `TOPUP_RECONCILE_MAX_RETRIES` ⇒ báo mọi Quản trị viên `ToanHeThong` trong
 *     cùng giao dịch đó; giao dịch nạp vẫn `ChoDoiSoat` để B15 (Quản trị viên) xử lý tay.
 * IPN gửi lại trong lúc `ChoDoiSoat` thì B4 trả `02` (dòng đã có kết quả), không cộng: chỉ job hay Quản trị viên được cộng giao dịch này (DST-08).
 */
@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(TopupRepository) private readonly topups: TopupRepository,
    @Inject(ReconcileRepository)
    private readonly repository: ReconcileRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(TopupNotifier) private readonly notifier: TopupNotifier,
  ) {}

  /** `now` cắt xuống giây, do job truyền (một mốc cho cả lượt; test dùng mốc giả). */
  async reconcile(giaoDichId: string, now: Date): Promise<ReconcileOutcome> {
    try {
      return await withBookingTransaction<ReconcileOutcome>(
        this.db,
        async (em) => {
          const row = await this.topups.lockTopup(em, giaoDichId);
          if (
            row === null ||
            row.trangThai !== 'ThanhCong' ||
            row.trangThaiDoiSoat !== 'ChoDoiSoat'
          )
            return 'Skipped';
          const last = await this.dueAttempt(em, giaoDichId, now);
          if (last === null) return 'Skipped';
          // A8: tiền đã vào ví (Quản trị viên, hay lần trước) ⇒ không cộng lần hai
          if (row.daCongVi) {
            await this.repository.markReconciled(em, giaoDichId);
            return 'AlreadyCredited';
          }
          const wallet = await this.ledger.lockWalletById(em, row.viNoiBoId);
          if (wallet === null)
            throw new Error('Dòng nạp trỏ tới ví không tồn tại');
          await this.ledger.credit(em, wallet, {
            loai: 'Nap',
            soTien: row.soTien,
            ref: { giaoDichThanhToanId: giaoDichId },
            now,
          });
          await this.repository.markReconciled(em, giaoDichId);
          await this.repository.insertAttempt(em, {
            giaoDichId,
            soLanThu: last + 1,
            ketQua: 'ThanhCong',
            lyDo: null,
            now,
          });
          await this.notifier.notifyReconciled(em, {
            benhNhanId: row.benhNhanId,
            soTien: row.soTien,
            now,
          });
          return 'Credited';
        },
        { label: 'topup-reconcile' },
      );
    } catch (error) {
      this.logger.warn(
        `Đối soát nạp ví #${giaoDichId}: cộng ví lỗi (${logErrorCode(error)})`,
      );
      return this.recordFailure(giaoDichId, now);
    }
  }

  /**
   * Số lần thử lớn nhất nếu giao dịch CÒN đến lượt (gọi DƯỚI khoá 7a), ngược lại `null`: đã đủ lượt, hay lần ghi gần nhất chưa cách đủ `TOPUP_RECONCILE_GAP_MINUTES`. Kiểm cả THỜI ĐIỂM (không chỉ số lần)
   * để hai bản job chạy cùng lượt không "thử trùng": bên sau chờ khoá xong thấy lần thử vừa ghi còn mới nên bỏ qua (DST-06, M14).
   */
  private async dueAttempt(
    em: Parameters<ReconcileRepository['lastAttempt']>[0],
    giaoDichId: string,
    now: Date,
  ): Promise<number | null> {
    const last = await this.repository.lastAttempt(em, giaoDichId);
    if (last.n >= TOPUP_RECONCILE_MAX_RETRIES) return null;
    const before = now.getTime() - TOPUP_RECONCILE_GAP_MINUTES * 60_000;
    if (last.thoiDiem !== null && last.thoiDiem.getTime() > before) return null;
    return last.n;
  }

  /** Giao dịch riêng: một lần thử `ThatBai`; lần cuối thì báo Quản trị viên. Chính bước này lỗi ⇒ chỉ log (lượt sau thử lại vì lần ghi cuối vẫn cũ). */
  private async recordFailure(
    giaoDichId: string,
    now: Date,
  ): Promise<ReconcileOutcome> {
    try {
      return await withBookingTransaction<ReconcileOutcome>(
        this.db,
        async (em) => {
          const row = await this.topups.lockTopup(em, giaoDichId);
          if (row === null || row.trangThaiDoiSoat !== 'ChoDoiSoat')
            return 'Skipped';
          // Kiểm lại dưới khoá: bản job khác có thể vừa ghi lần thử trong lúc giao dịch của ta hoàn tác
          const last = await this.dueAttempt(em, giaoDichId, now);
          if (last === null) return 'Skipped';
          const next = last + 1;
          await this.repository.insertAttempt(em, {
            giaoDichId,
            soLanThu: next,
            ketQua: 'ThatBai',
            lyDo: TOPUP_RETRY_CREDIT_FAILED,
            now,
          });
          if (next === TOPUP_RECONCILE_MAX_RETRIES)
            await this.notifier.notifyNeedsAttention(em, {
              giaoDichId,
              adminIds: await this.repository.findSystemAdmins(em),
              now,
            });
          return 'Failed';
        },
        { label: 'topup-reconcile-failed' },
      );
    } catch (error) {
      this.logger.error(
        `Đối soát nạp ví #${giaoDichId}: không ghi được lần thử (${logErrorCode(error)})`,
      );
      return 'Failed';
    }
  }
}
