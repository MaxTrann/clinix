import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Paged } from '../../common/paging/paged.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import { parseVnDateTime } from '../../appointments/slots/slot-lock.js';
import {
  readNotificationStatuses,
  type BranchChangeNotificationStatus,
  type EmailDeliveryStatus,
} from '../../notification/branch-change-email.query.js';
import { BRANCH_CHANGE_EVENTS } from '../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../notification/branch-change-notifier.js';
import { joinWithinLimit } from '../../notification/branch-change-text.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { capped, type Capped } from '../branches/branch.service.js';
import {
  BranchImpactService,
  type AffectedAppointment,
  type AffectedShift,
  type FreeSlotOutside,
} from '../branches/impact/branch-impact.service.js';
import type { TrangThaiYeuCauThayDoiChiNhanh } from '../entities/enums.js';
import { SystemConfigService } from '../system-config/system-config.service.js';
import type { BranchChangeRequestListDto } from './branch-change-request.dto.js';
import {
  BranchChangeRequestRepository,
  type LockedRequest,
  type RequestDetailRow,
  type RequestRow,
} from './branch-change-request.repository.js';
import {
  changedDaysOf,
  impactInputOf,
  parseRequestContent,
  type DayChangeView,
} from './request-content.js';
import { formatVN, humanTime } from './request-time.js';

// Yêu cầu thay đổi chi nhánh: xem, từ chối (admin B9) và duyệt (admin B10); PLAN admin 5.3, 5.4; Q2, Q4, Q5, Q9, Q40, Q46, Q48.
// Phạm vi kiểm ở backend: Quản trị viên Chi nhánh chỉ thấy yêu cầu của chi nhánh mình (ngoài phạm vi ⇒ 404), chỉ Toàn hệ thống được từ chối hay duyệt (⇒ 403).

export interface PersonRef {
  taiKhoanId: string;
  hoTen: string;
}
export interface ServiceRef {
  dichVuKhamId: string;
  /** `null` khi dịch vụ không còn trong danh mục */
  ten: string | null;
}

export interface BranchChangeRequestListItem {
  yeuCauThayDoiChiNhanhId: string;
  chiNhanh: { chiNhanhId: string; ten: string };
  nguoiDeXuat: PersonRef;
  trangThai: TrangThaiYeuCauThayDoiChiNhanh;
  thoiDiemTao: string;
  thoiDiemDuyet: string | null;
  /** "dự kiến có hiệu lực" (Q48) */
  hieuLucTu: string | null;
  /** "đã áp dụng lúc" (Q48) */
  apDungLuc: string | null;
  quaHanLuc: string | null;
  thuThayDoi: number[];
  coDoiDichVu: boolean;
}

/**
 * Nguồn của danh sách ảnh hưởng (Trung chốt 22/11/2026):
 * - `TinhLai`: `ChoDuyet` tính tại bây giờ; `DaDuyet` chưa áp dụng (kể cả quá hạn) tính tại `hieu_luc_tu`, như điều kiện job áp dụng (B11).
 * - `BanChup`: đã áp dụng hoặc `DaHuy`: bảng chụp lúc duyệt (chỉ có lịch hẹn; bảng không lưu ca và khung giờ).
 * - `KhongCo`: `TuChoi`, `DaRut`: thay đổi không bao giờ có hiệu lực.
 * - `KhongTinhDuoc`: nội dung dạng cũ `gio_mo_cua`/`gio_dong_cua` (quy tắc 43), không tính lại được.
 */
export type ImpactSource = 'TinhLai' | 'BanChup' | 'KhongCo' | 'KhongTinhDuoc';

export interface RequestImpactView {
  nguon: ImpactSource;
  /** Mốc tính ('YYYY-MM-DD HH:mm:ss' giờ VN); chỉ có khi `TinhLai` */
  moc: string | null;
  lichHen: Capped<AffectedAppointment> | null;
  ca: Capped<AffectedShift> | null;
  khungGioTrong: Capped<FreeSlotOutside> | null;
}

