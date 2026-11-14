import { FileText } from 'lucide-react';
import { DetailCard } from '../../common/detail-card';
import { DETAIL_TEXT, recordMessage } from './detail-messages';

// Thẻ "Hồ sơ khám bệnh" (Figma `458:2`, `459:2`, `464:2`, `465:2`, `692:2`). `ghiChuKham` là `null` (B5: luôn `null` tới khi `doctor` có bảng `ho_so_kham`), nên thẻ chỉ có MỘT câu theo trạng thái; KHÔNG bịa
// nội dung hồ sơ và KHÔNG có nút `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` (việc của module `doctor`: chỗ thêm là đây, cạnh câu này). Câu `none` (huỷ, vắng mặt) chữ nghiêng như Figma `692:2`.
export function RecordCard({ trangThai }: { trangThai: string }) {
  const message = recordMessage(trangThai);
  return (
    <DetailCard icon={FileText} title={DETAIL_TEXT.sections.record}>
      <p
        className={`m-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700${message.italic ? ' italic' : ''}`}
      >
        {message.text}
      </p>
    </DetailCard>
  );
}
