import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { Paged } from '../../common/paging/paged.js';
import { nowVN, toSecond } from '../../common/time/time.js';
import {
  readNotificationStatuses,
  type BranchChangeNotificationStatus,
  type EmailDeliveryStatus,
} from '../../notification/branch-change-email.query.js';
import { BRANCH_CHANGE_EVENTS } from '../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../notification/branch-change-notifier.js';
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
import type { BranchChangeRequestListDto } from './branch-change-request.dto.js';
import {
  BranchChangeRequestRepository,
  type RequestDetailRow,
  type RequestRow,
} from './branch-change-request.repository.js';
import {
  changedDaysOf,
  impactInputOf,
  parseRequestContent,
  type DayChangeView,
} from './request-content.js';

// Yêu cầu thay đổi chi nhánh: xem và từ chối (admin B9; PLAN admin 5.3, 5.4; Q2, Q4, Q9, Q40, Q46).
// Phạm vi kiểm ở backend: Quản trị viên Chi nhánh chỉ thấy yêu cầu của chi nhánh mình (ngoài phạm vi ⇒ 404), chỉ Toàn hệ thống được từ chối (⇒ 403).

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

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam (cố định +07:00, không có giờ mùa hè). */
const formatVN = (date: Date): string =>
  new Date(date.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
/** 'YYYY-MM-DD HH:mm:ss' ⇒ 'HH:mm dd/MM/yyyy' cho câu thông báo. */
const humanTime = (value: string): string => {
  const [date = '', time = ''] = value.split(' ');
  const [y, m, d] = date.split('-');
  return `${time.slice(0, 5)} ${d}/${m}/${y}`;
};

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
