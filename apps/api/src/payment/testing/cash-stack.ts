import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { SystemConfigRepository } from '../../admin/system-config/system-config.repository.js';
import { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import type { BookingFixtures } from '../../appointments/testing/booking-fixtures.js';
import {
  createStatusStack,
  statusWorld,
} from '../../appointments/testing/status-world.js';
import { ReceptionScopeRepository } from '../../rbac/reception-scope.repository.js';
import { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { CashPaymentService } from '../cash/cash-payment.service.js';
import { CashRepository } from '../cash/cash.repository.js';
import { PaymentChain } from '../ports/payment-chain.js';
import { PaymentSummaryReader } from '../ports/payment-summary.reader.js';

// Hạ tầng test của thu tiền mặt tại quầy (payment B6): `CashPaymentService` THẬT trên MySQL thật, với `checkIn` thật của booking (`createStatusStack`) và thế giới tiếp đón của booking
// (`statusWorld`: chi nhánh, Lễ tân, chi nhánh khác kèm Lễ tân khác, cấu hình cửa sổ 30 phút trước / 15 phút sau). Gom một chỗ vì int-spec, int-spec đồng thời và e2e cùng cần. Mọi giá trị là MINH HOẠ.

export const CASH_PRICE = '300000.00';

export function cashService(db: DataSource) {
  const chain = new PaymentChain();
  return new CashPaymentService(
    db,
    new CashRepository(),
    new ReceptionScopeService(new ReceptionScopeRepository(db)),
    new SystemConfigService(new SystemConfigRepository(db)),
    createStatusStack(db).transition,
    new PaymentSummaryReader(chain),
    chain,
  );
}

export async function cashWorld(db: DataSource, fx: BookingFixtures) {
  const w = await statusWorld(db, fx);
  const wallets = new WalletFixtures(db);
  const walletId = w.patient.wallet.viNoiBoId;
  return {
    ...w,
    wallets,
    walletId,
    service: cashService(db),
    /**
     * Lịch ở `trangThai` (mặc định `DaXacNhan`) ở khung giờ `slot`, giá `gia`, cọc `coc`. Cọc > 0 thì có khoản cọc TRẢ BẰNG VÍ nhất quán sổ cái (`insertWalletDeposit`), nên số còn phải thu
     * là `gia − coc` đúng như đời thật.
     */
    appointment: async (
      slot: number,
      options: {
        trangThai?: TrangThaiLichHen;
        gia?: string;
        coc?: string;
      } = {},
    ) => {
      const coc = options.coc ?? '0.00';
      const lich = await fx.appointmentIn(options.trangThai ?? 'DaXacNhan', {
        doctor: w.doctor.profile,
        khungGioId: w.slotId(slot),
        patientId: w.patientId,
        giaSnapshot: options.gia ?? CASH_PRICE,
        ...(coc === '0.00' ? {} : { tienCocSnapshot: coc }),
      });
      if (coc !== '0.00')
        await wallets.insertWalletDeposit({
          viNoiBoId: walletId,
          lichHenId: lich.lichHenId,
          soTien: coc,
        });
      return lich;
    },
  };
}

export type CashWorld = Awaited<ReturnType<typeof cashWorld>>;

/** Các khoản tiền mặt của một lịch gốc (để khẳng định "đã ghi đúng một" hay "không ghi gì"). */
export function cashRows(db: DataSource, rootLichHenId?: string) {
  return db.query(
    `SELECT CAST(giao_dich_thanh_toan_id AS CHAR) AS id, CAST(lich_hen_id AS CHAR) AS lichHenId, CAST(so_tien AS CHAR) AS soTien, CAST(nguoi_thu_id AS CHAR) AS nguoiThuId,
            vi_noi_bo_id AS viNoiBoId, ma_giao_dich_cong AS maCong, trang_thai AS trangThai, trang_thai_doi_soat AS doiSoat
     FROM giao_dich_thanh_toan WHERE phuong_thuc = 'TienMatTaiQuay'${rootLichHenId ? ' AND lich_hen_id = ?' : ''} ORDER BY giao_dich_thanh_toan_id`,
    rootLichHenId ? [rootLichHenId] : [],
  ) as Promise<
    {
      id: string;
      lichHenId: string;
      soTien: string;
      nguoiThuId: string;
      viNoiBoId: string | null;
      maCong: string | null;
      trangThai: string;
      doiSoat: string;
    }[]
  >;
}

/** Trạng thái hiện tại của một lịch. */
export async function stateOf(
  db: DataSource,
  lichHenId: string,
): Promise<string> {
  const rows: { trangThai: string }[] = await db.query(
    'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
    [lichHenId],
  );
  return rows[0]!.trangThai;
}
