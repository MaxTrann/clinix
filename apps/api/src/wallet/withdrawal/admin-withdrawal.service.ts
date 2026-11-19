import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { withBookingTransaction } from '../../appointments/locking/booking-transaction.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { WalletLedger } from '../ledger/wallet-ledger.js';
import {
  WALLET_ERROR_CODES,
  WALLET_ERROR_MESSAGES,
} from '../wallet.constants.js';
import type {
  AdminWithdrawalDetail,
  AdminWithdrawalItem,
  AdminWithdrawalsPage,
  AdminWithdrawalsQuery,
  WithdrawalDecided,
} from './admin-withdrawal.dto.js';
import {
  AdminWithdrawalRepository,
  type RequestRow,
} from './admin-withdrawal.repository.js';
import { WithdrawalNotifier } from './withdrawal-notifier.js';

type Decision = 'DaDuyet' | 'TuChoi';

/** Kết quả CÓ KIỂU của phần ghi: tình huống nghiệp vụ trả kết quả thay vì ném trong giao dịch; service đổi sang `AppException` SAU giao dịch (nếp B5, B11). */
type DecideOutcome =
  | { kind: 'Decided'; result: WithdrawalDecided }
  | { kind: 'NotFound' }
  | { kind: 'AlreadyHandled'; trangThai: string };

const notFound = () => new AppException(404, 'KHONG_TIM_THAY');

function toItem(row: RequestRow): AdminWithdrawalItem {
  return {
    maYeuCau: row.maYeuCau,
    benhNhan: { hoTen: row.hoTen },
    soTien: row.soTien,
    trangThai: row.trangThai,
    thoiDiemYeuCau: row.thoiDiemYeuCau.toISOString(),
    thoiDiemXuLy: row.thoiDiemXuLy?.toISOString() ?? null,
  };
}

/**
 * Quản trị viên `ToanHeThong` xem, duyệt, từ chối yêu cầu rút tiền (payment B12; PLAN 5.8, 5.3, 5.11 #10, #11; 2.4 XRT b1 đến b7; XRT-01…XRT-12, DTT-09, TDT-05, TDT-08).
 *
 * Duyệt hay từ chối là MỘT giao dịch, khoá theo hạng 7a → 7b:
 *  1. khoá yêu cầu (7a): không có ⇒ 404; không còn `ChoDuyet` ⇒ 409 `YEU_CAU_DA_XU_LY` (hai Quản trị viên cùng lúc: bên sau chờ khoá rồi thấy trạng thái đã đổi nên chỉ một bên thắng);
 *  2. khoá ví (7b);
 *  3. duyệt: `ledger.debit('Rut')` (giảm `so_du` và `so_tien_dang_giu` cùng số, ghi sổ cái âm); từ chối: `ledger.release` (chỉ giảm số đang giữ, KHÔNG có dòng sổ cái);
 *  4. đặt `DaDuyet`/`TuChoi` kèm người và thời điểm xử lý → nhật ký `DuyetRutTien`/`TuChoiRutTien` → thông báo cho Bệnh nhân.
 * Nhật ký hay thông báo lỗi thì ném, cả giao dịch hoàn tác (ví và yêu cầu không đổi). `ghiChu` không có cột: đi vào thông báo và `chi_tiet_thay_doi.ly_do` (L11).
 */
