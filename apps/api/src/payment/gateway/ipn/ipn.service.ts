import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../../appointments/locking/booking-transaction.js';
import { nowVN, toSecond } from '../../../common/time/time.js';
import { toCents } from '../../../pricing/money.js';
import { parsePublicId } from '../../../search/common/id-param.js';
import { WalletLedger } from '../../../wallet/ledger/wallet-ledger.js';
import type { TopupGateway } from '../../../wallet/wallet.constants.js';
import { TOPUP_FIRST_CREDIT_FAILED } from '../../payment.constants.js';
import { TopupNotifier } from '../../topup/topup-notifier.js';
import {
  TopupRepository,
  type TopupRow,
} from '../../topup/topup.repository.js';
import { GatewayRegistry } from '../gateway-registry.js';
import { logErrorCode } from '../../log-error-code.js';
import type {
  GatewayAck,
  IpnOutcome,
  VerifiedSignal,
} from '../gateway.port.js';

/**
 * Xử lý tín hiệu IPN của cổng thanh toán (payment B4; PLAN 5.4 bước 3; NTV-06…NTV-17, NTV-19, NTV-23, CGS-13, DTT-07). MỘT dịch vụ cho cả hai cổng: mỗi cổng chỉ khác ở `verifyIpn` và `ackFor`.
 *
 * Kiểm theo thứ tự, DỪNG ở lỗi đầu tiên, mỗi lỗi KHÔNG đổi dữ liệu:
 *  1. Chữ ký (`verifyIpn`, hàm thuần): sai ⇒ `InvalidSignature`; không đọc DB.
 *  2. Có dòng `NapVi` của ĐÚNG cổng với id = `txnRef` ⇒ không có ⇒ `NotFound`.
 *  3. Số tiền khớp `toCents(so_tien)` ⇒ không ⇒ `InvalidAmount`.
 *  4. DƯỚI KHOÁ 7a (`FOR UPDATE` dòng nạp): dòng đã có kết quả ⇒ `AlreadyHandled` (tín hiệu lặp A6 hay trái kết quả A7: không cộng, không đổi gì).
 *  5. Tín hiệu đầu `ThatBai` ⇒ ghi `ThatBai` + thông báo.
 *  6. Tín hiệu đầu `ThanhCong` ⇒ MỘT giao dịch: khoá ví (7b) → cộng ví + sổ cái → `ThanhCong` + mã cổng → thông báo. Lỗi ⇒ hoàn tác rồi GIAO DỊCH THỨ HAI ghi `ThanhCong` + `ChoDoiSoat` + lần thử số 0
 *     (ghi nhận bền vững "cổng đã thu tiền", job B14 cộng lại); cả hai lỗi ⇒ `Error` (cổng nhận `99` và gửi lại).
 * Phản hồi `00`/`02` CHỈ trả sau khi kết quả đã commit (2.4 b15): mọi bước ghi đều `await` giao dịch trước khi trả.
 * KHÔNG lọc theo cửa sổ "nạp chờ xác nhận": IPN đến muộn vẫn xử lý như tín hiệu đầu (NTV-23; cửa sổ chỉ để hiển thị).
 */
@Injectable()
export class IpnService {
  private readonly logger = new Logger(IpnService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
    @Inject(TopupRepository) private readonly repository: TopupRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(TopupNotifier) private readonly notifier: TopupNotifier,
  ) {}

  /** Xử lý một tín hiệu và trả phản hồi đúng định dạng của cổng. `raw` là tham số cổng gửi (chưa tin). Cổng chưa có bộ điều hợp ⇒ `null` (controller không gọi tới đây). */
  async handle(
    gateway: TopupGateway,
    raw: Readonly<Record<string, unknown>>,
  ): Promise<GatewayAck | null> {
    const port = this.gateways.find(gateway);
    if (port === null) return null;
    const signal = port.verifyIpn(raw);
    const outcome =
      signal.kind === 'Verified'
        ? await this.process(gateway, signal)
        : 'InvalidSignature';
    // Log CHỈ cổng và kết quả: không chuỗi truy vấn, chữ ký, mã giao dịch cổng, số tiền (BDT-01)
    if (outcome !== 'Processed' && outcome !== 'AlreadyHandled')
      this.logger.warn(`IPN ${gateway}: ${outcome}`);
    return port.ackFor(outcome);
  }

