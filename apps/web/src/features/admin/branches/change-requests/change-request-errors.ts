import { ApiError } from '../../../../shared/api/errors';
import { errorMessageFor } from '../../../../shared/api/error-message';
import { humanTime } from './change-request-format';

// Mã lỗi của thao tác trên yêu cầu thay đổi chi nhánh ⇒ khối lỗi trong hộp thoại (câu chữ PLAN admin 5.9, phần ngoài 5.9 ghi [đề xuất]).

export interface DialogError {
  title: string;
  message: string;
}

const NOT_CONFIGURED: DialogError = {
  title: 'Hệ thống chưa được cấu hình',
  // Câu của Figma 546:2
  message:
    'Vui lòng thiết lập "Số ngày báo trước đổi giờ làm" trong Cài đặt hệ thống trước khi duyệt yêu cầu này.',
};

export const NOT_CONFIGURED_ERROR = NOT_CONFIGURED;

export function requestActionError(error: unknown): DialogError {
  if (!(error instanceof ApiError))
    return { title: 'Chưa thực hiện được', message: errorMessageFor(error) };
  switch (error.maLoi) {
    case 'HE_THONG_CHUA_CAU_HINH':
      return NOT_CONFIGURED;
    case 'HIEU_LUC_QUA_SOM': {
      const earliest = (error.chiTiet as { mocSomNhat?: unknown } | undefined)
        ?.mocSomNhat;
      return {
        title: 'Thời điểm quá sớm',
        message:
          typeof earliest === 'string'
            ? `Thời điểm có hiệu lực phải từ ${humanTime(earliest)} trở đi.`
            : 'Thời điểm có hiệu lực chưa đủ số ngày báo trước.',
      };
    }
    case 'YEU_CAU_KHONG_CON_CHO_DUYET':
      return {
        title: 'Yêu cầu đã được xử lý',
        message:
          'Yêu cầu không còn ở trạng thái chờ duyệt. Đóng hộp thoại để xem trạng thái mới.',
      };
    case 'YEU_CAU_KHONG_THE_RUT_HUY':
      return {
        title: 'Yêu cầu đã thay đổi trạng thái',
        message:
          'Yêu cầu không còn ở trạng thái cho phép rút/hủy. Đóng hộp thoại để xem trạng thái mới.',
      };
    case 'YEU_CAU_KHONG_QUA_HAN':
      return {
        title: 'Yêu cầu không còn quá hạn',
        message:
          'Chỉ dời hiệu lực được với yêu cầu đang quá hạn chờ xử lý. Đóng hộp thoại để xem trạng thái mới.',
      };
    case 'NOI_DUNG_YEU_CAU_KHONG_HOP_LE':
      return {
        title: 'Không xử lý được',
        message: 'Yêu cầu lưu ở dạng cũ, không duyệt hay dời hiệu lực được.',
      };
    case 'LY_DO_BAT_BUOC':
      return {
        title: 'Thiếu lý do',
        message: 'Vui lòng nhập lý do (tối đa 255 ký tự).',
      };
    case 'HIEU_LUC_KHONG_HOP_LE':
      return {
        title: 'Thời điểm không hợp lệ',
        message: 'Vui lòng chọn đầy đủ ngày và giờ.',
      };
    case 'KHONG_DU_QUYEN':
      return {
        title: 'Không đủ quyền',
        message: 'Bạn không có quyền thực hiện thao tác này.',
      };
    case 'KHONG_TIM_THAY':
      return {
        title: 'Không tìm thấy',
        message: 'Yêu cầu không còn tồn tại hoặc nằm ngoài phạm vi của bạn.',
      };
    default:
      return { title: 'Chưa thực hiện được', message: errorMessageFor(error) };
  }
}
