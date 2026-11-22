import { Inject, Injectable } from '@nestjs/common';
import { parseVnDateTime } from '../../appointments/slots/slot-lock.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { skipPendingChangeNotices } from '../../notification/branch-change-email.query.js';
import {
  BRANCH_CHANGE_EVENTS,
  CHANGE_NOTICE_TYPES,
} from '../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../notification/branch-change-notifier.js';
import { joinWithinLimit } from '../../notification/branch-change-text.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { BranchImpactService } from '../branches/impact/branch-impact.service.js';
import { SystemConfigService } from '../system-config/system-config.service.js';
import { BranchChangeRequestRepository } from './branch-change-request.repository.js';
import {
  BranchChangeRequestService,
  LEGACY_CONTENT,
  assertEffectiveTime,
  codesByPatientOf,
  daysToLock,
  type BranchChangeRequestDetail,
} from './branch-change-request.service.js';
import { impactInputOf, parseRequestContent } from './request-content.js';
import { humanTime } from './request-time.js';

// Dời hiệu lực yêu cầu thay đổi chi nhánh QUÁ HẠN (admin B22; PLAN admin 5.4 "Dời hiệu lực"; Q48, H21).
// Job B11 đánh dấu quá hạn khi đến `hieu_luc_tu` mà còn lịch, ca chưa xử lý, rồi KHÔNG bao giờ tự áp dụng muộn: lối thoát là dời (ở đây) hoặc hủy (B21).
// Dời xong `qua_han_luc` về NULL nên job tính lại ở mốc mới; quá hạn lần nữa thì cảnh báo mang phiên bản mới (`:v{so_lan_doi_hieu_luc + 1}`, B11).

/** Chỉ dời được yêu cầu đang quá hạn chờ xử lý (PLAN 5.9, CN-102). */
export const NOT_OVERDUE = 'YEU_CAU_KHONG_QUA_HAN';

