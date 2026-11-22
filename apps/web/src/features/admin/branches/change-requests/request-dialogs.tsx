import { useId, useState, type ReactNode } from 'react';
import {
  approveChangeRequest,
  cancelChangeRequest,
  rejectChangeRequest,
  rescheduleChangeRequest,
  withdrawChangeRequest,
} from './change-request-service';
import {
  NOT_CONFIGURED_ERROR,
  requestActionError,
  type DialogError,
} from './change-request-errors';
import {
  earliestLocalInput,
  humanTime,
  toApiDateTime,
} from './change-request-format';
import type { ChangeRequestListItem } from './change-request-types';
import { RequestActionDialog } from './request-action-dialog';
import { useChangeRequestDetail } from './use-change-requests';
import styles from './change-requests.module.css';

// Hộp thoại thao tác trên yêu cầu thay đổi chi nhánh (admin F6b). Có frame: Duyệt (Figma 546:2), Từ chối (547:2). Chưa có frame (D7, chữ
// [đề xuất]): Rút, Hủy, Dời hiệu lực, ghép từ cùng khung. Kiểm ở giao diện chỉ để báo sớm; máy chủ (B9, B10, B21, B22) kiểm cuối cùng.

const REASON_MAX = 255;

interface DialogProps {
  request: ChangeRequestListItem;
  onCancel: () => void;
  /** Thao tác thành công: đóng hộp thoại và tải lại danh sách */
  onDone: (message: string) => void;
}

/**
 * Gửi một thao tác: chặn bấm lặp (`pending`), lỗi máy chủ thành khối lỗi trong hộp thoại.
 * `action` gọi API rồi trả câu báo thành công, câu đó được chuyển cho `onDone`.
 */
function useSubmit(onDone: (message: string) => void) {
  const [error, setError] = useState<DialogError | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(action: () => Promise<string>) {
    setPending(true);
    setError(null);
    try {
      onDone(await action());
    } catch (caught) {
      setError(requestActionError(caught));
      setPending(false);
    }
  }
  return { error, setError, pending, submit };
}

/**
 * Ô chọn "dự kiến có hiệu lực" dùng chung cho Duyệt và Dời hiệu lực (Q5, Q48). `soNgay`: số ngày báo trước tối thiểu để gợi ý mốc sớm nhất;
 * `null` = chưa cấu hình (Figma 546:2: báo lỗi, tắt nút); `undefined` = chưa biết (đang tải hay lỗi) ⇒ không gợi ý, vẫn cho gửi, máy chủ kiểm.
 */
function EffectiveTimeDialog({
  title,
  intro,
  label,
  confirmLabel,
  soNgay,
  now,
  onCancel,
  onDone,
  send,
}: {
  title: string;
  intro: ReactNode;
  label: string;
  confirmLabel: string;
  soNgay: number | null | undefined;
  now: Date;
  onCancel: () => void;
  onDone: (message: string) => void;
  /** Gọi API với thời điểm đã chọn ('YYYY-MM-DD HH:mm:00'), trả câu báo thành công */
  send: (hieuLucTu: string) => Promise<string>;
}) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState('');
  const { error, setError, pending, submit } = useSubmit(onDone);
  const notConfigured = soNgay === null;
  const earliest =
    typeof soNgay === 'number' ? earliestLocalInput(now, soNgay) : null;

  function confirm() {
    const hieuLucTu = toApiDateTime(value);
    if (hieuLucTu === null) {
      setError({
        title: 'Chưa chọn thời điểm',
        message: 'Vui lòng chọn thời điểm dự kiến có hiệu lực.',
      });
      return;
    }
    void submit(() => send(hieuLucTu));
  }

  return (
    <RequestActionDialog
      title={title}
      error={notConfigured ? NOT_CONFIGURED_ERROR : error}
      confirmLabel={confirmLabel}
      tone="success"
      pending={pending}
      confirmDisabled={notConfigured}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <p className={styles.dialogText}>{intro}</p>
      {!notConfigured && (
        <div className={styles.dialogField}>
          <label htmlFor={inputId}>
            {label} <span aria-hidden="true">*</span>
          </label>
          <input
            id={inputId}
            type="datetime-local"
            required
            min={earliest ?? undefined}
            value={value}
            disabled={pending}
            aria-describedby={earliest ? hintId : undefined}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              setError(null);
            }}
          />
          {earliest && (
            <small id={hintId}>
              Báo trước tối thiểu {soNgay} ngày: sớm nhất{' '}
              {humanTime(earliest.replace('T', ' '))}.
            </small>
          )}
        </div>
      )}
    </RequestActionDialog>
  );
}

