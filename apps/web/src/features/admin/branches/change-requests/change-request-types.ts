import type {
  AffectedAppointment,
  AffectedShift,
  Capped,
  FreeSlotOutside,
} from '../branch-types';

// Kiểu dữ liệu của API yêu cầu thay đổi chi nhánh (admin B9, B10, B21, B22) cho màn F6b. Khớp `branch-change-request.service.ts` phía API.

export type ChangeRequestStatus =
  'ChoDuyet' | 'DaDuyet' | 'TuChoi' | 'DaRut' | 'DaHuy';

export interface PersonRef {
  taiKhoanId: string;
  hoTen: string;
}

export interface ServiceRef {
  dichVuKhamId: string;
  /** `null` khi dịch vụ không còn trong danh mục */
  ten: string | null;
}

export interface ChangeRequestListItem {
  yeuCauThayDoiChiNhanhId: string;
  chiNhanh: { chiNhanhId: string; ten: string };
  nguoiDeXuat: PersonRef;
  trangThai: ChangeRequestStatus;
  /** 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam (mọi thời điểm dưới đây cùng dạng) */
  thoiDiemTao: string;
  thoiDiemDuyet: string | null;
  /** "dự kiến có hiệu lực" (Q48) */
  hieuLucTu: string | null;
  /** "đã áp dụng lúc" (Q48); `null` = chưa áp dụng */
  apDungLuc: string | null;
  quaHanLuc: string | null;
  thuThayDoi: number[];
  coDoiDichVu: boolean;
  /** Người đang xem là người gửi (máy chủ tính từ phiên): chỉ khi đó mới hiện nút Rút */
  laCuaToi: boolean;
}

export interface PeriodView {
  batDau: string;
  ketThuc: string;
}

export interface DayView {
  hoatDong: boolean | null;
  sang: PeriodView | null;
  chieu: PeriodView | null;
  /** Chỉ có ở yêu cầu cũ lưu dạng giờ mở / giờ đóng (quy tắc 43) */
  dangCu?: { gioMoCua: string | null; gioDongCua: string | null };
}

export interface DayChangeView {
  thuTrongTuan: number;
  truoc: DayView | null;
  sau: DayView | null;
}

/** Nguồn danh sách ảnh hưởng (B9): tính lại ở thời điểm xem, bản chụp lúc duyệt, không có, hay không tính được (dạng cũ) */
export type ImpactSource = 'TinhLai' | 'BanChup' | 'KhongCo' | 'KhongTinhDuoc';

export type EmailDeliveryStatus = 'ChoGui' | 'DaGui' | 'ThatBai' | 'BoQua';

export interface NotificationStatus {
  thongBaoId: string;
  taiKhoanId: string;
  loaiSuKien: string;
  /** `null` = thông báo chỉ trong ứng dụng, không có thư */
  trangThaiEmail: EmailDeliveryStatus | null;
  soLanThu: number;
  daGuiLuc: string | null;
}

export interface ChangeRequestDetail extends ChangeRequestListItem {
  nguoiDuyet: PersonRef | null;
  lyDoTuChoi: string | null;
  soNgayBaoTruoc: number | null;
  nguoiHuy: PersonRef | null;
  thoiDiemHuy: string | null;
  lyDoHuy: string | null;
  soLanDoiHieuLuc: number;
  noiDung: {
    lichHoatDong: DayChangeView[];
    dichVu: null | {
      truoc: ServiceRef[];
      sau: ServiceRef[];
      them: ServiceRef[];
      bo: ServiceRef[];
    };
  };
  anhHuong: {
    nguon: ImpactSource;
    moc: string | null;
    lichHen: Capped<AffectedAppointment> | null;
    ca: Capped<AffectedShift> | null;
    khungGioTrong: Capped<FreeSlotOutside> | null;
  };
  thongBao: {
    tongHop: Record<EmailDeliveryStatus, number>;
    items: NotificationStatus[];
  };
}
