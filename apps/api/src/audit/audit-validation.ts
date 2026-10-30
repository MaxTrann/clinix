import { isISO8601 } from 'class-validator';
import { TRANG_THAI_TAI_KHOAN } from '../auth/entities/enums.js';
import type { AuditEntry } from './audit-entry.js';
import { AuditError } from './audit-error.js';
import { copyAuditJson } from './audit-json.js';

const BIGINT_MAX = 9223372036854775807n;
const CONFIG_KEYS = [
  'thoi_gian_giu_cho',
  'thoi_diem_nhac_lich',
  'so_lich_hen_toi_da_moi_ho_so',
  'so_lan_tu_doi_lich_toi_da',
  'check_in_truoc_phut',
  'check_in_sau_phut',
  'thoi_han_phan_hoi_loi_moi',
  'so_muc_cho_toi_da',
  'nguong_no_show',
  'so_ngay_bao_truoc_doi_gio_lam',
  'trong_so_w1',
  'trong_so_w2',
] as const;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new AuditError('AUDIT_ENTRY_INVALID');
}
function object(value: unknown): asserts value is Record<string, unknown> {
  requireValid(
    value !== null && typeof value === 'object' && !Array.isArray(value),
  );
}
function fields(
  value: unknown,
  required: string[],
  optional: string[] = [],
): asserts value is Record<string, unknown> {
  object(value);
  requireValid(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every(
        (key) => required.includes(key) || optional.includes(key),
      ),
  );
}
function id(value: unknown): asserts value is string {
  requireValid(
    typeof value === 'string' &&
      /^[1-9]\d{0,18}$/.test(value) &&
      BigInt(value) <= BIGINT_MAX,
  );
}
function count(value: unknown): void {
  requireValid(Number.isSafeInteger(value) && Number(value) >= 0);
}
function reason(value: unknown): void {
  requireValid(typeof value === 'string' && value.trim().length > 0);
}
function timestamp(value: unknown): asserts value is string {
  requireValid(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        value,
      ) &&
      isISO8601(value, { strict: true, strictSeparator: true }) &&
      Number.isFinite(Date.parse(value)),
  );
}
function snapshots(
  changes: Record<string, unknown>,
  key: string,
): { before: unknown; after: unknown } {
  fields(changes.truoc, [key]);
  fields(changes.sau, [key]);
  return { before: changes.truoc[key], after: changes.sau[key] };
}

function configValue(key: string, value: unknown): void {
  if (key === 'thoi_diem_nhac_lich') {
    requireValid(
      Array.isArray(value) &&
        value.every((n: unknown) => Number.isSafeInteger(n) && Number(n) > 0) &&
        new Set(value).size === value.length,
    );
  } else {
    requireValid(typeof value === 'number' && Number.isFinite(value));
    if (key !== 'trong_so_w1' && key !== 'trong_so_w2')
      requireValid(Number.isSafeInteger(value));
  }
}
function configChanges(changes: unknown): void {
  fields(changes, ['truoc', 'sau', 'ly_do']);
  object(changes.truoc);
  object(changes.sau);
  reason(changes.ly_do);
  const keys = Object.keys(changes.truoc).sort();
  requireValid(
    keys.length > 0 &&
      JSON.stringify(keys) === JSON.stringify(Object.keys(changes.sau).sort()),
  );
  for (const key of keys) {
    requireValid(CONFIG_KEYS.some((allowed) => allowed === key));
    const before = changes.truoc[key];
    const after = changes.sau[key];
    if (before !== null) configValue(key, before);
    configValue(key, after);
    requireValid(JSON.stringify(before) !== JSON.stringify(after));
  }
}

