import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../auth/entities/enums.js';
import type { PhamViQuanTri } from '../admin/entities/enums.js';

type ConfigValue = number | number[];
type AccountState = { trang_thai: TrangThaiTaiKhoan };
type BranchState = { chi_nhanh_id: string };
type EffectiveState = { hieu_luc_tu: string };

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
}

export type AuditAction = keyof ChangeMap;
type TargetFor<A extends AuditAction> = A extends 'CapNhatCauHinh'
  ? 'cau_hinh_he_thong'
  : A extends 'MoKhoaNoShow'
    ? 'benh_nhan'
    : A extends
          | 'TaoTaiKhoanNhanSu'
          | 'KhoaTaiKhoan'
          | 'MoKhoaTaiKhoan'
          | 'DoiChiNhanhBacSi'
      ? 'tai_khoan'
      : 'yeu_cau_thay_doi_chi_nhanh';

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