export interface BranchChangeRequestDetail extends BranchChangeRequestListItem {
  nguoiDuyet: PersonRef | null;
  lyDoTuChoi: string | null;
  soNgayBaoTruoc: number | null;
  nguoiHuy: PersonRef | null;
  thoiDiemHuy: string | null;
  lyDoHuy: string | null;
  soLanDoiHieuLuc: number;
  /** Phần ĐANG CHỜ (hoặc đã chờ) duyệt. Tên, địa chỉ, toạ độ không có ở đây: B8 đã lưu ngay, không vào yêu cầu (Q2). */
  noiDung: {
    lichHoatDong: DayChangeView[];
    dichVu: null | {
      truoc: ServiceRef[];
      sau: ServiceRef[];
      them: ServiceRef[];
      bo: ServiceRef[];
    };
  };
  anhHuong: RequestImpactView;
  /** Trạng thái thông báo và thư (Q9). `DaGui` = SMTP đã nhận, không phải người nhận đã đọc. Không có chữ lỗi kỹ thuật (giữ như C4). */
  thongBao: {
    tongHop: Record<EmailDeliveryStatus, number>;
    items: BranchChangeNotificationStatus[];
  };
}

/** Hai yêu cầu cùng lúc, hay yêu cầu đã được duyệt/từ chối/rút trước đó: không còn ở trạng thái chờ duyệt. */
export const NOT_PENDING = 'YEU_CAU_KHONG_CON_CHO_DUYET';
/** `hieuLucTu` sớm hơn mốc sớm nhất (PLAN 5.9, CN-51). `chiTiet.mocSomNhat` để giao diện ghi "phải từ {mốc} trở đi". */
export const TOO_EARLY = 'HIEU_LUC_QUA_SOM';
/** [đề xuất mã] Nội dung dạng cũ `gio_mo_cua`/`gio_dong_cua` (quy tắc 43): không tính được ảnh hưởng, B11 cũng không áp dụng được. */
export const LEGACY_CONTENT = 'NOI_DUNG_YEU_CAU_KHONG_HOP_LE';

const DAY_MS = 24 * 60 * 60 * 1000;
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

@Injectable()
export class BranchChangeRequestService {
  constructor(
    @Inject(BranchChangeRequestRepository)
    private readonly requests: BranchChangeRequestRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
    @Inject(BranchImpactService) private readonly impact: BranchImpactService,
    @Inject(BranchChangeNotifier)
    private readonly notifier: BranchChangeNotifier,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(SystemConfigService) private readonly config: SystemConfigService,
  ) {}