@Injectable()
export class BranchChangeRescheduleService {
  constructor(
    @Inject(BranchChangeRequestRepository)
    private readonly requests: BranchChangeRequestRepository,
    @Inject(BranchChangeRequestService)
    private readonly details: BranchChangeRequestService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(BranchImpactService) private readonly impact: BranchImpactService,
    @Inject(BranchChangeNotifier)
    private readonly notifier: BranchChangeNotifier,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SystemConfigService) private readonly config: SystemConfigService,
  ) {}

  /**
   * MỘT giao dịch: khoá yêu cầu → phải quá hạn → kiểm mốc mới với N = lớn hơn giữa số ngày đã chụp và cấu hình hiện hành → khoá khung giờ
   * → tính lại ảnh hưởng tại mốc mới → dời có điều kiện → thay bản chụp → dừng thư báo thay đổi còn chờ (TRƯỚC khi xếp thư mới)
   * → báo bệnh nhân (danh sách mới VÀ người đã được báo trước đó, Trung chốt 22/11/2026) → báo người đề xuất → audit.
   * Lỗi ở bất kỳ bước nào ⇒ hoàn tác hết. Hai lần dời đồng thời: khoá hàng, bên sau thấy `qua_han_luc` NULL ⇒ 409 (CN-103).
   */
  async reschedule(
    scope: AdminScope,
    actorId: string,
    id: string,
    hieuLucTuText: string,
  ): Promise<BranchChangeRequestDetail> {
    this.policy.assertToanHeThong(scope);
    const hieuLucTu = parseVnDateTime(hieuLucTuText);
    await this.requests.writeTransaction(async (manager) => {
      const request = await this.requests.lockForUpdate(manager, id);
      if (!request) throw new AppException(404, 'KHONG_TIM_THAY');
      const overdue =
        request.trangThai === 'DaDuyet' &&
        request.apDungLuc === null &&
        request.quaHanLuc !== null;
      if (!overdue) throw new AppException(409, NOT_OVERDUE);

      // Thiếu cấu hình ⇒ `HE_THONG_CHUA_CAU_HINH` (getOrThrow). Lấy lớn hơn để không báo trước ít hơn đã hứa lúc duyệt, cũng không ít hơn quy định hiện hành.
      const configured = (await this.config.getOrThrow())
        .soNgayBaoTruocDoiGioLam;
      const soNgay = Math.max(request.soNgayBaoTruoc ?? 0, configured);
      const now = toSecond(nowVN());
      assertEffectiveTime(now, soNgay, hieuLucTu);

      const content = parseRequestContent(
        request.noiDungTruoc,
        request.noiDungSau,
      );
      if (content.coDangCu) throw new AppException(409, LEGACY_CONTENT);
      const input = impactInputOf(content);
      await this.impact.lockSlotsOfDays(
        manager,
        request.chiNhanhId,
        hieuLucTu,
        daysToLock(input),
      );
      const impact = await this.impact.compute(manager, {
        chiNhanhId: request.chiNhanhId,
        tuLuc: hieuLucTu,
        ...input,
      });
      // Đọc TRƯỚC khi ghi thông báo mới: những bệnh nhân đã nhận báo thay đổi (lúc duyệt hay lần dời trước)
      const notifiedBefore = await this.requests.notifiedAccounts(
        manager,
        id,
        CHANGE_NOTICE_TYPES,
      );

      if (
        (await this.requests.markRescheduled(manager, { id, hieuLucTu })) !== 1
      )
        throw new AppException(409, NOT_OVERDUE);
      const version = request.soLanDoiHieuLuc + 1;
      await this.requests.replaceSnapshot(manager, id, impact.lichHen);
      await skipPendingChangeNotices(manager, id);

      const moc = humanTime(hieuLucTuText);
      const codesByPatient = await codesByPatientOf(
        this.requests,
        manager,
        impact.lichHen,
      );
      // [đề xuất] chữ (đối chiếu Figma ở F6b/X1)
      const recipients = new Map<string, string>();
      for (const [patientId, codes] of codesByPatient)
        recipients.set(
          patientId,
          joinWithinLimit(
            `Chi nhánh ${request.tenChiNhanh} dời thời điểm dự kiến thay đổi lịch hoạt động sang ${moc}. Lịch hẹn bị ảnh hưởng:`,
            codes,
          ),
        );
      // Người đã được báo nhưng nay hết bị ảnh hưởng: thư cũ có thể đã tới (H21), nên báo để họ không làm theo thông tin cũ
      for (const patientId of notifiedBefore)
        if (!recipients.has(patientId))
          recipients.set(
            patientId,
            `Chi nhánh ${request.tenChiNhanh} dời thời điểm dự kiến thay đổi lịch hoạt động sang ${moc}. Lịch hẹn của bạn không còn bị ảnh hưởng.`,
          );
      for (const [taiKhoanId, noiDung] of recipients)
        await this.notifier.notify(manager, {
          yeuCauId: id,
          taiKhoanId,
          event: { type: BRANCH_CHANGE_EVENTS.RESCHEDULED, version },
          noiDung,
          now,
        });
      await this.notifier.notify(manager, {
        yeuCauId: id,
        taiKhoanId: request.nguoiDeXuatId,
        event: { type: BRANCH_CHANGE_EVENTS.RESCHEDULE_RESULT, version },
        noiDung: `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} gửi lúc ${humanTime(request.thoiDiemTao)} đã được dời, dự kiến có hiệu lực từ ${moc}.`,
        now,
      });

      // Audit đòi ISO có độ lệch; giờ VN cố định +07:00
      const iso = (text: string) => `${text.replace(' ', 'T')}+07:00`;
      await this.audit.record(manager, {
        actorId,
        branchId: request.chiNhanhId,
        action: 'DoiHieuLucThayDoiChiNhanh',
        targetType: 'yeu_cau_thay_doi_chi_nhanh',
        targetId: id,
        result: 'ThanhCong',
        changes: {
          truoc: { hieu_luc_tu: iso(request.hieuLucTu ?? '') },
          sau: { hieu_luc_tu: iso(hieuLucTuText) },
          so_lan_doi_hieu_luc: version,
          so_benh_nhan_thong_bao_lai: recipients.size,
        },
      });
    });
    return this.details.get(scope, id);
  }
}
