import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { parsePublicId } from '../../search/common/id-param.js';
import { WalletLedger } from '../../wallet/ledger/wallet-ledger.js';
import { TOPUP_RECONCILE_MAX_RETRIES } from '../../wallet/wallet.constants.js';
import {
  PAYMENT_ERROR_CODES,
  PAYMENT_ERROR_MESSAGES,
} from '../payment.constants.js';
import { TopupNotifier } from '../topup/topup-notifier.js';
import { TopupRepository, type TopupRow } from '../topup/topup.repository.js';
import type {
  UnpostedTopup,
  UnpostedTopupDetail,
  UnpostedTopupHandled,
} from './admin-unposted-topup.dto.js';
import {
  AdminUnpostedTopupRepository,
  type UnpostedTopupRow,
} from './admin-unposted-topup.repository.js';
import { ReconcileRepository } from './reconcile.repository.js';

/** Kết quả CÓ KIỂU của phần ghi (dưới khoá 7a). */
type HandleOutcome =
  | { kind: 'Handled'; result: UnpostedTopupHandled }
  | { kind: 'NotFound' }
  | { kind: 'AlreadyCredited' };

const notFound = () => new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);

function toItem(row: UnpostedTopupRow): UnpostedTopup {
  const unprocessable = row.ketQuaCuoi === 'KhongTheXuLy';
  return {
    maGiaoDich: row.maGiaoDich,
    phuongThuc: row.phuongThuc,
    maGiaoDichCong: row.maGiaoDichCong,
    benhNhan: { hoTen: row.hoTen },
    soTien: row.soTien,
    thoiDiemXacMinh: row.thoiDiemXacMinh.toISOString(),
    soLanThuTuDong: row.soLanThuTuDong,
    toiDaThuTuDong: TOPUP_RECONCILE_MAX_RETRIES,
    trangThaiXuLy: unprocessable ? 'KhongTheXuLy' : 'ChoXuLy',
    lyDoKhongTheXuLy: unprocessable ? row.lyDoCuoi : null,
  };
}

/**
 * Quản trị viên `ToanHeThong` xử lý nạp ví đã được cổng xác minh nhưng chưa cộng vào ví sau ba lần đối soát tự động (payment B15; PLAN 5.4 bước 6; 2.4 NVC b6 đến b10, A3, A4;
 * NVC-01…NVC-10, DTT-15, TDT-03).
 *
 * Hàng đợi = nạp `ThanhCong` + `ChoDoiSoat` + lần thử lớn nhất ≥ số lượt của job. Job B14 chỉ chọn lần thử lớn nhất < số lượt, nên job và Quản trị viên KHÔNG cùng xử lý một giao dịch;
 * vẫn kiểm lại dưới khoá vì IPN cũ hay dữ liệu dựng tay có thể đã cộng (A3).
 *
 * Hai đường ghi, mỗi đường MỘT giao dịch, khoá theo hạng 7a (dòng nạp) → 7b (ví) → 7c (bảng con), như IPN và job (DTT-15: chỉ xếp hàng ở 7a, không vòng chờ):
 *  - `credit`: đã có dòng `Nap` ⇒ 409 `GIAO_DICH_NAP_DA_DOI_SOAT` (không cộng thêm) → không còn ở hàng đợi ⇒ 404 → khoá ví → `WalletLedger.credit('Nap')` đúng số của giao dịch
 *    → `DaDoiSoat` → lần thử `ThanhCong` kèm người xử lý → nhật ký `XuLyNapViChuaCong` → thông báo Bệnh nhân. Hai Quản trị viên cùng bấm: bên sau thấy dòng `Nap` ⇒ 409 (NVC-05).
 *  - `markUnprocessable`: cùng hai bước kiểm → lần thử `KhongTheXuLy` kèm lý do (giữ hàng đợi, vẫn `Cộng ví` được sau đó: NVC-07) → nhật ký → thông báo Bệnh nhân.
 * Nhật ký hay thông báo lỗi ⇒ ném, hoàn tác trọn cả ví (NVC-08). Không tạo hoàn tiền, không đụng yêu cầu rút (NVC-10).
 */
