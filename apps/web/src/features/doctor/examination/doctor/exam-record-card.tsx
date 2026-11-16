import { ClipboardList, FileText } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { SAVE_TEXT } from '../exam-messages';
import {
  EMPTY_VALUES,
  valuesOf,
  type ExamRecordNote,
} from '../exam-record-form';
import { RECORD_TEXT, recordView } from '../exam-record-text';
import { ExamRecordDialog, type ExamRecordDraft } from './exam-record-dialog';
import { RecordBody } from './record-body';

// Hồ sơ khám của một lịch, đúng hình dạng `ghiChuKham` của `GET /doctor/appointments/:maLichHen` (B3; nguồn `ExamRecordView` của B2). Kiểu định nghĩa ở `exam-record-form.ts` (không import kiểu của booking: Q20 phương án C);
// xuất lại đây vì `features/doctor/index.ts` đã xuất tên này từ file thẻ.
export type { ExamRecordNote } from '../exam-record-form';

export interface ExamRecordCardProps {
  maLichHen: string;
  // Trạng thái lịch hẹn hiện tại (kiểu `string`: không import kiểu của booking). Chỉ `DaTiepDon` và `HoanThanh` hiện nội dung và nút (Q16)
  trangThai: string;
  // Họ tên người khám: phụ đề của hộp ghi (`<mã lịch> · <họ tên>`, Figma `460:389`)
  nguoiKham: string;
  // Thời điểm khám (ISO 8601 UTC): hộp tính ngày khám theo giờ Việt Nam để chặn ngày tái khám ngoài khoảng
  thoiGian: string;
  ghiChuKham: ExamRecordNote | null;
  // Gọi khi máy chủ đã đổi hay dữ liệu đang hiện chắc chắn lệch: trang chi tiết tải lại (thẻ, chip, bước "Hoàn thành" khớp lại)
  onChanged: () => void;
}

function Content({ note }: { note: ExamRecordNote }) {
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <RecordBody note={note} />
    </div>
  );
}

// Hàng đầu thẻ: tiêu đề bên trái, nút `Chỉnh sửa ghi chú` bên phải (Figma `463:2`, `463:250`)
function Frame({
  action,
  children,
}: {
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <FileText aria-hidden="true" className="size-4 text-gray-600" />
          {RECORD_TEXT.title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Thẻ "Hồ sơ khám bệnh" ở trang chi tiết ca khám của Bác sĩ (doctor-exam F2 hiển thị, F3 ghi và sửa; Q6, Q16, Q20 phương án C: booking import CHỈ qua `features/doctor/index.ts`, dữ liệu và hàm tải lại đi qua props).
// Nút chỉ xuất hiện đúng nơi `recordView` cho nội dung hay trạng thái rỗng (`DaTiepDon`, `HoanThanh`): `Chỉnh sửa ghi chú` ở đầu thẻ khi có hồ sơ, `Ghi hồ sơ khám` cùng dòng phụ khi chưa có (Figma `459:2`, `462:2`, `464:2`).
// Hộp ghi nằm ở đây (không ở `RecordView`) nên vẫn mở khi trang tải lại làm lịch rời hai trạng thái: nội dung đang gõ không mất. Khung thẻ cùng lớp với `DetailCard` của booking (khung chung F12).
// Figma thiếu frame "Đã tiếp đón ĐÃ có hồ sơ" (L7): dùng bố cục của `462:2`.
export function ExamRecordCard({
  maLichHen,
  trangThai,
  nguoiKham,
  thoiGian,
  ghiChuKham,
  onChanged,
}: ExamRecordCardProps) {
  const view = recordView(trangThai, ghiChuKham !== null);
  // Giá trị lúc mở của hộp đang mở (`null` = đóng)
  const [opened, setOpened] = useState<ExamRecordDraft | null>(null);
  // Bản nháp giữ trong BỘ NHỚ (không kho trình duyệt, URL: BDK-09) khi hộp bị đóng sau một lỗi; xoá khi lưu thành công
  const [draft, setDraft] = useState<ExamRecordDraft | null>(null);
  const [saved, setSaved] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const token = ghiChuKham?.capNhatLanCuoi ?? null;

  // Lưu xong: nút đã mở hộp có thể đã biến mất (chưa có hồ sơ ⇒ có hồ sơ) nên tiêu điểm chuyển sang dòng kết quả, người dùng bàn phím không rơi về `body`
  useEffect(() => {
    if (saved) statusRef.current?.focus();
  }, [saved]);

  function open(event: MouseEvent<HTMLElement>) {
    trigger.current = event.currentTarget;
    setSaved(false);
    // Nháp chỉ dùng được khi dựng trên đúng bản của máy chủ đang hiện (cùng token); hồ sơ đã đổi thì bỏ nháp
    setOpened(
      draft !== null && draft.baseToken === token
        ? draft
        : {
            values: ghiChuKham === null ? EMPTY_VALUES : valuesOf(ghiChuKham),
            baseToken: token,
          },
    );
  }

  const editButton =
    view.kind === 'content' ? (
      <button
        type="button"
        onClick={open}
        className="-my-2 inline-flex items-center gap-1.5 rounded-[3.75px] py-2 text-xs font-medium text-brand-strong underline"
      >
        <FileText aria-hidden="true" className="size-3.5" />
        {RECORD_TEXT.actions.edit}
      </button>
    ) : null;

  return (
    <>
      <Frame action={editButton}>
        {saved && (
          <p
            ref={statusRef}
            tabIndex={-1}
            role="status"
            className="px-5 pt-3 text-sm text-success"
          >
            {SAVE_TEXT.saved}
          </p>
        )}
        {view.kind === 'content' && ghiChuKham !== null && (
          <Content note={ghiChuKham} />
        )}
        {view.kind === 'empty' && (
          <div className="flex flex-col items-center gap-3 px-5 pt-12 pb-8 text-center">
            <ClipboardList
              aria-hidden="true"
              className="size-10 text-amber-300"
            />
            <p className="text-sm font-medium text-gray-800">{view.text}</p>
            {/* Figma: dòng phụ cách câu 3,75 (gap 11,25 trừ 7,5) và cách nút 15 (gap 11,25 cộng 3,75) */}
            <p className="-mt-2 text-xs text-gray-600">{view.hint}</p>
            <button
              type="button"
              onClick={open}
              className="mt-1 inline-flex items-center gap-2 rounded-[13.375px] bg-brand-strong px-4 py-2 text-sm font-semibold whitespace-nowrap text-white transition-colors hover:bg-cyan-800"
            >
              <FileText aria-hidden="true" className="size-4" />
              {RECORD_TEXT.actions.write}
            </button>
          </div>
        )}
        {view.kind === 'note' && (
          <p
            className={`m-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700${view.italic ? ' italic' : ''}`}
          >
            {view.text}
          </p>
        )}
      </Frame>
      {opened !== null && (
        <ExamRecordDialog
          maLichHen={maLichHen}
          nguoiKham={nguoiKham}
          thoiGian={thoiGian}
          note={ghiChuKham}
          initial={opened}
          returnFocusRef={trigger}
          onClose={(next) => {
            setDraft(next);
            setOpened(null);
          }}
          onSaved={() => {
            setDraft(null);
            setOpened(null);
            setSaved(true);
          }}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
