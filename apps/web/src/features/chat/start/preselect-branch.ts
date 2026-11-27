import { getBranchOptions, getDefaultBranch } from '../api/chat-api';
import type { BranchOption, DefaultBranch } from '../api/chat-types';

// Dữ liệu và luật chọn sẵn của bộ chọn chi nhánh "Nhắn lễ tân" (chat F4; PLAN chat Q4, MH1, MH2). Hàm thuần `preselectBranch` để test được riêng.

export interface PickerData {
  options: BranchOption[];
  suggested: DefaultBranch | null;
}

export const HINTS: Record<
  'LichHenSapToi' | 'LichHenDaKham' | 'DangChon',
  string
> = {
  LichHenSapToi: 'Đã chọn sẵn chi nhánh của lịch hẹn sắp tới.',
  LichHenDaKham: 'Đã chọn sẵn chi nhánh bạn khám gần nhất.',
  DangChon: 'Đã chọn sẵn chi nhánh bạn đang xem.',
};

export async function loadPicker(signal: AbortSignal): Promise<PickerData> {
  const [options, suggested] = await Promise.all([
    getBranchOptions(signal),
    // Không có gợi ý (lỗi mạng, 5xx) không chặn việc chọn tay
    getDefaultBranch(signal).catch(() => null),
  ]);
  return { options, suggested };
}

/** Chi nhánh chọn sẵn và nguồn của nó; `null` khi người dùng phải tự chọn. */
export function preselectBranch(
  data: PickerData,
  browserBranchId: string | null,
): { chiNhanhId: string; hint: string } | null {
  const known = (id: string | null) =>
    id !== null && data.options.some((option) => option.chiNhanhId === id);
  const fromServer = data.suggested?.chiNhanhId ?? null;
  if (known(fromServer) && data.suggested?.nguon)
    return { chiNhanhId: fromServer!, hint: HINTS[data.suggested.nguon] };
  if (known(browserBranchId))
    return { chiNhanhId: browserBranchId!, hint: HINTS.DangChon };
  return null;
}