/** Ô lý do bắt buộc dùng chung cho Từ chối và Hủy: trim, 1–255 ký tự (cột varchar(255), CHECK DB đòi không rỗng). */
function ReasonDialog({
  title,
  label,
  intro,
  confirmLabel,
  onCancel,
  onDone,
  send,
}: {
  title: string;
  label: string;
  intro?: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onDone: (message: string) => void;
  /** Gọi API với lý do đã trim, trả câu báo thành công */
  send: (lyDo: string) => Promise<string>;
}) {
  const inputId = useId();
  const [reason, setReason] = useState('');
  const { error, setError, pending, submit } = useSubmit(onDone);

  function confirm() {
    const lyDo = reason.trim();
    if (lyDo.length < 1 || lyDo.length > REASON_MAX) {
      setError({
        title: 'Thiếu lý do',
        message: `Vui lòng nhập lý do (tối đa ${REASON_MAX} ký tự).`,
      });
      return;
    }
    void submit(() => send(lyDo));
  }

  return (
    <RequestActionDialog
      title={title}
      error={error}
      confirmLabel={confirmLabel}
      tone="danger"
      pending={pending}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      {intro && <p className={styles.dialogText}>{intro}</p>}
      <div className={styles.dialogField}>
        <label htmlFor={inputId}>
          {label} <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={inputId}
          required
          rows={3}
          maxLength={REASON_MAX}
          placeholder="Nhập lý do..."
          value={reason}
          disabled={pending}
          aria-invalid={error !== null}
          onChange={(event) => {
            setReason(event.currentTarget.value);
            setError(null);
          }}
        />
      </div>
    </RequestActionDialog>
  );
}

type TimeDialogProps = DialogProps & {
  /** Số ngày báo trước hiện hành; `null` = chưa cấu hình; `undefined` = chưa đọc được */
  soNgayBaoTruoc: number | null | undefined;
  /** Truyền vào để test dùng đồng hồ giả */
  now: Date;
};

/** Duyệt (Figma 546:2). */
export function ApproveDialog({
  request,
  soNgayBaoTruoc,
  now,
  onCancel,
  onDone,
}: TimeDialogProps) {
  return (
    <EffectiveTimeDialog
      title="Xác nhận duyệt yêu cầu thay đổi"
      intro={
        <>
          Duyệt yêu cầu thay đổi lịch / dịch vụ của{' '}
          <b>{request.chiNhanh.ten}</b>. Bệnh nhân có lịch hẹn bị ảnh hưởng sẽ
          được thông báo ngay; thay đổi chỉ áp dụng khi đến thời điểm có hiệu
          lực.
        </>
      }
      label="Dự kiến có hiệu lực từ"
      confirmLabel="Xác nhận duyệt"
      soNgay={soNgayBaoTruoc}
      now={now}
      onCancel={onCancel}
      onDone={onDone}
      send={async (hieuLucTu) => {
        await approveChangeRequest(request.yeuCauThayDoiChiNhanhId, hieuLucTu);
        return `Đã duyệt yêu cầu của ${request.chiNhanh.ten}, dự kiến có hiệu lực từ ${humanTime(hieuLucTu)}.`;
      }}
    />
  );
}

/**
 * Dời hiệu lực yêu cầu quá hạn (Q48, [đề xuất] chưa có frame). Mốc sớm nhất = bây giờ + N, N = lớn hơn giữa số ngày đã chụp lúc duyệt
 * (đọc từ chi tiết) và cấu hình hiện hành, đúng như máy chủ kiểm (B22). Chưa đọc xong chi tiết ⇒ chưa gợi ý mốc, vẫn cho gửi.
 */
