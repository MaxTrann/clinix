import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { WalletBalancePort } from '../../appointments/ports/wallet.port.js';
import { subtractMoney } from '../../pricing/money.js';
import { WalletBalanceRepository } from './wallet-balance.repository.js';

/**
 * Bản thật của `WalletBalancePort` (payment B1; PLAN E5, HDT-04): số dư khả dụng `so_du − so_tien_dang_giu` (chuỗi 2 chữ số, ≥ 0), hoặc `null` khi KHÔNG có hàng ví.
 * Đọc thường, không khoá và không giao dịch riêng: con số chỉ để HIỂN THỊ (Bước 5 đặt lịch, `soDuVi`); quyết định thật ở bước trừ dưới khoá ví (B5).
 * B7 (Đại) nối vào `appointments.module.ts` bằng `useExisting`; task này chỉ XUẤT lớp.
 */
@Injectable()
export class WalletBalanceReader implements WalletBalancePort {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(WalletBalanceRepository)
    private readonly repository: WalletBalanceRepository,
  ) {}

  async available(benhNhanId: string): Promise<string | null> {
    const wallet = await this.repository.findWallet(
      this.dataSource.manager,
      benhNhanId,
    );
    return wallet === null
      ? null
      : subtractMoney(wallet.soDu, wallet.soTienDangGiu);
  }
}