@Injectable()
export class AdminWithdrawalService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AdminWithdrawalRepository)
    private readonly repository: AdminWithdrawalRepository,
    @Inject(WalletLedger) private readonly ledger: WalletLedger,
    @Inject(WithdrawalNotifier) private readonly notifier: WithdrawalNotifier,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: AdminWithdrawalsQuery): Promise<AdminWithdrawalsPage> {
    const em = this.db.manager;
    const [page, counts] = await Promise.all([
      this.repository.list(em, {
        trangThai: query.trangThai,
        limit: query.kichThuoc,
        offset: query.offset,
      }),
      this.repository.countByStatus(em),
    ]);
    return {
      items: page.rows.map(toItem),
      total: page.total,
      trang: query.trang,
      kichThuoc: query.kichThuoc,
      demTheoTrangThai: {
        tatCa: counts.ChoDuyet + counts.DaDuyet + counts.TuChoi,
        choDuyet: counts.ChoDuyet,
        daDuyet: counts.DaDuyet,
        tuChoi: counts.TuChoi,
      },
    };
  }

  async detail(maYeuCau: string): Promise<AdminWithdrawalDetail> {
    const em = this.db.manager;
    const row = await this.repository.findOne(em, maYeuCau);
    if (row === null) throw notFound();
    const [balance, entries] = await Promise.all([
      this.repository.readWalletBalance(em, row.viNoiBoId),
      this.repository.recentLedger(em, row.viNoiBoId),
    ]);
    return {
      ...toItem(row),
      soDuHienTai: balance.soDu,
      soTienDangGiu: balance.soTienDangGiu,
      giaoDichGanDay: entries.map((entry) => ({
        thoiDiem: entry.thoiDiem.toISOString(),
        loai: entry.loai,
        soTien: entry.soTien,
      })),
    };
  }

  approve(adminId: string, maYeuCau: string, ghiChu?: string) {
    return this.decide(adminId, maYeuCau, 'DaDuyet', ghiChu);
  }

  reject(adminId: string, maYeuCau: string, ghiChu?: string) {
    return this.decide(adminId, maYeuCau, 'TuChoi', ghiChu);
  }

  private async decide(
    adminId: string,
    maYeuCau: string,
    decision: Decision,
    ghiChu: string | undefined,
  ): Promise<WithdrawalDecided> {
    const outcome = await withBookingTransaction<DecideOutcome>(
      this.db,
      async (em) => {
        const request = await this.repository.lockRequest(em, maYeuCau);
        if (request === null) return { kind: 'NotFound' };
        if (request.trangThai !== 'ChoDuyet')
          return { kind: 'AlreadyHandled', trangThai: request.trangThai };
        const wallet = await this.ledger.lockWalletById(em, request.viNoiBoId);
        // Yêu cầu luôn có ví (khoá ngoại): thiếu là dữ liệu hỏng (500)
        if (wallet === null) throw new Error('Yêu cầu rút không có hàng ví');
        const now = toSecond(nowVN());
        if (decision === 'DaDuyet') {
          const debited = await this.ledger.debit(em, wallet, {
            loai: 'Rut',
            soTien: request.soTien,
            ref: { yeuCauRutTienId: maYeuCau },
            now,
          });
          // `Rut` tiêu từ số đang giữ nên không có "không đủ"; nhánh này chỉ để thoả kiểu
          if (debited.kind !== 'Ok')
            throw new Error('Duyệt rút không thể thiếu số dư');
        } else {
          await this.ledger.release(em, wallet, request.soTien);
        }
        await this.repository.markHandled(em, {
          maYeuCau,
          trangThai: decision,
          nguoiXuLyId: adminId,
          now,
        });
        // Danh sách trắng của nhật ký: chỉ trạng thái, số tiền và lý do (không dữ liệu cá nhân)
        const base = {
          actorId: adminId,
          branchId: null,
          targetType: 'yeu_cau_rut_tien',
          targetId: maYeuCau,
          result: 'ThanhCong',
        } as const;
        const facts = {
          truoc: { trang_thai: 'ChoDuyet' },
          so_tien: request.soTien,
          ...(ghiChu === undefined ? {} : { ly_do: ghiChu }),
        } as const;
        if (decision === 'DaDuyet')
          await this.audit.record(em, {
            ...base,
            action: 'DuyetRutTien',
            changes: { ...facts, sau: { trang_thai: 'DaDuyet' } },
          });
        else
          await this.audit.record(em, {
            ...base,
            action: 'TuChoiRutTien',
            changes: { ...facts, sau: { trang_thai: 'TuChoi' } },
          });
        const notice = {
          benhNhanId: request.benhNhanId,
          soTien: request.soTien,
          now,
          ghiChu,
        };
        if (decision === 'DaDuyet')
          await this.notifier.notifyApproved(em, notice);
        else await this.notifier.notifyRejected(em, notice);
        return { kind: 'Decided', result: { maYeuCau, trangThai: decision } };
      },
      {
        label:
          decision === 'DaDuyet' ? 'approve-withdrawal' : 'reject-withdrawal',
      },
    );

    switch (outcome.kind) {
      case 'Decided':
        return outcome.result;
      case 'NotFound':
        throw notFound();
      case 'AlreadyHandled':
        throw new AppException(
          409,
          WALLET_ERROR_CODES.WITHDRAWAL_ALREADY_HANDLED,
          {
            thongBao: WALLET_ERROR_MESSAGES.YEU_CAU_DA_XU_LY,
            chiTiet: { trangThai: outcome.trangThai },
          },
        );
    }
  }
}
