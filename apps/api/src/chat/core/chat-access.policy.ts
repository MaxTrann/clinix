import type { LoaiHoiThoai } from '../entities/enums.js';

// MỘT nơi định nghĩa ai thấy, ai gửi được vào hội thoại nào (chat B1; PLAN chat 5.3). REST (B2, B3), socket (B5) và tải tệp (B4) cùng dùng, không chép luật.
// Hàm THUẦN trên "sự thật" đã đọc từ DB; câu đọc nằm ở repository. Tài khoản và vai trò lấy từ token; chi nhánh của Lễ tân do nơi gọi đọc bằng
// `ReceptionScopeService.resolve` ở MỖI yêu cầu (không lấy từ token hay client).

/** Người đang thao tác. Quản trị viên không có kiểu ở đây: không vào được chat (403 ở route, socket từ chối). */
export type ChatActor =
  | { vaiTro: 'BenhNhan'; taiKhoanId: string }
  | { vaiTro: 'BacSi'; taiKhoanId: string }
  | { vaiTro: 'LeTan'; taiKhoanId: string; chiNhanhId: string };

/** Sự thật về một hội thoại, đọc dưới khoá (gửi) hay đọc thường (danh sách). */
export interface ConversationFacts {
  hoiThoaiId: string;
  loai: LoaiHoiThoai;
  chiNhanhId: string | null;
  /** Bệnh nhân chủ hội thoại (người mở). */
  nguoiTaoId: string;
  /** Người thao tác có dòng `tai_khoan_hoi_thoai` ở hội thoại này. */
  actorIsMember: boolean;
}

/** Bảng 5.3 hàng "Thấy hội thoại": Bệnh nhân theo dòng thành viên; Bác sĩ theo dòng thành viên VÀ loại bác sĩ; Lễ tân theo loại hộp thư VÀ đúng chi nhánh hiện tại (không cần dòng thành viên). */
export function canSee(actor: ChatActor, facts: ConversationFacts): boolean {
  switch (actor.vaiTro) {
    case 'BenhNhan':
      return facts.actorIsMember;
    case 'BacSi':
      return facts.actorIsMember && facts.loai === 'BenhNhan_BacSi';
    case 'LeTan':
      return (
        facts.loai === 'BenhNhan_LeTan' && facts.chiNhanhId === actor.chiNhanhId
      );
  }
}

/** Chỉ Bệnh nhân mở hội thoại mới (ở tin đầu tiên). */
export function canOpen(actor: ChatActor): boolean {
  return actor.vaiTro === 'BenhNhan';
}

/**
 * "Bên kia" mà trạng thái quyết định có gửi được không (5.3, Q3): Bệnh nhân gửi ở hội thoại bác sĩ ⇒ bác sĩ; ở hộp thư chung ⇒ không ai (chi nhánh không có trạng thái,
 * luôn gửi được); Bác sĩ, Lễ tân gửi ⇒ Bệnh nhân chủ. `bacSiId` là bác sĩ thành viên của hội thoại bác sĩ (null ở hộp thư).
 */
export function counterpartToCheck(
  actor: ChatActor,
  facts: ConversationFacts,
  bacSiId: string | null,
): string | null {
  if (actor.vaiTro !== 'BenhNhan') return facts.nguoiTaoId;
  return facts.loai === 'BenhNhan_BacSi' ? bacSiId : null;
}
