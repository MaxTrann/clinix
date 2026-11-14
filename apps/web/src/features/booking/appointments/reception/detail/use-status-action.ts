import {
  useStatusAction as useCommonStatusAction,
  type StatusActionState as CommonStatusActionState,
} from '../../common/use-status-action';
import { changeReceptionStatus } from '../api/reception-status-api';
import type {
  StatusChangeBody,
  StatusChangeResult,
} from '../api/reception-appointment-types';
import { describeStatusFailure } from './status-failure';

// Máy trạng thái của ba thao tác của Lễ tân (hủy, vắng mặt, tiếp đón; booking F9, TRACKING 3.30 F9-G). Máy CHUNG đã chuyển lên `common/use-status-action.ts` ở F10 (override
// của Quản trị viên dùng lại); file này chỉ nối nó với route của Lễ tân (`changeReceptionStatus`) và câu lỗi của Lễ tân (`describeStatusFailure`). Một lần gọi `submit` = một POST;
// không bao giờ tự gửi lại. Các trạng thái `idle`, `submitting`, `failed`, `stopped`, `done`: xem `common/use-status-action.ts`.
export type StatusActionState = CommonStatusActionState<StatusChangeResult>;

interface UseStatusActionOptions {
  maLichHen: string;
  // Thành công (200): nơi gọi tải lại chi tiết và danh sách, đóng hộp, báo kết quả
  onSucceeded: (result: StatusChangeResult) => void;
  // Lỗi làm dữ liệu đang hiện lệch máy chủ (409, 404…): nơi gọi tải lại chi tiết (và danh sách) cho nút khớp lại
  onStale: (scope: 'detail' | 'detailAndList') => void;
}

export function useStatusAction(options: UseStatusActionOptions) {
  return useCommonStatusAction<StatusChangeBody, StatusChangeResult>({
    ...options,
    perform: changeReceptionStatus,
    describe: (error, body) => describeStatusFailure(error, body.trangThai),
  });
}

export type StatusActionController = ReturnType<typeof useStatusAction>;