export function RescheduleDialog({
  request,
  soNgayBaoTruoc,
  now,
  onCancel,
  onDone,
}: TimeDialogProps) {
  const detail = useChangeRequestDetail(request.yeuCauThayDoiChiNhanhId, 0);
  const snapshot =
    detail.state.status === 'success' ? detail.state.data.soNgayBaoTruoc : null;
  let soNgay: number | null | undefined;
  if (soNgayBaoTruoc === null) soNgay = null;
  else if (typeof soNgayBaoTruoc === 'number' && snapshot !== null)
    soNgay = Math.max(soNgayBaoTruoc, snapshot);
  return (
    <EffectiveTimeDialog
      title="Dời thời điểm hiệu lực"
      intro={
        <>
          Yêu cầu của <b>{request.chiNhanh.ten}</b> đã quá hạn nên chưa áp dụng.
          Chọn thời điểm dự kiến mới; bệnh nhân bị ảnh hưởng sẽ được thông báo
          lại.
        </>
      }
      label="Thời điểm dự kiến có hiệu lực mới"
      confirmLabel="Dời hiệu lực"
      soNgay={soNgay}
      now={now}
      onCancel={onCancel}
      onDone={onDone}
      send={async (hieuLucTu) => {
        await rescheduleChangeRequest(
          request.yeuCauThayDoiChiNhanhId,
          hieuLucTu,
        );
        return `Đã dời yêu cầu của ${request.chiNhanh.ten}, dự kiến có hiệu lực từ ${humanTime(hieuLucTu)}.`;
      }}
    />
  );
}

export function RejectDialog({ request, onCancel, onDone }: DialogProps) {
  return (
    <ReasonDialog
      title="Từ chối yêu cầu thay đổi"
      label="Lý do từ chối"
      confirmLabel="Từ chối"
      onCancel={onCancel}
      onDone={onDone}
      send={async (lyDo) => {
        await rejectChangeRequest(request.yeuCauThayDoiChiNhanhId, lyDo);
        return `Đã từ chối yêu cầu của ${request.chiNhanh.ten}.`;
      }}
    />
  );
}

/** Hủy yêu cầu đã duyệt chưa áp dụng, kể cả đang quá hạn (Q47). Lý do chỉ người đề xuất thấy; bệnh nhân nhận câu "đã hủy" không kèm lý do. */
export function CancelDialog({ request, onCancel, onDone }: DialogProps) {
  return (
    <ReasonDialog
      title="Hủy yêu cầu thay đổi"
      label="Lý do hủy"
      intro={
        <>
          Thay đổi của <b>{request.chiNhanh.ten}</b> sẽ không được áp dụng. Bệnh
          nhân đã được báo sẽ nhận thông báo hủy; lý do chỉ gửi cho người đề
          xuất.
        </>
      }
      confirmLabel="Hủy yêu cầu"
      onCancel={onCancel}
      onDone={onDone}
      send={async (lyDo) => {
        await cancelChangeRequest(request.yeuCauThayDoiChiNhanhId, lyDo);
        return `Đã hủy yêu cầu của ${request.chiNhanh.ten}.`;
      }}
    />
  );
}

/** Người gửi rút yêu cầu đang chờ duyệt (Q3). Không có ô nhập; Admin Toàn hệ thống được báo. */
export function WithdrawDialog({ request, onCancel, onDone }: DialogProps) {
  const { error, pending, submit } = useSubmit(onDone);
  return (
    <RequestActionDialog
      title="Rút yêu cầu thay đổi"
      error={error}
      confirmLabel="Rút yêu cầu"
      tone="danger"
      pending={pending}
      onConfirm={() =>
        void submit(async () => {
          await withdrawChangeRequest(request.yeuCauThayDoiChiNhanhId);
          return `Đã rút yêu cầu của ${request.chiNhanh.ten}.`;
        })
      }
      onCancel={onCancel}
    >
      <p className={styles.dialogText}>
        Rút yêu cầu thay đổi lịch / dịch vụ của <b>{request.chiNhanh.ten}</b>?
        Lịch hoạt động và dịch vụ giữ nguyên. Tên, địa chỉ, tọa độ đã lưu lúc
        gửi không tự hoàn lại.
      </p>
    </RequestActionDialog>
  );
}
