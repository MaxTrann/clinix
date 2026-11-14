import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../auth/entities/enums.js';
import type {
  PhamViQuanTri,
  TrangThaiLichHen,
} from '../admin/entities/enums.js';

type ConfigValue = number | number[];
type AccountState = { trang_thai: TrangThaiTaiKhoan };
type AppointmentState = { trang_thai: TrangThaiLichHen };
type BranchState = { chi_nhanh_id: string };
type EffectiveState = { hieu_luc_tu: string };
type ShiftName = 'CaSang' | 'CaChieu';
// Danh sách trắng cho yêu cầu nghỉ phép: không có lý do của Bác sĩ (Q34); ca = null khi nghỉ cả ngày.
type LeaveRequestFacts = {
  bac_si_id: string;
  ngay_bat_dau: string;
  ngay_ket_thuc: string;
  ca: ShiftName | null;
};

interface ChangeMap {
  TaoTaiKhoanNhanSu: {
    loai_tai_khoan: Exclude<LoaiTaiKhoan, 'BenhNhan'>;
    chi_nhanh_id: string | null;
    pham_vi?: PhamViQuanTri;
  };
  KhoaTaiKhoan: {
    truoc: AccountState;
    sau: AccountState;
    phien_thu_hoi: number;
  };
  MoKhoaTaiKhoan: {
    truoc: AccountState;
    sau: AccountState;
    phien_thu_hoi: number;
  };
  MoKhoaNoShow: {
    truoc: { khoa_dat_lich_do_no_show: true };
    sau: { khoa_dat_lich_do_no_show: false };
    so_lan_no_show: number;
  };
  DoiChiNhanhBacSi: { truoc: BranchState; sau: BranchState };
  DuyetThayDoiChiNhanh: {
    hieu_luc_tu: string;
    so_ngay_bao_truoc: number;
    nguoi_de_xuat_id: string;
    so_lich_hen_anh_huong: number;
    so_ca_anh_huong: number;
  };
  TuChoiThayDoiChiNhanh: { ly_do_tu_choi: string; nguoi_de_xuat_id: string };
  RutThayDoiChiNhanh: { nguoi_de_xuat_id: string };
  HuyThayDoiChiNhanh: {
    ly_do_huy: string;
    hieu_luc_tu: string;
    qua_han: boolean;
    so_benh_nhan_da_bao: number;
  };
  DoiHieuLucThayDoiChiNhanh: {
    truoc: EffectiveState;
    sau: EffectiveState;
    so_lan_doi_hieu_luc: number;
    so_benh_nhan_thong_bao_lai: number;
  };
  CapNhatCauHinh: {
    truoc: Record<string, ConfigValue | null>;
    sau: Record<string, ConfigValue>;
    ly_do: string;
  };
  PhanCongLichLamViec: {
    tu_ngay: string;
    den_ngay: string;
    thu_trong_tuan: number[];
    ca: ShiftName[];
    so_ca: number;
  };
  GoLichLamViec: {
    bac_si_id: string;
    ngay: string;
    ca: ShiftName;
    so_khung_gio: number;
  };
  DuyetNghiPhep: LeaveRequestFacts;
  TuChoiNghiPhep: LeaveRequestFacts & { ly_do_tu_choi: string };
  // Quản trị viên override trạng thái lịch hẹn (booking B14, Q24): chỉ trạng thái trước và sau cùng lý do của Admin (1–255);
  // không tên, SĐT, email bệnh nhân; khung giờ, số hoàn, no-show là hệ quả suy ra nên không ghi.
  OverrideLichHen: {
    truoc: AppointmentState;
    sau: AppointmentState;
    ly_do: string;
  };
}

export type AuditAction = keyof ChangeMap;

// Bảng tra đối tượng theo hành động: mỗi hành động một dòng (thêm hành động mới mà quên dòng ở đây
// thì tsc báo lỗi vì TargetFor<A> không tìm được khoá). Thay cho chuỗi điều kiện lồng nhau trước đây,
// vốn rơi mặc định về 'yeu_cau_thay_doi_chi_nhanh' nên hành động mới dễ bị gán sai đối tượng.
interface TargetMap {
  TaoTaiKhoanNhanSu: 'tai_khoan';
  KhoaTaiKhoan: 'tai_khoan';
  MoKhoaTaiKhoan: 'tai_khoan';
  MoKhoaNoShow: 'benh_nhan';
  DoiChiNhanhBacSi: 'tai_khoan';
  DuyetThayDoiChiNhanh: 'yeu_cau_thay_doi_chi_nhanh';
  TuChoiThayDoiChiNhanh: 'yeu_cau_thay_doi_chi_nhanh';
  RutThayDoiChiNhanh: 'yeu_cau_thay_doi_chi_nhanh';
  HuyThayDoiChiNhanh: 'yeu_cau_thay_doi_chi_nhanh';
  DoiHieuLucThayDoiChiNhanh: 'yeu_cau_thay_doi_chi_nhanh';
  CapNhatCauHinh: 'cau_hinh_he_thong';
  PhanCongLichLamViec: 'tai_khoan';
  GoLichLamViec: 'lich_lam_viec';
  DuyetNghiPhep: 'yeu_cau_nghi_phep';
  TuChoiNghiPhep: 'yeu_cau_nghi_phep';
  OverrideLichHen: 'lich_hen';
}
type TargetFor<A extends AuditAction> = TargetMap[A];

// Discriminated union giữ action/target/payload khớp nhau ngay khi consumer viết mã.
export type AuditEntry = {
  [A in AuditAction]: {
    actorId: string;
    branchId: string | null;
    action: A;
    targetType: TargetFor<A>;
    targetId: string;
    result: 'ThanhCong' | 'ThatBai';
    changes: ChangeMap[A];
  };
}[AuditAction];
