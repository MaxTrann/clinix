import { CalendarDays, CircleAlert, CreditCard, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { useInertBackground } from '../../../shared/hooks/use-inert-background';
import { useModalDialog } from '../../../shared/hooks/use-modal-dialog';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  collectCash,
  getCashPreview,
  type CashPreview,
  type CashReceipt,
} from './cash-api';
import { formatVietnamDateTime } from './cash-format';
import { CASH_TEXT, type CashErrorCode } from './cash-text';
import { PaymentNotice, type PaymentNoticeTone } from '../ui/payment-notice';

// Hộp "Thu tiền & tiếp đón" của Lễ tân (payment F4; Figma `492:2`, hộp `492:507`). Trang chi tiết Lễ tân của booking mở hộp và nhận kết quả qua props (Q19, E12); hộp KHÔNG import booking.
//  - Ba số (giá khám, đã thanh toán trước, thu tại quầy) do máy chủ tính ở `GET …/cash-preview`; web KHÔNG trừ (WTQ-01).
//  - Xác nhận: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi (WTQ-02).
//  - Lỗi theo `maLoi` (WTQ-03): lệch số ⇒ tải lại số; ngoài khung giờ ⇒ nêu `tu`, `den`; sai trạng thái, hết phải thu, 404 ⇒ dừng và báo trang tải lại chi tiết.
//  - Thành công ⇒ phiếu thu trong hộp và báo trang tải lại (WTQ-05). `Hủy`, Esc, bấm lớp phủ ⇒ đóng, không gọi gì (WTQ-06). Không lưu gì ở kho trình duyệt hay URL (WTQ-07).
//  - Khung modal: `useInertBackground` (nền `inert`) gọi TRƯỚC `useModalDialog` (Esc, bẫy Tab, khoá cuộn, trả tiêu điểm) để `inert` được gỡ trước khi tiêu điểm về nút đã mở.

export interface CashCollectDialogProps {
  maLichHen: string;
  /** Khối "Thông tin lịch hẹn": trang chi tiết đã có và đã định dạng (ngày giờ theo giờ Việt Nam). */
  appointment: { nguoiKham: string; thoiGian: string; bacSi: string };
  /** Nút đã mở hộp: nhận lại tiêu điểm khi hộp đóng (nếu còn trong trang). */
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Dữ liệu ở máy chủ đã đổi (đã thu, hay lỗi cho thấy chi tiết đang hiện đã cũ): trang tải lại chi tiết. */
  onChanged: () => void;
}

type Outcome =
  | { kind: 'done'; receipt: CashReceipt }
  // Không thu tiếp được trong hộp này: chỉ còn nút `Đóng`
  | { kind: 'stopped'; message: string }
  // Có thể bấm lại
  | { kind: 'retry'; message: string; tone: 'danger' | 'warning' };

function isKnownCode(code: string): code is CashErrorCode {
  return Object.hasOwn(CASH_TEXT.errors, code);
}

function knownMessage(error: unknown): string | null {
  return error instanceof ApiError && isKnownCode(error.maLoi)
    ? CASH_TEXT.errors[error.maLoi]
    : null;
}

function windowMessage(error: ApiError): string {
  const detail = error.chiTiet as { tu?: unknown; den?: unknown } | undefined;
  const { tu, den } = detail ?? {};
  if (
    typeof tu !== 'string' ||
    typeof den !== 'string' ||
    Number.isNaN(Date.parse(tu)) ||
    Number.isNaN(Date.parse(den))
  )
    return CASH_TEXT.outsideWindowUnknown;
  return CASH_TEXT.outsideWindow(
    formatVietnamDateTime(tu),
    formatVietnamDateTime(den),
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[13.375px] border border-gray-100 p-[15px]">
      <h3 className="flex items-center gap-[7.5px] text-[11.25px] leading-[15px] font-semibold tracking-[0.28px] text-gray-600 uppercase">
        {icon}
        {title}
      </h3>
      <div className="pt-[11.25px]">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-[11.25px] py-[4.7px] first:pt-0 last:pb-0">
      <dt className="w-[105px] shrink-0 pt-[1.875px] text-[11.25px] leading-[15px] text-gray-500">
        {label}
      </dt>
      <dd className="text-[13.125px] leading-[18.75px] font-medium text-gray-800">
        {children}
      </dd>
    </div>
  );
}

