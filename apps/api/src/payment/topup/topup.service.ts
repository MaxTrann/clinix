import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { compareMoney, fromCents, toCents } from '../../pricing/money.js';
import {
  TOPUP_MAX,
  TOPUP_MIN,
  WALLET_ERROR_CODES,
} from '../../wallet/wallet.constants.js';
import { GatewayRegistry } from '../gateway/gateway-registry.js';
import {
  PAYMENT_ERROR_CODES,
  PAYMENT_ERROR_MESSAGES,
} from '../payment.constants.js';
import type {
  CreateTopupDto,
  CreateTopupResult,
  TopupStatus,
} from './topup.dto.js';
import { TopupRepository } from './topup.repository.js';

/**
 * Tạo giao dịch nạp ví và xem trạng thái (payment B4; PLAN 5.4 bước 1 và 4; NTV-01…NTV-05, NTV-18, NTV-20, QTT-13).
 *
 * `create`:
 *  1. Cổng chưa cấu hình ⇒ 503 TRƯỚC khi ghi gì (NTV-04). Ngoài hạn mức Q20 ⇒ 400 `SO_TIEN_NGOAI_HAN_MUC`.
 *  2. Giao dịch ngắn: đọc thường ví của Bệnh nhân (từ token) rồi `INSERT` dòng `NapVi` `DangXuLy`. Không khoá ví: số dư chưa đổi.
 *  3. SAU commit mới gọi `createPayment` (MoMo sẽ gọi mạng: không giữ giao dịch CSDL trong lúc chờ mạng). Lỗi ⇒ dòng chuyển `ThatBai` (chưa cấp URL nên chưa có tiền nào chạy) và 503 `CONG_THANH_TOAN_LOI`.
 * Mỗi lần gọi là một giao dịch nạp độc lập (bấm đúp ⇒ hai dòng, mỗi dòng cộng đúng một lần khi có IPN: NTV-20).
 */
@Injectable()
export class TopupService {
  private readonly logger = new Logger(TopupService.name);

  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(TopupRepository) private readonly repository: TopupRepository,
    @Inject(GatewayRegistry) private readonly gateways: GatewayRegistry,
  ) {}

  async create(
    accountId: string,
    dto: CreateTopupDto,
    clientIp: string,
  ): Promise<CreateTopupResult> {
    const gateway = this.gateways.find(dto.phuongThuc);
    if (gateway === null || !gateway.configured)
      throw new AppException(503, PAYMENT_ERROR_CODES.GATEWAY_NOT_CONFIGURED, {
        thongBao: PAYMENT_ERROR_MESSAGES.CONG_THANH_TOAN_CHUA_CAU_HINH,
      });
    const soTien = fromCents(toCents(dto.soTien));
    if (
      compareMoney(soTien, TOPUP_MIN) < 0 ||
      compareMoney(soTien, TOPUP_MAX) > 0
    )
      throw new AppException(400, WALLET_ERROR_CODES.AMOUNT_OUT_OF_RANGE, {
        thongBao: PAYMENT_ERROR_MESSAGES.SO_TIEN_NGOAI_HAN_MUC,
        chiTiet: { toiThieu: TOPUP_MIN, toiDa: TOPUP_MAX },
      });

    const now = toSecond(nowVN());
    const giaoDichId = await withBookingTransaction(
      this.db,
      async (em) => {
        const viNoiBoId = await this.repository.findWalletId(em, accountId);
        // Bệnh nhân đã xác minh luôn có ví: thiếu là dữ liệu hỏng (500)
        if (viNoiBoId === null)
          throw new Error('Bệnh nhân không có hàng ví khi nạp tiền');
        return this.repository.insertTopup(em, {
          viNoiBoId,
          phuongThuc: dto.phuongThuc,
          soTien,
          now,
        });
      },
      { label: 'create-topup' },
    );

    try {
      const { redirectUrl } = await gateway.createPayment({
        giaoDichId,
        soTien,
        clientIp,
        now,
      });
      return { maGiaoDich: giaoDichId, redirectUrl };
    } catch (error) {
      // Chỉ ghi tên lớp lỗi: thông điệp lỗi của cổng có thể mang tham số (BDT-01)
      this.logger.warn(
        `Tạo yêu cầu thanh toán ${dto.phuongThuc} lỗi (${error instanceof Error ? error.name : 'unknown'})`,
      );
      await withBookingTransaction(
        this.db,
        (em) =>
          this.repository.markResult(em, giaoDichId, {
            trangThai: 'ThatBai',
            maGiaoDichCong: null,
          }),
        { label: 'create-topup-failed' },
      );
      // 503, không phải 502 như PLAN 5.14: `AppException` chỉ cho 4xx và 503 ("phụ thuộc ngoài tạm lỗi", cùng nếp `GUI_MAIL_LOI`); mã `CONG_THANH_TOAN_LOI` mới là thứ web dựa vào
      throw new AppException(503, PAYMENT_ERROR_CODES.GATEWAY_ERROR, {
        thongBao: PAYMENT_ERROR_MESSAGES.CONG_THANH_TOAN_LOI,
      });
    }
  }

  /** `GET /patient/wallet/topups/:maGiaoDich`: chỉ chủ ví thấy; không có hay của người khác ⇒ CÙNG một 404 (QTT-13). Không cộng ví ở đây (trang quay về chỉ hiển thị). */
  async find(accountId: string, giaoDichId: string): Promise<TopupStatus> {
    const row = await this.repository.findTopup(this.db.manager, giaoDichId);
    if (row === null || row.benhNhanId !== accountId)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return {
      maGiaoDich: row.giaoDichId,
      soTien: row.soTien,
      phuongThuc: row.phuongThuc,
      // Dòng nạp chỉ đi DangXuLy → ThanhCong | ThatBai (không dùng KhoiTao, HetHan: PLAN 4.7 #2)
      trangThai: row.trangThai as TopupStatus['trangThai'],
      daCongVi: row.daCongVi,
      thoiDiemTao: row.thoiDiemTao.toISOString(),
    };
  }
}
