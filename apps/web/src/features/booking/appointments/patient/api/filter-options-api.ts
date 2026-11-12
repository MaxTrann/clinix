import { request } from '../../../../../shared/api/client';
import {
  readFlag,
  readId,
  readList,
  readRecord,
  readText,
} from '../../common/response-readers';
import type { RelativeOption } from './patient-appointment-types';

// Danh sách người thân cho ô lọc Người khám của "Lịch hẹn của tôi" (booking F1; Đại duyệt 12/11/2026, câu (c)). Hai danh sách Bác sĩ và Chuyên khoa dùng chung
// với Lễ tân nên ở `common/filter-options-api.ts` (F8). Gọi bằng client của booking, KHÔNG import `features/patient`.

// `GET /patient/relatives` (patient B1…B7): `{ items }` không phân trang, gồm cả hồ sơ đã ngừng sử dụng. Chỉ đọc ba khoá cần; hồ sơ đang dùng
// đứng trước, thứ tự trong mỗi nhóm giữ như API trả.
export async function getRelativeOptions(
  signal?: AbortSignal,
): Promise<RelativeOption[]> {
  const body = readRecord(
    await request<unknown>('patient/relatives', { signal }),
  );
  const relatives = readList(body.items).map((item): RelativeOption => {
    const row = readRecord(item);
    return {
      hoSoNguoiThanId: readId(row.hoSoNguoiThanId),
      hoTen: readText(row.hoTen),
      trangThaiHieuLuc: readFlag(row.trangThaiHieuLuc),
    };
  });
  return [
    ...relatives.filter((relative) => relative.trangThaiHieuLuc),
    ...relatives.filter((relative) => !relative.trangThaiHieuLuc),
  ];
}