function MoneyRows({ preview }: { preview: CashPreview | CashReceipt }) {
  return (
    <dl>
      <div className="flex items-center justify-between text-[13.125px] leading-[18.75px]">
        <dt className="text-gray-500">{CASH_TEXT.price}</dt>
        <dd className="text-gray-800">{formatVnd(preview.giaKham)}</dd>
      </div>
      <div className="flex items-center justify-between pt-[7.5px] text-[13.125px] leading-[18.75px]">
        <dt className="text-gray-500">{CASH_TEXT.paidBefore}</dt>
        <dd className="font-semibold text-brand-strong">
          {formatVnd(preview.daThanhToanTruoc)}
        </dd>
      </div>
      <div className="mt-[7.5px] flex items-center justify-between border-t border-dashed border-gray-200 pt-[9.4px] font-bold text-warning">
        <dt className="text-[13.125px] leading-[18.75px]">
          {CASH_TEXT.collectHere}
        </dt>
        <dd className="text-[18.75px] leading-[26.25px]">
          {formatVnd(preview.thuTaiQuay)}
        </dd>
      </div>
    </dl>
  );
}

// Khoảng cách và bo góc theo frame Figma của thành phần này
function Notice({
  tone,
  children,
}: {
  tone: PaymentNoticeTone;
  children: ReactNode;
}) {
  return (
    <PaymentNotice tone={tone} className="mt-[15px] rounded-[13.375px]">
      {children}
    </PaymentNotice>
  );
}

