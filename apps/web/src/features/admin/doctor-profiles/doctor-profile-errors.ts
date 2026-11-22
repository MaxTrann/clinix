import { errorMessageFor } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { parseBlockingList } from './doctor-profile-format';
import type { BlockingList, DoctorProfileInput } from './doctor-profile-types';

// Lỗi khi LƯU hồ sơ bác sĩ (B13) sang chữ trên màn hình (admin F7). Chọn câu theo MÃ (`maLoi`, `loi[].ma`), không theo `thongBao`.
// Câu lấy nguyên văn PLAN 5.9 khi có; còn lại [đề xuất].

export type ProfileField = keyof DoctorProfileInput;

export interface SaveFailure {
  /** Câu chung ở đầu form */
  message: string;
  /** Lỗi gắn vào từng ô */
  fields: Partial<Record<ProfileField, string>>;
  /** Có khi bị chặn đổi chi nhánh hay dịch vụ chính (BS A2) */
  blocking: BlockingList | null;
  /** Bác sĩ không còn hay ra ngoài phạm vi: đóng panel, tải lại danh sách */
  notFound: boolean;
  /** Mất mạng, hết hạn chờ: chưa rõ đã lưu chưa */
  unknownResult: boolean;
}

const BUSINESS: Record<string, string> = {
  KHONG_DU_QUYEN: 'Bạn không có quyền thực hiện thao tác này.',
  KHONG_TIM_THAY: 'Không tìm thấy dữ liệu.',
  KHONG_CO_THAY_DOI: 'Không có thay đổi nào để lưu.',
  DOI_CHI_NHANH_BI_CHAN:
    'Không thể đổi chi nhánh: bác sĩ còn lịch hẹn đang hoạt động hoặc ca làm việc từ hôm nay trở đi tại chi nhánh hiện tại.',
  DOI_DICH_VU_CHINH_BI_CHAN:
    'Không thể đổi dịch vụ khám chính: bác sĩ còn lịch hẹn đang hoạt động hoặc ca làm việc từ hôm nay trở đi tại chi nhánh hiện tại.',
};

// Lỗi nghiệp vụ gắn thẳng vào một ô
const BUSINESS_FIELD: Record<string, [ProfileField, string]> = {
  CHUC_DANH_HOC_VI_KHONG_TUONG_THICH: [
    'hocVi',
    'Chức danh và học vị không tương thích.',
  ],
  DICH_VU_KHONG_O_CHI_NHANH: [
    'dichVuKhamId',
    'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.',
  ],
};

// Mã trường của 400 DU_LIEU_KHONG_HOP_LE (dùng chung với tạo nhân sự B15)
const FIELD_CODES: Record<string, string> = {
  CHUYEN_KHOA_KHONG_HOP_LE:
    'Chuyên khoa không tồn tại hoặc đã ngừng hoạt động.',
  CHI_NHANH_KHONG_HOP_LE: 'Chi nhánh không hợp lệ.',
  DICH_VU_KHAM_ID_KHONG_HOP_LE: 'Vui lòng chọn dịch vụ khám chính.',
  CHUC_DANH_KHONG_HOP_LE: 'Vui lòng chọn chức danh.',
  HOC_VI_KHONG_HOP_LE: 'Vui lòng chọn học vị.',
  SO_NAM_KINH_NGHIEM_KHONG_HOP_LE:
    'Số năm kinh nghiệm là số nguyên từ 0 đến 60.',
  MO_TA_CHUYEN_MON_KHONG_HOP_LE: 'Giới thiệu tối đa 5.000 ký tự.',
};

const PROFILE_FIELDS: readonly ProfileField[] = [
  'chuyenKhoaId',
  'chiNhanhId',
  'dichVuKhamId',
  'chucDanh',
  'hocVi',
  'soNamKinhNghiem',
  'moTaChuyenMon',
];
const isProfileField = (value: string): value is ProfileField =>
  (PROFILE_FIELDS as readonly string[]).includes(value);
const lookup = (table: Record<string, string>, key: string) =>
  Object.hasOwn(table, key) ? table[key] : undefined;

export function describeSaveFailure(error: unknown): SaveFailure {
  const base: SaveFailure = {
    message: errorMessageFor(error),
    fields: {},
    blocking: null,
    notFound: false,
    unknownResult: false,
  };
  if (error instanceof NetworkError || error instanceof TimeoutError)
    return {
      ...base,
      message:
        'Chưa rõ hồ sơ đã được lưu hay chưa. Hãy tải lại hồ sơ để xem dữ liệu hiện tại.',
      unknownResult: true,
    };
  if (!(error instanceof ApiError)) return base;

  if (Object.hasOwn(BUSINESS_FIELD, error.maLoi)) {
    const [field, text] = BUSINESS_FIELD[error.maLoi] as [ProfileField, string];
    return { ...base, message: text, fields: { [field]: text } };
  }
  if (error.maLoi === 'DU_LIEU_KHONG_HOP_LE') {
    const fields: SaveFailure['fields'] = {};
    for (const item of error.loi ?? []) {
      const text = lookup(FIELD_CODES, item.ma);
      if (text !== undefined && isProfileField(item.truong))
        fields[item.truong] = text;
    }
    return {
      ...base,
      message: 'Vui lòng kiểm tra lại các trường được đánh dấu.',
      fields,
    };
  }
  const text = lookup(BUSINESS, error.maLoi);
  return {
    ...base,
    message: text ?? base.message,
    blocking: error.status === 409 ? parseBlockingList(error.chiTiet) : null,
    notFound: error.status === 404 || error.maLoi === 'KHONG_TIM_THAY',
  };
}
