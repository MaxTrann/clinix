import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { subtractMoney } from '../../pricing/money.js';
import {
  TOPUP_MAX,
  TOPUP_MIN,
  TOPUP_PENDING_WINDOW_MINUTES,
  type TopupGateway,
} from '../wallet.constants.js';
import { CONFIGURED_TOPUP_GATEWAYS } from './configured-gateways.js';
import type {
  WalletOverview,
  WalletTransactionsPage,
  WalletTransactionsQuery,
} from './wallet-balance.dto.js';
import {
  toTransactionItem,
  toWithdrawalSummary,
} from './wallet-balance.mapper.js';
import { WalletBalanceRepository } from './wallet-balance.repository.js';

/**
 * Số dư và lịch sử ví của Bệnh nhân (payment B1; PLAN 5.11 #1, #2; SDV-01…SDV-09). Chỉ đọc, không khoá, không log. `patientId` chỉ từ access token.
 * Mỗi lần gọi chạy trong MỘT `runReadOnly` (một ảnh chụp): số dư, tổng nạp chờ, yêu cầu rút gần nhất (hoặc `total` và trang lịch sử) khớp nhau dù có ghi đồng thời.
 * Không có hàng ví ⇒ 404 `KHONG_TIM_THAY` (cùng thân với mọi 404; QTT-02).
 */
@Injectable()
export class PatientWalletService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(WalletBalanceRepository)
    private readonly repository: WalletBalanceRepository,
    @Inject(CONFIGURED_TOPUP_GATEWAYS)
    private readonly gateways: readonly TopupGateway[],
  ) {}

  async overview(
    patientId: string,
    now: Date = nowVN(),
  ): Promise<WalletOverview> {
    // Mốc cắt từng cổng: cắt xuống giây như DATETIME của MySQL, để dòng tạo ĐÚNG biên cửa sổ vẫn còn trong cửa sổ
    const cutoffs = new Map<TopupGateway, Date>();
    for (const gateway of Object.keys(
      TOPUP_PENDING_WINDOW_MINUTES,
    ) as TopupGateway[]) {
      cutoffs.set(
        gateway,
        toSecond(
          new Date(
            now.getTime() - TOPUP_PENDING_WINDOW_MINUTES[gateway] * 60_000,
          ),
        ),
      );
    }
    return runReadOnly(this.dataSource, async (manager) => {
      const wallet = await this.repository.findWallet(manager, patientId);
      if (wallet === null)
        throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
      const pending = await this.repository.sumPendingTopups(
        manager,
        wallet.id,
        cutoffs,
      );
      const latest = await this.repository.findLatestWithdrawal(
        manager,
        wallet.id,
      );
      return {
        soDuKhaDung: subtractMoney(wallet.soDu, wallet.soTienDangGiu),
        soTienDangGiu: wallet.soTienDangGiu,
        soDu: wallet.soDu,
        napChoXacNhan: pending,
        yeuCauRutGanNhat: latest === null ? null : toWithdrawalSummary(latest),
        hanMucNap: { toiThieu: TOPUP_MIN, toiDa: TOPUP_MAX },
        congThanhToan: [...this.gateways],
      };
    });
  }

  async transactions(
    patientId: string,
    query: WalletTransactionsQuery,
    now: Date = nowVN(),
  ): Promise<WalletTransactionsPage> {
    const loai = query.loai ?? null;
    return runReadOnly(this.dataSource, async (manager) => {
      const wallet = await this.repository.findWallet(manager, patientId);
      if (wallet === null)
        throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
      const total = await this.repository.countHistory(
        manager,
        wallet.id,
        loai,
      );
      // Chỉ lấy trang khi `offset < total`: `trang` rất lớn không bao giờ gửi `OFFSET` khổng lồ cho MySQL (1064 ra 500)
      const rows =
        query.offset < total
          ? await this.repository.findHistoryPage(
              manager,
              wallet.id,
              loai,
              query.kichThuoc,
              query.offset,
            )
          : [];
      return {
        items: rows.map((row) => toTransactionItem(row, now)),
        total,
        trang: query.trang,
        kichThuoc: query.kichThuoc,
      };
    });
  }
}