  /** Bước 2 trở đi; có thể gọi thẳng trong test với tín hiệu đã xác minh. */
  async process(
    gateway: TopupGateway,
    signal: VerifiedSignal,
  ): Promise<IpnOutcome> {
    // (2) txnRef phải là id BIGINT hợp lệ; sai dạng như "không có" (không ném 404 ra ngoài: cổng cần mã `01`)
    let giaoDichId: string;
    try {
      giaoDichId = parsePublicId(signal.txnRef);
    } catch {
      return 'NotFound';
    }
    const row = await this.repository.findTopup(this.db.manager, giaoDichId);
    if (row === null || row.phuongThuc !== gateway) return 'NotFound';
    // (3) số tiền: dòng nạp không bao giờ đổi `so_tien` nên kiểm ngoài khoá được
    if (signal.amountCents !== toCents(row.soTien)) return 'InvalidAmount';

    try {
      return await withBookingTransaction(
        this.db,
        async (em) => {
          // (4) khoá 7a: hai IPN cùng giao dịch xếp hàng ở đây; bên sau thấy kết quả của bên trước (số đo M5)
          const locked = await this.repository.lockTopup(em, giaoDichId);
          if (locked === null) return 'NotFound';
          if (locked.trangThai !== 'DangXuLy') return 'AlreadyHandled';
          const now = toSecond(nowVN());
          if (signal.result === 'ThatBai') {
            // (5) ví không đổi; mã cổng ghi nếu có (giao dịch huỷ: null, số đo M12)
            await this.repository.markResult(em, giaoDichId, {
              trangThai: 'ThatBai',
              maGiaoDichCong: signal.gatewayCode,
            });
            await this.notifier.notifyFailed(em, {
              benhNhanId: locked.benhNhanId,
              soTien: locked.soTien,
              now,
            });
            return 'Processed';
          }
          // (6) cộng ví: khoá ví 7b SAU khoá 7a, rồi sổ cái, rồi trạng thái, rồi thông báo (TDT-01: lỗi thông báo hoàn tác cả lần cộng)
          await this.credit(em, locked, signal.gatewayCode, now);
          return 'Processed';
        },
        { label: 'ipn-process' },
      );
    } catch (error) {
      // Chỉ tên lớp và mã lỗi của driver: thông điệp lỗi SQL có thể mang giá trị (mã cổng trong "Duplicate entry"; BDT-01)
      this.logger.warn(
        `IPN ${gateway}: ghi kết quả lỗi (${logErrorCode(error)})`,
      );
      if (signal.result !== 'ThanhCong') return 'Error';
      return this.recordPendingReconcile(gateway, giaoDichId, signal);
    }
  }

  private async credit(
    em: Parameters<WalletLedger['credit']>[0],
    row: TopupRow,
    gatewayCode: string | null,
    now: Date,
  ): Promise<void> {
    const wallet = await this.ledger.lockWalletById(em, row.viNoiBoId);
    if (wallet === null) throw new Error('Dòng nạp trỏ tới ví không tồn tại');
    await this.ledger.credit(em, wallet, {
      loai: 'Nap',
      soTien: row.soTien,
      ref: { giaoDichThanhToanId: row.giaoDichId },
      now,
    });
    await this.repository.markResult(em, row.giaoDichId, {
      trangThai: 'ThanhCong',
      maGiaoDichCong: gatewayCode,
    });
    await this.notifier.notifySucceeded(em, {
      benhNhanId: row.benhNhanId,
      soTien: row.soTien,
      now,
    });
  }

  /**
   * Giao dịch thứ hai của A3: cổng đã báo thu tiền nhưng cộng ví lỗi ⇒ ghi bền vững `ThanhCong` + `ChoDoiSoat` + lần thử số 0, KHÔNG cộng ví (job B14 cộng lại). Trả `Processed` (cổng nhận `00`:
   * kết quả và cách xử lý tiếp đã lưu). Lỗi tiếp ⇒ `Error` (`99`, cổng gửi lại; dòng vẫn `DangXuLy`). Dòng đã có kết quả (một IPN khác vừa xử lý xong) ⇒ `AlreadyHandled`.
   */
  private async recordPendingReconcile(
    gateway: TopupGateway,
    giaoDichId: string,
    signal: VerifiedSignal,
  ): Promise<IpnOutcome> {
    try {
      return await withBookingTransaction(
        this.db,
        async (em) => {
          const locked = await this.repository.lockTopup(em, giaoDichId);
          if (locked === null) return 'NotFound';
          if (locked.trangThai !== 'DangXuLy') return 'AlreadyHandled';
          const now = toSecond(nowVN());
          await this.repository.markResult(em, giaoDichId, {
            trangThai: 'ThanhCong',
            maGiaoDichCong: signal.gatewayCode,
            doiSoat: 'ChoDoiSoat',
          });
          await this.repository.insertFirstCreditFailure(em, {
            giaoDichId,
            lyDo: TOPUP_FIRST_CREDIT_FAILED,
            now,
          });
          return 'Processed';
        },
        { label: 'ipn-pending-reconcile' },
      );
    } catch (error) {
      this.logger.error(
        `IPN ${gateway}: không ghi được kết quả, chờ cổng gửi lại (${logErrorCode(error)})`,
      );
      return 'Error';
    }
  }
}