  // `async` để lỗi kiểm trang trả qua promise bị từ chối như lỗi DB (như B12)
  async list(
    scope: AdminScope,
    input: BranchChangeRequestListDto,
  ): Promise<Paged<BranchChangeRequestListItem>> {
    if (!Number.isSafeInteger(input.offset) || input.offset < 0)
      throw new AppException(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
      });
    const page = await this.requests.list(
      input,
      this.policy.branchFilter(scope, input.chiNhanhId),
    );
    return { ...page, items: page.items.map((row) => this.toListItem(row)) };
  }

  /** Không có hay ngoài phạm vi ⇒ cùng 404 `KHONG_TIM_THAY` (Q40). */
  async get(scope: AdminScope, id: string): Promise<BranchChangeRequestDetail> {
    const detail = await this.requests.readTransaction((manager) =>
      this.readDetail(manager, id, this.policy.branchFilter(scope)),
    );
    if (!detail) throw new AppException(404, 'KHONG_TIM_THAY');
    return detail;
  }

  /**
   * Từ chối (CN A2; PLAN 5.4): MỘT giao dịch — khoá yêu cầu → phải `ChoDuyet` → `TuChoi` có điều kiện → thông báo + thư cho NGƯỜI ĐỀ XUẤT
   * (bệnh nhân không nhận gì) → audit `TuChoiThayDoiChiNhanh`. Ghi thông báo hay audit lỗi ⇒ hoàn tác cả quyết định. Thư gửi sau, ở worker:
   * gửi lỗi không hoàn tác quyết định (CN-62). Cho phép tự từ chối yêu cầu của chính mình (Q4).
   */
  async reject(
    scope: AdminScope,
    actorId: string,
    id: string,
    lyDo: string,
  ): Promise<BranchChangeRequestDetail> {
    this.policy.assertToanHeThong(scope);
    await this.requests.writeTransaction(async (manager) => {
      const request = await this.requests.lockForUpdate(manager, id);
      if (!request) throw new AppException(404, 'KHONG_TIM_THAY');
      if (request.trangThai !== 'ChoDuyet')
        throw new AppException(409, NOT_PENDING);
      const now = toSecond(nowVN());
      // Đã khoá hàng nên luôn đổi đúng 1 dòng; vẫn kiểm để không bao giờ báo "đã từ chối" khi DB không đổi
      const changed = await this.requests.markRejected(manager, {
        id,
        nguoiDuyetId: actorId,
        lyDo,
        now,
      });
      if (changed !== 1) throw new AppException(409, NOT_PENDING);
      await this.notifier.notify(manager, {
        yeuCauId: id,
        taiKhoanId: request.nguoiDeXuatId,
        event: { type: BRANCH_CHANGE_EVENTS.RESULT },
        // [đề xuất] (Trung chốt 22/11/2026), đối chiếu Figma 689:2 ở F6b/X1. Thư in tên chi nhánh ở bảng, chi tiết là câu này.
        noiDung: `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} gửi lúc ${humanTime(request.thoiDiemTao)} đã bị từ chối. Lý do: ${lyDo}.`,
        now,
      });
      await this.audit.record(manager, {
        actorId,
        branchId: request.chiNhanhId,
        action: 'TuChoiThayDoiChiNhanh',
        targetType: 'yeu_cau_thay_doi_chi_nhanh',
        targetId: id,
        result: 'ThanhCong',
        changes: {
          ly_do_tu_choi: lyDo,
          nguoi_de_xuat_id: request.nguoiDeXuatId,
        },
      });
    });
    return this.get(scope, id);
  }

  /**
   * Duyệt (CN b7–b9; PLAN 5.4): MỘT giao dịch — khoá yêu cầu → phải `ChoDuyet` → chụp số ngày báo trước → kiểm `hieuLucTu` → khoá khung giờ
   * → tính ảnh hưởng tại `hieuLucTu` → `DaDuyet` có điều kiện → bản chụp → thông báo + thư (mỗi bệnh nhân một, người đề xuất một) → audit.
   * Còn lịch hay ca bị ảnh hưởng vẫn duyệt (Q48 = B): danh sách để báo bệnh nhân; B11 mới quyết áp dụng hay quá hạn. Dữ liệu chi nhánh KHÔNG đổi.
   * Cho phép tự duyệt yêu cầu của chính mình (Q4). Lỗi ở bất kỳ bước nào ⇒ hoàn tác hết (kể cả thông báo); thư gửi sau, lỗi gửi không hoàn tác (A4).
   */
  async approve(
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
      if (request.trangThai !== 'ChoDuyet')
        throw new AppException(409, NOT_PENDING);
      // Chụp MỘT lần: cấu hình đổi sau này không làm sai yêu cầu đã duyệt (CH-17)
      const soNgayBaoTruoc = (await this.config.getOrThrow())
        .soNgayBaoTruocDoiGioLam;
      const now = toSecond(nowVN());
      this.assertEffectiveTime(now, soNgayBaoTruoc, hieuLucTu);

      const content = parseRequestContent(
        request.noiDungTruoc,
        request.noiDungSau,
      );
      if (content.coDangCu) throw new AppException(409, LEGACY_CONTENT);
      const input = impactInputOf(content);
      // Khoá khung giờ TRƯỚC khi đọc lịch hẹn (như B8): booking khoá khung giờ rồi mới hỏi cổng chặn (Q6), nên lịch hẹn đặt chen vào hoặc
      // phải chờ giao dịch này (rồi bị chặn), hoặc đã commit trước và có trong bản chụp. Bỏ dịch vụ thì thứ nào trong tuần cũng có thể bị ảnh hưởng.
      const days =
        input.removedServiceIds.length > 0
          ? [...ALL_DAYS]
          : input.changedDays.map((day) => day.thuTrongTuan);
      await this.impact.lockSlotsOfDays(
        manager,
        request.chiNhanhId,
        hieuLucTu,
        days,
      );
      const impact = await this.impact.compute(manager, {
        chiNhanhId: request.chiNhanhId,
        tuLuc: hieuLucTu,
        ...input,
      });

      const changed = await this.requests.markApproved(manager, {
        id,
        nguoiDuyetId: actorId,
        now,
        soNgayBaoTruoc,
        hieuLucTu,
      });
      if (changed !== 1) throw new AppException(409, NOT_PENDING);
      await this.requests.insertSnapshot(manager, id, impact.lichHen);

      await this.notifyPatients(manager, {
        request,
        hieuLucTuText,
        appointments: impact.lichHen,
        now,
      });
      await this.notifier.notify(manager, {
        yeuCauId: id,
        taiKhoanId: request.nguoiDeXuatId,
        event: { type: BRANCH_CHANGE_EVENTS.RESULT },
        // [đề xuất] (Trung chốt 22/11/2026), đối chiếu Figma 689:2 ở F6b/X1
        noiDung: `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} gửi lúc ${humanTime(request.thoiDiemTao)} đã được duyệt, dự kiến có hiệu lực từ ${humanTime(hieuLucTuText)}.`,
        now,
      });
      await this.audit.record(manager, {
        actorId,
        branchId: request.chiNhanhId,
        action: 'DuyetThayDoiChiNhanh',
        targetType: 'yeu_cau_thay_doi_chi_nhanh',
        targetId: id,
        result: 'ThanhCong',
        changes: {
          // Audit đòi ISO có độ lệch; giờ VN cố định +07:00
          hieu_luc_tu: `${hieuLucTuText.replace(' ', 'T')}+07:00`,
          so_ngay_bao_truoc: soNgayBaoTruoc,
          nguoi_de_xuat_id: request.nguoiDeXuatId,
          so_lich_hen_anh_huong: impact.lichHen.length,
          so_ca_anh_huong: impact.ca.length,
        },
      });
    });
    return this.get(scope, id);
  }

  /**
   * Q5 và quyết định Trung chốt 22/11/2026: `hieuLucTu >= lúc duyệt + n ngày` (như CHECK DB) VÀ `hieuLucTu > lúc duyệt`,
   * để thông báo luôn tạo TRƯỚC hiệu lực kể cả khi n = 0 (CN-50). Giờ VN cố định +07:00 nên n ngày = n × 24 giờ, khớp `DATE_ADD … DAY` của CHECK.
   */
  private assertEffectiveTime(
    now: Date,
    soNgayBaoTruoc: number,
    hieuLucTu: Date,
  ): void {
    const earliest = new Date(
      Math.max(now.getTime() + soNgayBaoTruoc * DAY_MS, now.getTime() + 1000),
    );
    if (hieuLucTu.getTime() < earliest.getTime())
      throw new AppException(400, TOO_EARLY, {
        thongBao: `Thời điểm có hiệu lực phải từ ${humanTime(formatVN(earliest))} trở đi.`,
        chiTiet: { mocSomNhat: formatVN(earliest) },
      });
  }

  /**
   * Gom lịch hẹn ảnh hưởng theo `benh_nhan_id` (CN-52, CN-53): mỗi bệnh nhân MỘT thông báo + thư, liệt kê mã lịch hẹn theo thời gian.
   * Phiên bản sự kiện = số lần dời hiệu lực + 1 (lúc duyệt luôn là `v1`), để B22 báo lại được mà không trùng khoá UNIQUE của C4.
   */
  private async notifyPatients(
    manager: EntityManager,
    input: {
      request: LockedRequest;
      hieuLucTuText: string;
      appointments: readonly AffectedAppointment[];
      now: Date;
    },
  ): Promise<void> {
    const patientOf = await this.requests.patientsOf(
      manager,
      input.appointments.map((a) => a.lichHenId),
    );
    // `appointments` đã sắp theo thời gian (B8) nên mã lịch hẹn của mỗi người cũng theo thời gian
    const codesByPatient = new Map<string, string[]>();
    for (const appointment of input.appointments) {
      const patientId = patientOf.get(appointment.lichHenId);
      if (patientId === undefined) continue;
      const codes = codesByPatient.get(patientId) ?? [];
      codes.push(appointment.maLichHen);
      codesByPatient.set(patientId, codes);
    }
    for (const [patientId, codes] of codesByPatient)
      await this.notifier.notify(manager, {
        yeuCauId: input.request.yeuCauThayDoiChiNhanhId,
        taiKhoanId: patientId,
        event: {
          type: BRANCH_CHANGE_EVENTS.AFFECTED,
          version: input.request.soLanDoiHieuLuc + 1,
        },
        // [đề xuất] (Trung chốt 22/11/2026), đối chiếu Figma 690:2 ở F6b/X1
        noiDung: joinWithinLimit(
          `Chi nhánh ${input.request.tenChiNhanh} thay đổi lịch hoạt động từ ${humanTime(input.hieuLucTuText)}. Lịch hẹn bị ảnh hưởng:`,
          codes,
        ),
        now: input.now,
      });
  }

  private toListItem(row: RequestRow): BranchChangeRequestListItem {
    const sau = parseRequestContent({}, row.noiDungSau);
    return {
      yeuCauThayDoiChiNhanhId: row.yeuCauThayDoiChiNhanhId,
      chiNhanh: { chiNhanhId: row.chiNhanhId, ten: row.tenChiNhanh },
      nguoiDeXuat: { taiKhoanId: row.nguoiDeXuatId, hoTen: row.tenNguoiDeXuat },
      trangThai: row.trangThai,
      thoiDiemTao: row.thoiDiemTao,
      thoiDiemDuyet: row.thoiDiemDuyet,
      hieuLucTu: row.hieuLucTu,
      apDungLuc: row.apDungLuc,
      quaHanLuc: row.quaHanLuc,
      thuThayDoi: changedDaysOf(sau),
      coDoiDichVu: sau.dichVu !== null,
    };
  }

  private async readDetail(
    manager: EntityManager,
    id: string,
    branchId: string | undefined,
  ): Promise<BranchChangeRequestDetail | null> {
    const row = await this.requests.get(manager, id, branchId);
    if (!row) return null;
    const content = parseRequestContent(row.noiDungTruoc, row.noiDungSau);
    const statuses = await readNotificationStatuses(manager, id);
    const tongHop: Record<EmailDeliveryStatus, number> = {
      ChoGui: 0,
      DaGui: 0,
      ThatBai: 0,
      BoQua: 0,
    };
    for (const status of statuses)
      if (status.trangThaiEmail !== null) tongHop[status.trangThaiEmail] += 1;
    const person = (taiKhoanId: string | null, hoTen: string | null) =>
      taiKhoanId === null ? null : { taiKhoanId, hoTen: hoTen ?? '' };
    return {
      ...this.toListItem(row),
      nguoiDuyet: person(row.nguoiDuyetId, row.tenNguoiDuyet),
      lyDoTuChoi: row.lyDoTuChoi,
      soNgayBaoTruoc: row.soNgayBaoTruoc,
      nguoiHuy: person(row.nguoiHuyId, row.tenNguoiHuy),
      thoiDiemHuy: row.thoiDiemHuy,
      lyDoHuy: row.lyDoHuy,
      soLanDoiHieuLuc: row.soLanDoiHieuLuc,
      noiDung: {
        lichHoatDong: content.lichHoatDong,
        dichVu: await this.serviceView(manager, content.dichVu),
      },
      anhHuong: await this.impactOf(manager, row, content),
      thongBao: { tongHop, items: statuses },
    };
  }

  private async serviceView(
    manager: EntityManager,
    services: { truoc: string[]; sau: string[] } | null,
  ): Promise<BranchChangeRequestDetail['noiDung']['dichVu']> {
    if (services === null) return null;
    const names = await this.requests.serviceNames(manager, [
      ...new Set([...services.truoc, ...services.sau]),
    ]);
    const ref = (dichVuKhamId: string): ServiceRef => ({
      dichVuKhamId,
      ten: names.get(dichVuKhamId) ?? null,
    });
    const before = new Set(services.truoc);
    const after = new Set(services.sau);
    return {
      truoc: services.truoc.map(ref),
      sau: services.sau.map(ref),
      them: services.sau.filter((s) => !before.has(s)).map(ref),
      bo: services.truoc.filter((s) => !after.has(s)).map(ref),
    };
  }

  private async impactOf(
    manager: EntityManager,
    row: RequestDetailRow,
    content: ReturnType<typeof parseRequestContent>,
  ): Promise<RequestImpactView> {
    const none = (nguon: ImpactSource): RequestImpactView => ({
      nguon,
      moc: null,
      lichHen: null,
      ca: null,
      khungGioTrong: null,
    });
    const pendingApproval = row.trangThai === 'ChoDuyet';
    const approvedNotApplied =
      row.trangThai === 'DaDuyet' && row.apDungLuc === null;
    if (pendingApproval || approvedNotApplied) {
      if (content.coDangCu) return none('KhongTinhDuoc');
      const tuLuc =
        approvedNotApplied && row.hieuLucTuDate !== null
          ? row.hieuLucTuDate
          : toSecond(nowVN());
      const impact = await this.impact.compute(manager, {
        chiNhanhId: row.chiNhanhId,
        tuLuc,
        ...impactInputOf(content),
      });
      return {
        nguon: 'TinhLai',
        moc: formatVN(tuLuc),
        lichHen: capped(impact.lichHen),
        ca: capped(impact.ca),
        khungGioTrong: capped(impact.khungGioTrong),
      };
    }
    if (row.trangThai === 'DaDuyet' || row.trangThai === 'DaHuy')
      return {
        ...none('BanChup'),
        lichHen: capped(
          await this.requests.snapshot(manager, row.yeuCauThayDoiChiNhanhId),
        ),
      };
    return none('KhongCo');
  }
}
