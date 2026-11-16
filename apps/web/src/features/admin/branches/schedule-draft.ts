// Bản nháp lịch hoạt động trong form Thêm chi nhánh: giờ là chuỗi người dùng đang gõ (có thể dở dang), chưa phải `BranchScheduleInput`.

export interface PeriodDraft {
  enabled: boolean;
  start: string;
  end: string;
}

export interface ScheduleDraft {
  day: number;
  open: boolean;
  morning: PeriodDraft;
  afternoon: PeriodDraft;
}
