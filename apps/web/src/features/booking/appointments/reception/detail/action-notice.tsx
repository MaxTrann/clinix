import type { RefObject } from 'react';
import { ActionNotice as CommonActionNotice } from '../../common/action-notice';
import { refundResultLine } from '../../common/refund-text';
import type { StatusChangeResult } from '../api/reception-appointment-types';
import { ACTION_TEXT } from './detail-messages';
import type { StatusActionState } from './use-status-action';

// Vùng thông báo kết quả trong ngăn chi tiết của Lễ tân (booking F9; TRACKING 3.30 F9-H, F9-I). Khung (thành công, lỗi, `Tải lại chi tiết`) đã chuyển lên
// `common/action-notice.tsx` ở F10; file này chỉ dựng nội dung thành công của ba thao tác: "Đã hủy lịch hẹn." kèm số hoàn THỰC TẾ (chuỗi của máy chủ, không tính ở client),
// "Đã ghi nhận vắng mặt.", "Đã tiếp đón bệnh nhân.".
const SUCCESS_TEXT = {
  DaHuy: ACTION_TEXT.cancel.done,
  VangMat: ACTION_TEXT.noShow.done,
  DaTiepDon: ACTION_TEXT.checkIn.done,
} as const;

function SuccessLines({ result }: { result: StatusChangeResult }) {
  return (
    <>
      <p className="font-medium">{SUCCESS_TEXT[result.trangThai]}</p>
      {result.trangThai === 'DaHuy' && (
        <p className="pt-1">{refundResultLine(result.hoanCoc)}</p>
      )}
    </>
  );
}

export function ActionNotice({
  state,
  noticeRef,
  onReload,
}: {
  state: StatusActionState;
  noticeRef: RefObject<HTMLDivElement | null>;
  onReload: () => void;
}) {
  return (
    <CommonActionNotice
      state={state}
      noticeRef={noticeRef}
      onReload={onReload}
      renderSuccess={(result) => <SuccessLines result={result} />}
    />
  );
}
