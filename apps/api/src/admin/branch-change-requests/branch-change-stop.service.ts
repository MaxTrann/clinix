import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { skipPendingChangeNotices } from '../../notification/branch-change-email.query.js';
import {
  BRANCH_CHANGE_EVENTS,
  CHANGE_NOTICE_TYPES,
} from '../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../notification/branch-change-notifier.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { BranchChangeRequestRepository } from './branch-change-request.repository.js';
import {
  BranchChangeRequestService,
  type BranchChangeRequestDetail,
} from './branch-change-request.service.js';
import { humanTime } from './request-time.js';

// Dừng một yêu cầu thay đổi chi nhánh: người gửi RÚT khi còn chờ duyệt, Admin Toàn hệ thống HỦY khi đã duyệt mà chưa áp dụng (admin B21; PLAN admin 5.4; Q3, Q47; H21).
// Tách khỏi `BranchChangeRequestService` cho file gọn; dùng chung repository và trả chi tiết bằng `get` của service đó.
// Cả hai làm cột sinh `dang_mo_chi_nhanh` về NULL: chi nhánh gửi được yêu cầu mới ngay sau commit (CN-97). Dữ liệu chi nhánh không đổi.

/** Yêu cầu không còn ở trạng thái cho phép rút hay hủy (PLAN 5.9). */
export const CANNOT_STOP = 'YEU_CAU_KHONG_THE_RUT_HUY';

@Injectable()
export class BranchChangeStopService {
  constructor(
    @Inject(BranchChangeRequestRepository)
    private readonly requests: BranchChangeRequestRepository,
    @Inject(BranchChangeRequestService)
    private readonly details: BranchChangeRequestService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(BranchChangeNotifier)
    private readonly notifier: BranchChangeNotifier,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Rút (Q3; Trung chốt 22/11/2026: CHỈ người đã gửi). Thứ tự kiểm: không có hay ngoài phạm vi ⇒ 404 (Q40) → không phải người gửi ⇒ 403
   * (Admin Toàn hệ thống dùng Từ chối) → không còn `ChoDuyet` ⇒ 409. Báo mọi Admin Toàn hệ thống đang hoạt động trong ứng dụng (trừ chính người rút).
   */
  async withdraw(
    scope: AdminScope,
    actorId: string,
    id: string,
  ): Promise<BranchChangeRequestDetail> {
    await this.requests.writeTransaction(async (manager) => {
      const request = await this.requests.lockForUpdate(manager, id);
      const visible = this.policy.branchFilter(scope);
      if (!request || (visible !== undefined && request.chiNhanhId !== visible))
        throw new AppException(404, 'KHONG_TIM_THAY');
      if (request.nguoiDeXuatId !== actorId)
        throw new AppException(403, 'KHONG_DU_QUYEN');
      if (request.trangThai !== 'ChoDuyet')
        throw new AppException(409, CANNOT_STOP);
      // Đã khoá hàng nên luôn đổi đúng 1 dòng; vẫn kiểm để không bao giờ báo "đã rút" khi DB không đổi
      if ((await this.requests.markWithdrawn(manager, id)) !== 1)
        throw new AppException(409, CANNOT_STOP);
      const now = toSecond(nowVN());
      // [đề xuất] chữ (đối chiếu Figma ở F6b/X1). Chỉ trong ứng dụng (C4).
      const noiDung = `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} gửi lúc ${humanTime(request.thoiDiemTao)} đã được người gửi rút lại.`;
      for (const admin of await this.requests.activeSystemAdmins(manager))
        if (admin.taiKhoanId !== actorId)
          await this.notifier.notify(manager, {
            yeuCauId: id,
            taiKhoanId: admin.taiKhoanId,
            event: { type: BRANCH_CHANGE_EVENTS.WITHDRAWN },
            noiDung,
            now,
          });
      await this.audit.record(manager, {
        actorId,
        branchId: request.chiNhanhId,
        action: 'RutThayDoiChiNhanh',
        targetType: 'yeu_cau_thay_doi_chi_nhanh',
        targetId: id,
        result: 'ThanhCong',
        changes: { nguoi_de_xuat_id: request.nguoiDeXuatId },
      });
    });
    return this.details.get(scope, id, actorId);
  }

  /**
   * Hủy (Q47): chỉ Toàn hệ thống; yêu cầu `DaDuyet` có `ap_dung_luc IS NULL`, kể cả đã quá `hieu_luc_tu` hay đã quá hạn (CN-104). MỘT giao dịch:
   * khoá yêu cầu → `DaHuy` có điều kiện → dừng thư báo thay đổi còn chờ gửi (TRƯỚC khi xếp thư hủy) → báo bệnh nhân đã được báo và người đề xuất → audit.
   * Thư cũ đã `DaGui` (hay worker đã nhận việc) vẫn có thể tới bệnh nhân, nên luôn gửi thêm thư "đã hủy" (H21, PLAN 4.2a ý 4).
   */
  async cancel(
    scope: AdminScope,
    actorId: string,
    id: string,
    lyDo: string,
  ): Promise<BranchChangeRequestDetail> {
    this.policy.assertToanHeThong(scope);
    await this.requests.writeTransaction(async (manager) => {
      const request = await this.requests.lockForUpdate(manager, id);
      if (!request) throw new AppException(404, 'KHONG_TIM_THAY');
      if (request.trangThai !== 'DaDuyet' || request.apDungLuc !== null)
        throw new AppException(409, CANNOT_STOP);
      const now = toSecond(nowVN());
      if (
        (await this.requests.markCancelled(manager, {
          id,
          nguoiHuyId: actorId,
          lyDo,
          now,
        })) !== 1
      )
        throw new AppException(409, CANNOT_STOP);
      await skipPendingChangeNotices(manager, id);

      const hieuLucTu = request.hieuLucTu ?? '';
      const patients = await this.requests.notifiedAccounts(
        manager,
        id,
        CHANGE_NOTICE_TYPES,
      );
      // [đề xuất] chữ (Trung chốt 22/11/2026: bệnh nhân KHÔNG thấy lý do, lý do là ghi chú nội bộ; đối chiếu Figma ở F6b/X1)
      const patientText = `Thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} dự kiến có hiệu lực từ ${humanTime(hieuLucTu)} đã được hủy. Lịch hẹn của bạn giữ nguyên theo lịch hoạt động hiện tại.`;
      for (const taiKhoanId of patients)
        await this.notifier.notify(manager, {
          yeuCauId: id,
          taiKhoanId,
          event: { type: BRANCH_CHANGE_EVENTS.CANCELLED },
          noiDung: patientText,
          now,
        });
      await this.notifier.notify(manager, {
        yeuCauId: id,
        taiKhoanId: request.nguoiDeXuatId,
        event: { type: BRANCH_CHANGE_EVENTS.CANCELLED },
        noiDung: `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} gửi lúc ${humanTime(request.thoiDiemTao)} đã bị hủy. Lý do: ${lyDo}.`,
        now,
      });
      await this.audit.record(manager, {
        actorId,
        branchId: request.chiNhanhId,
        action: 'HuyThayDoiChiNhanh',
        targetType: 'yeu_cau_thay_doi_chi_nhanh',
        targetId: id,
        result: 'ThanhCong',
        changes: {
          ly_do_huy: lyDo,
          // Audit đòi ISO có độ lệch; giờ VN cố định +07:00
          hieu_luc_tu: `${hieuLucTu.replace(' ', 'T')}+07:00`,
          qua_han: request.quaHanLuc !== null,
          so_benh_nhan_da_bao: patients.length,
        },
      });
    });
    return this.details.get(scope, id, actorId);
  }
}
