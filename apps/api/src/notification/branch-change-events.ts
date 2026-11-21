// Mã sự kiện (`thong_bao.loai_su_kien`) của yêu cầu thay đổi chi nhánh (admin C4; PLAN admin 4.2a ý 5, Q9).
// UNIQUE `thong_bao_index_yeu_cau_chi_nhanh` là (yêu cầu, tài khoản, loại sự kiện): cùng một bệnh nhân có thể được báo LẠI sau mỗi lần dời hiệu lực
// hay mỗi lần quá hạn, nên ba loại đó mang hậu tố phiên bản `:v{n}` để lần báo mới không trùng khoá với lần cũ.

export const BRANCH_CHANGE_EVENTS = {
  /** Người đề xuất: yêu cầu được duyệt hoặc bị từ chối (Figma 689:2). Duyệt và từ chối loại trừ nhau nên dùng chung một mã. */
  RESULT: 'KetQuaYeuCauThayDoiChiNhanh',
  /** Bệnh nhân có lịch hẹn bị ảnh hưởng khi yêu cầu được duyệt (Figma 690:2). Có phiên bản. */
  AFFECTED: 'ThayDoiChiNhanhAnhHuongLichHen',
  /** Người đề xuất và bệnh nhân đã được báo: Admin Toàn hệ thống hủy yêu cầu đã duyệt (Q47). */
  CANCELLED: 'HuyThayDoiChiNhanh',
  /** Bệnh nhân: Admin Toàn hệ thống dời thời điểm hiệu lực của yêu cầu quá hạn (Q48). Có phiên bản. */
  RESCHEDULED: 'DoiHieuLucThayDoiChiNhanh',
  /** Admin Toàn hệ thống và người đề xuất: đến hạn mà còn lịch hoặc ca chưa xử lý (Q48). Có phiên bản. Chỉ trong ứng dụng. */
  OVERDUE: 'YeuCauThayDoiChiNhanhQuaHan',
  /** [đề xuất] Admin Toàn hệ thống: người gửi rút yêu cầu đang chờ duyệt (Q3). Chỉ trong ứng dụng. */
  WITHDRAWN: 'RutThayDoiChiNhanh',
} as const;

type Events = typeof BRANCH_CHANGE_EVENTS;
export type BranchChangeEventType = Events[keyof Events];

/** Loại có phiên bản phải kèm `version` (số nguyên từ 1); loại khác thì không. */
export type BranchChangeEvent =
  | { type: Events['RESULT'] | Events['CANCELLED'] | Events['WITHDRAWN'] }
  | {
      type: Events['AFFECTED'] | Events['RESCHEDULED'] | Events['OVERDUE'];
      version: number;
    };

/** Các loại có thêm thư (dòng `email_thong_bao`). Hai loại còn lại chỉ là thông báo trong ứng dụng (Q9, PLAN 4.2a ý 5). */
export const BRANCH_CHANGE_MAIL_TYPES: readonly BranchChangeEventType[] = [
  BRANCH_CHANGE_EVENTS.RESULT,
  BRANCH_CHANGE_EVENTS.AFFECTED,
  BRANCH_CHANGE_EVENTS.CANCELLED,
  BRANCH_CHANGE_EVENTS.RESCHEDULED,
];

/** Hai loại báo bệnh nhân về thay đổi SẮP có hiệu lực: thư còn chờ gửi của chúng phải dừng khi yêu cầu bị hủy hoặc dời (Q47, Q48, H21). */
export const CHANGE_NOTICE_TYPES: readonly BranchChangeEventType[] = [
  BRANCH_CHANGE_EVENTS.AFFECTED,
  BRANCH_CHANGE_EVENTS.RESCHEDULED,
];

export function hasEmail(type: BranchChangeEventType): boolean {
  return BRANCH_CHANGE_MAIL_TYPES.includes(type);
}

/** Chữ ghi vào `loai_su_kien`, ví dụ `ThayDoiChiNhanhAnhHuongLichHen:v2`. Phiên bản sai là lỗi lập trình của người gọi nên ném lỗi. */
export function eventCodeOf(event: BranchChangeEvent): string {
  if (!('version' in event)) return event.type;
  if (!Number.isInteger(event.version) || event.version < 1)
    throw new Error(`phiên bản sự kiện ${event.type} phải là số nguyên từ 1`);
  return `${event.type}:v${String(event.version)}`;
}
