import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError } from '../../../shared/api/errors';

// `message` là banner của form và CHỈ dành cho lỗi không gắn ô nào; lỗi đã gắn ô (`fields`) thì `message` rỗng để không hiện hai lần
// (admin PR2 mục 6.2). Form vẽ banner khi `message` khác rỗng; nơi cần một câu bằng mọi giá (xóa nhóm) phải tự có câu dự phòng.
export interface FormFeedback {
  message: string;
  fields: Record<string, string>;
}

const FIELD_MESSAGES: Record<string, string> = {
  TEN_NHOM_DICH_VU_KHONG_HOP_LE: 'Tên nhóm cần có từ 1 đến 100 ký tự.',
  THU_TU_HIEN_THI_KHONG_HOP_LE: 'Thứ tự phải là số nguyên không âm.',
  NHOM_DICH_VU_ID_KHONG_HOP_LE: 'Vui lòng chọn nhóm dịch vụ hợp lệ.',
  TEN_DICH_VU_KHONG_HOP_LE: 'Tên dịch vụ cần có từ 1 đến 100 ký tự.',
  THOI_LUONG_KHONG_HOP_LE: 'Thời lượng phải là số nguyên dương.',
  // Web chỉ gửi số nguyên đồng và API (từ PR3) cũng từ chối phần lẻ, nên câu này khớp luật ở cả hai phía (TRACKING admin 8.1)
  GIA_MAC_DINH_KHONG_HOP_LE: 'Giá phải là số nguyên đồng lớn hơn 0.',
};

const FIELD_LABELS: Record<string, string> = {
  ten: 'ten',
  thuTuHienThi: 'thuTuHienThi',
  nhomDichVuId: 'nhomDichVuId',
  thoiLuong: 'thoiLuong',
  giaMacDinh: 'giaMacDinh',
};

export function feedbackFor(error: unknown): FormFeedback {
  if (!(error instanceof ApiError))
    return { message: errorMessageFor(error), fields: {} };

  const fields: Record<string, string> = {};
  for (const item of error.loi ?? []) {
    const field = FIELD_LABELS[item.truong];
    const message = FIELD_MESSAGES[item.ma];
    if (field && message) fields[field] = message;
  }

  switch (error.maLoi) {
    case 'TEN_NHOM_DICH_VU_TRUNG':
      fields.ten = 'Tên nhóm dịch vụ đã tồn tại.';
      return { message: '', fields };
    case 'NHOM_DICH_VU_CON_DICH_VU':
      return {
        message:
          'Không thể xóa nhóm đang có dịch vụ. Hãy chuyển dịch vụ sang nhóm khác trước.',
        fields,
      };
    case 'TEN_DICH_VU_TRUNG':
      fields.ten = 'Tên dịch vụ đã tồn tại trong nhóm này.';
      return { message: '', fields };
    case 'NHOM_DICH_VU_KHONG_TON_TAI':
      fields.nhomDichVuId =
        'Nhóm dịch vụ không còn tồn tại. Hãy chọn nhóm khác.';
      return { message: '', fields };
    case 'THOI_LUONG_DANG_DUNG':
      fields.thoiLuong =
        'Không thể đổi thời lượng vì dịch vụ đang được lịch hẹn hoặc khung giờ sử dụng.';
      return { message: '', fields };
    case 'DU_LIEU_KHONG_HOP_LE':
      // Có ô nhận ra được thì chỉ báo dưới ô; không ô nào thì banner chung là chỗ duy nhất còn lại để báo
      return {
        message: Object.keys(fields).length
          ? ''
          : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
        fields,
      };
    default:
      if (error.status === 403)
        return {
          message: 'Bạn không có quyền thực hiện thao tác này.',
          fields,
        };
      if (error.status === 404)
        return {
          message: 'Dữ liệu không còn tồn tại. Hãy tải lại danh sách.',
          fields,
        };
      return { message: 'Không lưu được dữ liệu. Vui lòng thử lại.', fields };
  }
}