function validateChanges(entry: Record<string, unknown>): void {
  const changes = entry.changes;
  const branch = entry.branchId;
  switch (entry.action) {
    case 'TaoTaiKhoanNhanSu': {
      requireValid(entry.targetType === 'tai_khoan');
      fields(changes, ['loai_tai_khoan', 'chi_nhanh_id'], ['pham_vi']);
      requireValid(
        typeof changes.loai_tai_khoan === 'string' &&
          ['BacSi', 'LeTan', 'QuanTriVien'].includes(changes.loai_tai_khoan) &&
          changes.chi_nhanh_id === branch,
      );
      if (changes.loai_tai_khoan === 'QuanTriVien') {
        requireValid(
          changes.pham_vi === (branch === null ? 'ToanHeThong' : 'ChiNhanh'),
        );
      } else {
        id(branch);
        requireValid(!Object.hasOwn(changes, 'pham_vi'));
      }
      break;
    }
    case 'KhoaTaiKhoan':
    case 'MoKhoaTaiKhoan': {
      requireValid(entry.targetType === 'tai_khoan');
      fields(changes, ['truoc', 'sau', 'phien_thu_hoi']);
      const { before, after } = snapshots(changes, 'trang_thai');
      requireValid(
        TRANG_THAI_TAI_KHOAN.some((value) => value === before) &&
          TRANG_THAI_TAI_KHOAN.some((value) => value === after),
      );
      count(changes.phien_thu_hoi);
      break;
    }
    case 'MoKhoaNoShow': {
      requireValid(entry.targetType === 'benh_nhan' && branch === null);
      fields(changes, ['truoc', 'sau', 'so_lan_no_show']);
      const { before, after } = snapshots(changes, 'khoa_dat_lich_do_no_show');
      requireValid(before === true && after === false);
      count(changes.so_lan_no_show);
      break;
    }
    case 'DoiChiNhanhBacSi': {
      requireValid(entry.targetType === 'tai_khoan');
      id(branch);
      fields(changes, ['truoc', 'sau']);
      const { before, after } = snapshots(changes, 'chi_nhanh_id');
      id(before);
      id(after);
      requireValid(before !== after && after === branch);
      break;
    }
    case 'CapNhatCauHinh':
      requireValid(
        entry.targetType === 'cau_hinh_he_thong' &&
          entry.targetId === '1' &&
          branch === null,
      );
      configChanges(changes);
      break;
    case 'DuyetThayDoiChiNhanh':
      requireValid(entry.targetType === 'yeu_cau_thay_doi_chi_nhanh');
      id(branch);
      fields(changes, [
        'hieu_luc_tu',
        'so_ngay_bao_truoc',
        'nguoi_de_xuat_id',
        'so_lich_hen_anh_huong',
        'so_ca_anh_huong',
      ]);
      timestamp(changes.hieu_luc_tu);
      id(changes.nguoi_de_xuat_id);
      count(changes.so_ngay_bao_truoc);
      count(changes.so_lich_hen_anh_huong);
      count(changes.so_ca_anh_huong);
      break;
    case 'TuChoiThayDoiChiNhanh':
      requireValid(entry.targetType === 'yeu_cau_thay_doi_chi_nhanh');
      id(branch);
      fields(changes, ['ly_do_tu_choi', 'nguoi_de_xuat_id']);
      reason(changes.ly_do_tu_choi);
      id(changes.nguoi_de_xuat_id);
      break;
    case 'RutThayDoiChiNhanh':
      requireValid(entry.targetType === 'yeu_cau_thay_doi_chi_nhanh');
      id(branch);
      fields(changes, ['nguoi_de_xuat_id']);
      id(changes.nguoi_de_xuat_id);
      break;
    case 'HuyThayDoiChiNhanh':
      requireValid(entry.targetType === 'yeu_cau_thay_doi_chi_nhanh');
      id(branch);
      fields(changes, [
        'ly_do_huy',
        'hieu_luc_tu',
        'qua_han',
        'so_benh_nhan_da_bao',
      ]);
      reason(changes.ly_do_huy);
      timestamp(changes.hieu_luc_tu);
      requireValid(typeof changes.qua_han === 'boolean');
      count(changes.so_benh_nhan_da_bao);
      break;
    case 'DoiHieuLucThayDoiChiNhanh': {
      requireValid(entry.targetType === 'yeu_cau_thay_doi_chi_nhanh');
      id(branch);
      fields(changes, [
        'truoc',
        'sau',
        'so_lan_doi_hieu_luc',
        'so_benh_nhan_thong_bao_lai',
      ]);
      const { before, after } = snapshots(changes, 'hieu_luc_tu');
      timestamp(before);
      timestamp(after);
      requireValid(Date.parse(before) !== Date.parse(after));
      count(changes.so_lan_doi_hieu_luc);
      count(changes.so_benh_nhan_thong_bao_lai);
      break;
    }
    default:
      throw new AuditError('AUDIT_ACTION_UNSUPPORTED');
  }
}

export function validateAuditEntry(input: unknown): AuditEntry {
  try {
    const copy = copyAuditJson(input);
    fields(copy, [
      'actorId',
      'branchId',
      'action',
      'targetType',
      'targetId',
      'result',
      'changes',
    ]);
    id(copy.actorId);
    id(copy.targetId);
    if (copy.branchId !== null) id(copy.branchId);
    requireValid(
      typeof copy.action === 'string' &&
        (copy.result === 'ThanhCong' || copy.result === 'ThatBai'),
    );
    validateChanges(copy);
    // Chỉ cast sau khi toàn bộ union đã qua validation runtime; trả bản sao không có getter/prototype lạ.
    return copy as unknown as AuditEntry;
  } catch (error) {
    if (error instanceof AuditError) throw error;
    throw new AuditError('AUDIT_ENTRY_INVALID');
  }
}