export function CashCollectDialog({
  maLichHen,
  appointment,
  returnFocusRef,
  onClose,
  onChanged,
}: CashCollectDialogProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { state, retry } = useRemote(
    (signal) => getCashPreview(maLichHen, signal),
    [maLichHen],
  );
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Khoá đồng bộ: hai lần bấm trong cùng một lượt render vẫn chỉ gửi một lần
  const inFlight = useRef(false);

  // Đang gửi thì không đóng: đóng giữa chừng làm mất kết quả (máy chủ vẫn xử lý)
  const close = () => {
    if (!inFlight.current) onClose();
  };
  useInertBackground(overlayRef);
  useModalDialog({
    open: true,
    dialogRef: panelRef,
    initialFocusRef: cancelRef,
    returnFocusRef,
    onClose: close,
  });

  // Bản xem trước trả lỗi nghiệp vụ (đã tiếp đón, hết phải thu, không thấy): chi tiết trên trang đã cũ
  const previewStale =
    state.status === 'error' && knownMessage(state.error) !== null;
  useEffect(() => {
    if (previewStale) onChanged();
    // Chỉ khi chuyển sang lỗi nghiệp vụ; `onChanged` đổi theo từng lần render của trang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewStale]);

  const preview = state.status === 'ready' ? state.data : null;
  const done = outcome?.kind === 'done' ? outcome.receipt : null;
  const stopped = previewStale || outcome?.kind === 'stopped';
  const canSubmit =
    preview !== null &&
    !sending &&
    (outcome === null || outcome.kind === 'retry');

  const submit = async () => {
    if (inFlight.current || preview === null || !canSubmit) return;
    inFlight.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const result = await collectCash(maLichHen, preview.thuTaiQuay);
      setOutcome({ kind: 'done', receipt: result.phieuThu });
      onChanged();
    } catch (caught) {
      if (caught instanceof TimeoutError || caught instanceof NetworkError) {
        setOutcome({
          kind: 'retry',
          message: CASH_TEXT.uncertain,
          tone: 'warning',
        });
      } else if (
        caught instanceof ApiError &&
        caught.maLoi === 'SO_TIEN_KHONG_KHOP'
      ) {
        // Số đã cũ: tải lại số mới (hộp hiện số mới, Lễ tân bấm lại) và báo trang tải lại chi tiết
        setOutcome({
          kind: 'retry',
          message: CASH_TEXT.errors.SO_TIEN_KHONG_KHOP,
          tone: 'warning',
        });
        retry();
        onChanged();
      } else if (
        caught instanceof ApiError &&
        caught.maLoi === 'NGOAI_KHUNG_GIO_TIEP_DON'
      ) {
        setOutcome({
          kind: 'retry',
          message: windowMessage(caught),
          tone: 'danger',
        });
      } else {
        const message = knownMessage(caught);
        if (message !== null) {
          setOutcome({ kind: 'stopped', message });
          onChanged();
        } else
          setOutcome({
            kind: 'retry',
            message: CASH_TEXT.genericError,
            tone: 'danger',
          });
      }
    }
    inFlight.current = false;
    setSending(false);
  };

  let body: ReactNode;
  if (done !== null) {
    body = (
      <>
        <Notice tone="success">{CASH_TEXT.receiptTitle}</Notice>
        <div className="pt-[15px]">
          <Section
            icon={<CreditCard aria-hidden="true" className="size-[15px]" />}
            title={CASH_TEXT.totalSection}
          >
            <MoneyRows preview={done} />
            <dl className="mt-[11.25px] border-t border-gray-100 pt-[9.4px]">
              <InfoRow label={CASH_TEXT.receiptNo}>{done.soPhieu}</InfoRow>
              <InfoRow label={CASH_TEXT.receiptTime}>
                {formatVietnamDateTime(done.thoiDiem)}
              </InfoRow>
              <InfoRow label={CASH_TEXT.receiptBy}>{done.nguoiThu}</InfoRow>
            </dl>
          </Section>
        </div>
      </>
    );
  } else if (state.status === 'loading') {
    body = <LoadingState message={CASH_TEXT.loading} />;
  } else if (state.status === 'error') {
    const message = knownMessage(state.error);
    body =
      message !== null ? (
        <Notice tone="danger">{message}</Notice>
      ) : (
        <ErrorState error={state.error} onRetry={retry} />
      );
  } else {
    const amount = formatVnd(state.data.thuTaiQuay);
    body = (
      <>
        <div className="pt-[15px]">
          <Section
            icon={<CreditCard aria-hidden="true" className="size-[15px]" />}
            title={CASH_TEXT.totalSection}
          >
            <MoneyRows preview={state.data} />
          </Section>
        </div>
        {outcome?.kind !== 'stopped' && (
          <p className="mt-[15px] flex gap-[11.25px] rounded-[13.375px] border border-warning-line bg-warning-soft px-[15px] py-[11.25px] text-[11.25px] leading-[18.28px] text-warning">
            <CircleAlert
              aria-hidden="true"
              className="mt-[1.875px] size-[15px] shrink-0"
            />
            <span>
              {CASH_TEXT.confirmBefore}
              <strong>{amount}</strong>
              {CASH_TEXT.confirmAfter}
            </span>
          </p>
        )}
      </>
    );
  }

  return createPortal(
    <div
      ref={overlayRef}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={sending}
        className="flex max-h-full w-full max-w-[448px] flex-col rounded-[15px] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between px-[22.5px] pt-[18.75px]">
          <h2
            id={titleId}
            className="text-[15px] leading-[22.5px] font-bold text-gray-900"
          >
            {CASH_TEXT.title}
          </h2>
          <button
            type="button"
            aria-label={CASH_TEXT.close}
            disabled={sending}
            onClick={close}
            className="flex size-[30px] items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-[15px]" />
          </button>
        </div>

        <div className="overflow-y-auto px-[22.5px] py-[18.75px]">
          <Section
            icon={<CalendarDays aria-hidden="true" className="size-[15px]" />}
            title={CASH_TEXT.appointmentSection}
          >
            <dl>
              <InfoRow label={CASH_TEXT.patient}>
                <span className="flex flex-wrap items-center gap-[7.5px]">
                  <span className="font-semibold text-gray-900">
                    {appointment.nguoiKham}
                  </span>
                  <span className="rounded-[3.75px] border border-sky-100 bg-sky-50 px-[7.5px] py-[1.875px] font-mono text-[11.25px] leading-[15px] text-sky-700">
                    #{maLichHen}
                  </span>
                </span>
              </InfoRow>
              <InfoRow label={CASH_TEXT.dateTime}>
                {appointment.thoiGian}
              </InfoRow>
              <InfoRow label={CASH_TEXT.doctor}>{appointment.bacSi}</InfoRow>
            </dl>
          </Section>
          {body}
          {outcome !== null && outcome.kind !== 'done' && (
            <Notice tone={outcome.kind === 'stopped' ? 'danger' : outcome.tone}>
              {outcome.message}
            </Notice>
          )}
        </div>

        <div className="flex gap-[9.375px] border-t border-gray-100 px-[22.5px] pt-[7.5px] pb-[18.75px]">
          <button
            ref={cancelRef}
            type="button"
            disabled={sending}
            onClick={close}
            className="min-h-[39.1px] flex-1 rounded-[13.375px] border border-gray-500 bg-white text-[13.125px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {done !== null || stopped ? CASH_TEXT.close : CASH_TEXT.cancel}
          </button>
          {done === null && !stopped && (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit()}
              className="min-h-[39.1px] flex-1 rounded-[13.375px] bg-warning text-[13.125px] font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? CASH_TEXT.submitting : CASH_TEXT.submit}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
