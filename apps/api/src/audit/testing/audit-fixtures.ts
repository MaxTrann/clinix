import type { AuditEntry } from '../audit-entry.js';

// Payload nhỏ chỉ dành test cơ chế C2, không thay acceptance các B-task.
export function auditEntries(actorId = '1', branchId = '2'): AuditEntry[] {
  const common = { actorId, targetId: '3', result: 'ThanhCong' as const };
  return [
    {
      ...common,
      branchId,
      action: 'TaoTaiKhoanNhanSu',
      targetType: 'tai_khoan',
      changes: { loai_tai_khoan: 'LeTan', chi_nhanh_id: branchId },
    },
    {
      ...common,
      branchId: null,
      action: 'KhoaTaiKhoan',
      targetType: 'tai_khoan',
      changes: {
        truoc: { trang_thai: 'DangHoatDong' },
        sau: { trang_thai: 'NgungHoatDong' },
        phien_thu_hoi: 2,
      },
    },
    {
      ...common,
      branchId: null,
      action: 'MoKhoaTaiKhoan',
      targetType: 'tai_khoan',
      changes: {
        truoc: { trang_thai: 'NgungHoatDong' },
        sau: { trang_thai: 'DangHoatDong' },
        phien_thu_hoi: 0,
      },
    },
    {
      ...common,
      branchId: null,
      action: 'MoKhoaNoShow',
      targetType: 'benh_nhan',
      changes: {
        truoc: { khoa_dat_lich_do_no_show: true },
        sau: { khoa_dat_lich_do_no_show: false },
        so_lan_no_show: 3,
      },
    },
    {
      ...common,
      branchId,
      action: 'DoiChiNhanhBacSi',
      targetType: 'tai_khoan',
      changes: {
        truoc: { chi_nhanh_id: '4' },
        sau: { chi_nhanh_id: branchId },
      },
    },
    {
      ...common,
      branchId,
      action: 'DuyetThayDoiChiNhanh',
      targetType: 'yeu_cau_thay_doi_chi_nhanh',
      changes: {
        hieu_luc_tu: '2026-11-04T08:00:00+07:00',
        so_ngay_bao_truoc: 3,
        nguoi_de_xuat_id: actorId,
        so_lich_hen_anh_huong: 0,
        so_ca_anh_huong: 1,
      },
    },
    {
      ...common,
      branchId,
      action: 'TuChoiThayDoiChiNhanh',
      targetType: 'yeu_cau_thay_doi_chi_nhanh',
      changes: { ly_do_tu_choi: 'Chưa phù hợp', nguoi_de_xuat_id: actorId },
    },
    {
      ...common,
      branchId,
      action: 'RutThayDoiChiNhanh',
      targetType: 'yeu_cau_thay_doi_chi_nhanh',
      changes: { nguoi_de_xuat_id: actorId },
    },
    {
      ...common,
      branchId,
      action: 'HuyThayDoiChiNhanh',
      targetType: 'yeu_cau_thay_doi_chi_nhanh',
      changes: {
        ly_do_huy: 'Điều chỉnh kế hoạch',
        hieu_luc_tu: '2026-11-04T08:00:00+07:00',
        qua_han: false,
        so_benh_nhan_da_bao: 0,
      },
    },
    {
      ...common,
      branchId,
      action: 'DoiHieuLucThayDoiChiNhanh',
      targetType: 'yeu_cau_thay_doi_chi_nhanh',
      changes: {
        truoc: { hieu_luc_tu: '2026-11-04T08:00:00+07:00' },
        sau: { hieu_luc_tu: '2026-11-05T08:00:00+07:00' },
        so_lan_doi_hieu_luc: 1,
        so_benh_nhan_thong_bao_lai: 0,
      },
    },
    {
      ...common,
      branchId: null,
      targetId: '1',
      action: 'CapNhatCauHinh',
      targetType: 'cau_hinh_he_thong',
      changes: {
        truoc: { check_in_truoc_phut: 30 },
        sau: { check_in_truoc_phut: 45 },
        ly_do: 'Điều chỉnh cấu hình',
      },
    },
  ];
}
