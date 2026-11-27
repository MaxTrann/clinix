import { FileText } from 'lucide-react';
import { useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { downloadAttachment } from '../api/chat-api';
import type { ChatFileInfo } from '../api/chat-types';
import { formatFileSize, isImageType } from './attachment-rules';
import { ObjectUrlImage } from './object-url-image';

// Tệp của một tin đã gửi (chat F6; PLAN chat 5.8; WCH-14). Cách hiện theo `tep.loai` do MÁY CHỦ trả (đã nhận ra theo nội dung), tên và cỡ cũng của máy chủ.
//  - Ảnh: tải byte qua lớp client (`downloadAttachment`, có token) rồi hiện bằng object URL; lỗi ⇒ câu ngắn và "Thử lại".
//  - PDF (và loại khác): nút "Tải xuống" ⇒ tải byte rồi lưu bằng liên kết `download` tạm (object URL thu hồi ngay sau khi bấm). Không mở trong trang.

export const IMAGE_LOAD_ERROR = 'Chưa tải được ảnh.';
export const DOWNLOAD_ERROR = 'Chưa tải được tệp. Thử lại sau.';

export function MessageAttachment({
  tinNhanId,
  tep,
}: {
  tinNhanId: string;
  tep: ChatFileInfo;
}) {
  return isImageType(tep.loai) ? (
    <AttachmentImage tinNhanId={tinNhanId} tep={tep} />
  ) : (
    <AttachmentDownload tinNhanId={tinNhanId} tep={tep} />
  );
}

function AttachmentImage({
  tinNhanId,
  tep,
}: {
  tinNhanId: string;
  tep: ChatFileInfo;
}) {
  const { state, retry } = useRemote(
    (signal) => downloadAttachment(tinNhanId, signal).then((file) => file.blob),
    [tinNhanId],
  );
  if (state.status === 'loading')
    return (
      <p role="status" className="text-xs text-gray-500">
        Đang tải ảnh…
      </p>
    );
  if (state.status === 'error')
    return (
      <p className="text-xs text-danger-strong">
        {IMAGE_LOAD_ERROR}{' '}
        <button
          type="button"
          onClick={retry}
          className="font-semibold underline"
        >
          Thử lại
        </button>
      </p>
    );
  return (
    <ObjectUrlImage
      blob={state.data}
      alt={tep.ten}
      className="max-h-64 max-w-full rounded-xl object-contain"
    />
  );
}

/** Lưu byte xuống máy bằng liên kết `download` tạm; thu hồi object URL ngay sau khi bấm. */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AttachmentDownload({
  tinNhanId,
  tep,
}: {
  tinNhanId: string;
  tep: ChatFileInfo;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const download = () => {
    // Bấm đúp khi đang tải: không tải hai lần
    if (status === 'loading') return;
    setStatus('loading');
    downloadAttachment(tinNhanId)
      .then((file) => {
        saveBlob(file.blob, tep.ten);
        setStatus('idle');
      })
      .catch((error: unknown) => {
        setStatus(error instanceof RequestAbortedError ? 'idle' : 'error');
      });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <FileText
          className="size-5 shrink-0 text-gray-500"
          aria-hidden="true"
        />
        <span className="min-w-0 break-all text-sm">
          {tep.ten}
          <span className="text-xs text-gray-500">
            {' '}
            · {formatFileSize(tep.dungLuong)}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={download}
        disabled={status === 'loading'}
        aria-label={`Tải xuống ${tep.ten}`}
        className="self-start rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium disabled:opacity-60"
      >
        {status === 'loading' ? 'Đang tải…' : 'Tải xuống'}
      </button>
      {status === 'error' && (
        <p role="alert" className="text-xs text-danger-strong">
          {DOWNLOAD_ERROR}
        </p>
      )}
    </div>
  );
}