@Injectable()
export class AdminUnpostedTopupService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminUnpostedTopupRepository)
    private readonly queue: AdminUnpostedTopupRepository,
    @Inject(TopupRepository) private readonly topups: TopupRepository,
    @Inject(ReconcileRepository)
    private readonly attempts: ReconcileRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(TopupNotifier) private readonly notifier: TopupNotifier,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<{ items: UnpostedTopup[] }> {
    const rows = await this.queue.listQueue(
      this.db.manager,
      TOPUP_RECONCILE_MAX_RETRIES,
    );
    return { items: rows.map(toItem) };
  }

  /** Chi tiết kèm MỌI lần thử (NVC-02). Không ở hàng đợi (đã cộng, chưa hết lượt, không phải nạp, id sai dạng) ⇒ CÙNG một 404 (NVC-09). */
  async detail(maGiaoDich: string): Promise<UnpostedTopupDetail> {
    const id = parsePublicId(maGiaoDich);
    const em = this.db.manager;
    const row = await this.queue.findInQueue(
      em,
      id,
      TOPUP_RECONCILE_MAX_RETRIES,
    );
    if (row === null) throw notFound();
    const attempts = await this.queue.attemptsOf(em, id);
    return {
      ...toItem(row),
      lanThu: attempts.map((a) => ({
        soLanThu: a.soLanThu,
        ketQua: a.ketQua,
        lyDo: a.lyDo,
        nguoiXuLy: a.nguoiXuLy,
        thoiDiem: a.thoiDiem.toISOString(),
      })),
    };
  }

  async credit(
    adminId: string,
    maGiaoDich: string,
  ): Promise<UnpostedTopupHandled> {
    const id = parsePublicId(maGiaoDich);
    return this.handle(id, 'admin-credit-topup', async (em, row, next, now) => {
      const wallet = await this.ledger.lockWalletById(em, row.viNoiBoId);
      if (wallet === null) throw new Error('Dòng nạp trỏ tới ví không tồn tại');
      // Số tiền CHỈ từ giao dịch nạp, không từ thân (NVC-03)
      await this.ledger.credit(em, wallet, {
        loai: 'Nap',
        soTien: row.soTien,
        ref: { giaoDichThanhToanId: id },
        now,
      });
      await this.attempts.markReconciled(em, id);
      await this.attempts.insertAttempt(em, {
        giaoDichId: id,
        soLanThu: next,
        ketQua: 'ThanhCong',
        lyDo: null,
        now,
        nguoiXuLyId: adminId,
      });
      await this.audit.record(em, {
        actorId: adminId,
        // Ví không thuộc chi nhánh nào
        branchId: null,
        action: 'XuLyNapViChuaCong',
        targetType: 'giao_dich_thanh_toan',
        targetId: id,
        result: 'ThanhCong',
        changes: { ket_qua: 'ThanhCong', so_tien: row.soTien },
      });
      await this.notifier.notifyReconciled(em, {
        benhNhanId: row.benhNhanId,
        soTien: row.soTien,
        now,
      });
      return { maGiaoDich: id, trangThaiDoiSoat: 'DaDoiSoat' };
    });
  }

  async markUnprocessable(
    adminId: string,
    maGiaoDich: string,
    lyDo: string,
  ): Promise<UnpostedTopupHandled> {
    const id = parsePublicId(maGiaoDich);
    return this.handle(
      id,
      'admin-unprocessable-topup',
      async (em, row, next, now) => {
        await this.attempts.insertAttempt(em, {
          giaoDichId: id,
          soLanThu: next,
          ketQua: 'KhongTheXuLy',
          lyDo,
          now,
          nguoiXuLyId: adminId,
        });
        await this.audit.record(em, {
          actorId: adminId,
          branchId: null,
          action: 'XuLyNapViChuaCong',
          targetType: 'giao_dich_thanh_toan',
          targetId: id,
          result: 'ThanhCong',
          changes: {
            ket_qua: 'KhongTheXuLy',
            so_tien: row.soTien,
            ly_do: lyDo,
          },
        });
        await this.notifier.notifyUnprocessable(em, {
          benhNhanId: row.benhNhanId,
          soTien: row.soTien,
          now,
        });
        // Giữ hàng đợi: giao dịch vẫn `ChoDoiSoat`
        return { maGiaoDich: id, trangThaiDoiSoat: 'ChoDoiSoat' };
      },
    );
  }

  /**
   * Khung chung của hai đường ghi: khoá 7a, hai bước kiểm dưới khoá, rồi `work` với số lần thử kế tiếp. Thân chạy lại được khi 1213/1205 (không tác dụng phụ ngoài DB; `now` đọc lại mỗi lần).
   */
  private async handle(
    id: string,
    label: string,
    work: (
      em: EntityManager,
      row: TopupRow,
      nextAttempt: number,
      now: Date,
    ) => Promise<UnpostedTopupHandled>,
  ): Promise<UnpostedTopupHandled> {
    const outcome = await withBookingTransaction<HandleOutcome>(
      this.db,
      async (em) => {
        const row = await this.topups.lockTopup(em, id);
        if (row === null) return { kind: 'NotFound' };
        // A3: tiền đã vào ví (job, IPN, hay Quản trị viên khác vừa cộng) ⇒ không cộng lần hai. Dòng `Nap` có mà còn `ChoDoiSoat` (dữ liệu lệch) thì đánh dấu `DaDoiSoat`
        // như A8 của job, để giao dịch rời hàng đợi (giao dịch vẫn commit, lỗi 409 trả SAU khi commit)
        if (row.daCongVi || row.trangThaiDoiSoat === 'DaDoiSoat') {
          if (row.trangThaiDoiSoat === 'ChoDoiSoat')
            await this.attempts.markReconciled(em, id);
          return { kind: 'AlreadyCredited' };
        }
        if (
          row.trangThai !== 'ThanhCong' ||
          row.trangThaiDoiSoat !== 'ChoDoiSoat'
        )
          return { kind: 'NotFound' };
        const last = await this.attempts.lastAttempt(em, id);
        // Chưa hết lượt tự động: job đang xử lý, Quản trị viên không được chen vào
        if (last.n < TOPUP_RECONCILE_MAX_RETRIES) return { kind: 'NotFound' };
        const now = toSecond(nowVN());
        return {
          kind: 'Handled',
          result: await work(em, row, last.n + 1, now),
        };
      },
      { label },
    );
    switch (outcome.kind) {
      case 'Handled':
        return outcome.result;
      case 'NotFound':
        throw notFound();
      case 'AlreadyCredited':
        throw new AppException(
          409,
          PAYMENT_ERROR_CODES.TOPUP_ALREADY_RECONCILED,
          {
            thongBao: PAYMENT_ERROR_MESSAGES.GIAO_DICH_NAP_DA_DOI_SOAT,
            chiTiet: { trangThaiDoiSoat: 'DaDoiSoat' },
          },
        );
    }
  }
}
