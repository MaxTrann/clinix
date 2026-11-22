import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { BRANCH_CHANGE_EVENTS } from '../../../notification/branch-change-events.js';
import { BranchChangeNotifier } from '../../../notification/branch-change-notifier.js';
import {
  BranchRepository,
  type BranchScheduleView,
} from '../../branches/branch.repository.js';
import { BranchImpactService } from '../../branches/impact/branch-impact.service.js';
import { validateWeeklySchedule } from '../../branches/weekly-schedule.validator.js';
import {
  impactInputOf,
  parseRequestContent,
  type DayView,
  type ParsedContent,
} from '../request-content.js';
import { humanTime } from '../request-time.js';
import {
  BranchChangeApplyRepository,
  type LockedForApply,
} from './branch-change-apply.repository.js';

// Áp dụng MỘT yêu cầu thay đổi chi nhánh đã đến hiệu lực (admin B11; PLAN admin 5.4 "Áp dụng"; Q7, Q8, Q46, Q48). Job `apply.job.ts` gọi mỗi yêu cầu một lần.
// Không tự hủy, đổi lịch, hoàn tiền, xoá ca hay khung giờ (Q7). Không ghi audit: job không có người thực hiện (PLAN 5.10); dấu vết là `ap_dung_luc` / `qua_han_luc`.

export type ApplyOutcome =
  /** Đã thay lịch và dịch vụ, đặt `ap_dung_luc` */
  | { kind: 'DaApDung' }
  /** Còn lịch hẹn, ca hay bác sĩ chưa xử lý: không áp dụng gì, đặt `qua_han_luc`, đã cảnh báo */
  | { kind: 'QuaHan'; lichHen: number; ca: number; bacSi: number }
  /** Không còn là ứng viên khi khoá (bên khác vừa áp dụng, hủy, hay chưa tới giờ) */
  | { kind: 'KhongDenHan' }
  /** Nội dung không áp dụng được (dạng cũ, thiếu dữ liệu, lịch không hợp lệ): không ghi gì, log ERROR, lượt sau gặp lại (CN-86) */
  | { kind: 'NoiDungHong'; maLoi: string[] };

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** 'HH:mm:ss' của DB ⇒ 'HH:mm' cho bộ kiểm (B8 chỉ ghi giây = 00). Dạng khác để nguyên: bộ kiểm sẽ báo `GIO_KHONG_HOP_LE`. */
const toHm = (time: string): string =>
  /^\d{2}:\d{2}:00$/.test(time) ? time.slice(0, 5) : time;

/** Một thứ ⇒ dạng đầu vào của `validateWeeklySchedule` (như form B7/B8). */
function scheduleInput(
  thuTrongTuan: number,
  day: Pick<DayView, 'hoatDong' | 'sang' | 'chieu'>,
) {
  const period = (p: { batDau: string; ketThuc: string } | null) =>
    p === null
      ? undefined
      : { batDau: toHm(p.batDau), ketThuc: toHm(p.ketThuc) };
  return {
    thuTrongTuan,
    hoatDong: day.hoatDong,
    sang: period(day.sang),
    chieu: period(day.chieu),
  };
}

/**
 * Lịch ĐỦ 7 thứ sau khi áp dụng (lịch đang có, thay các thứ đổi) phải qua đúng bộ kiểm lúc thêm và sửa chi nhánh (H12, CN-86).
 * Trả danh sách mã lỗi; rỗng = áp dụng được.
 */
export function contentIssues(
  content: ParsedContent,
  current: readonly BranchScheduleView[],
): string[] {
  if (content.coDangCu) return ['NOI_DUNG_DANG_CU'];
  const changed = content.lichHoatDong.filter((d) => d.sau !== null);
  if (changed.length === 0 && content.dichVu === null)
    return ['KHONG_CO_GI_DE_AP_DUNG'];
  if (content.dichVu?.sau.some((id) => !/^[1-9]\d*$/.test(id)))
    return ['DICH_VU_KHONG_HOP_LE'];
  const byDay = new Map(
    current.map((row) => [
      row.thuTrongTuan,
      scheduleInput(row.thuTrongTuan, row),
    ]),
  );
  for (const day of changed)
    if (day.sau)
      byDay.set(day.thuTrongTuan, scheduleInput(day.thuTrongTuan, day.sau));
  return validateWeeklySchedule([...byDay.values()]).map(
    (issue) =>
      `${issue.maLoi}${issue.thu === null ? '' : `@${String(issue.thu)}`}`,
  );
}

@Injectable()
export class BranchChangeApplyService {
  constructor(
    @Inject(BranchChangeApplyRepository)
    private readonly requests: BranchChangeApplyRepository,
    @Inject(BranchRepository) private readonly branches: BranchRepository,
    @Inject(BranchImpactService) private readonly impact: BranchImpactService,
    @Inject(BranchChangeNotifier)
    private readonly notifier: BranchChangeNotifier,
  ) {}

  /**
   * MỘT giao dịch: khoá yêu cầu → kiểm lại điều kiện → khoá chi nhánh → kiểm nội dung → khoá khung giờ → tính lại ảnh hưởng tại `hieu_luc_tu`
   * và kiểm Q8 → quá hạn (không áp dụng gì) hoặc áp dụng trọn. Lỗi bất kỳ ⇒ hoàn tác trọn; job bắt lỗi, lượt sau thử lại (CN-84).
   * `now` là mốc của cả lượt quét (đã cắt giây): `ap_dung_luc`/`qua_han_luc` = `now` >= `hieu_luc_tu`, khớp CHECK.
   */
  applyOne(id: string, now: Date): Promise<ApplyOutcome> {
    return this.requests.writeTransaction(async (manager) => {
      const request = await this.requests.lockForApply(manager, id);
      if (
        !request ||
        request.trangThai !== 'DaDuyet' ||
        request.apDungLuc !== null ||
        request.quaHanLuc !== null ||
        request.hieuLucTuDate === null ||
        request.hieuLucTuDate.getTime() > now.getTime()
      )
        return { kind: 'KhongDenHan' };

      const branch = await this.branches.lockForUpdate(
        manager,
        request.chiNhanhId,
      );
      if (!branch) throw new Error('chi nhánh của yêu cầu không còn');
      const content = parseRequestContent(
        request.noiDungTruoc,
        request.noiDungSau,
      );
      const issues = contentIssues(content, branch.lichHoatDong);
      if (issues.length > 0) return { kind: 'NoiDungHong', maLoi: issues };

      const input = impactInputOf(content);
      // Danh sách dịch vụ MỚI đầy đủ (null = không đổi dịch vụ) so với dịch vụ đang có
      const currentServices = branch.dichVuKham.map((s) => s.dichVuKhamId);
      const nextServices =
        content.dichVu === null ? null : [...new Set(content.dichVu.sau)];
      const removed =
        nextServices === null
          ? []
          : currentServices.filter((s) => !nextServices.includes(s));
      // Như B10: khoá khung giờ TRƯỚC khi đọc lịch hẹn, để không lịch hẹn nào lọt giữa lúc tính và lúc ghi
      await this.impact.lockSlotsOfDays(
        manager,
        request.chiNhanhId,
        request.hieuLucTuDate,
        removed.length > 0
          ? [...ALL_DAYS]
          : input.changedDays.map((d) => d.thuTrongTuan),
      );
      // Q46: tính LẠI tại hieu_luc_tu, không tin bản chụp lúc duyệt (bắt cả lịch hẹn mới, CN-68)
      const impact = await this.impact.compute(manager, {
        chiNhanhId: request.chiNhanhId,
        tuLuc: request.hieuLucTuDate,
        changedDays: input.changedDays,
        removedServiceIds: removed,
      });
      // Q8 lúc áp dụng (Trung chốt 22/11/2026): còn bác sĩ dùng dịch vụ sắp bỏ ⇒ quá hạn như còn lịch hay ca
      const doctors = await this.branches.doctorsUsingServices(
        manager,
        request.chiNhanhId,
        removed,
      );
      if (impact.lichHen.length + impact.ca.length + doctors.length > 0)
        return this.markOverdue(manager, request, now, {
          lichHen: impact.lichHen.length,
          ca: impact.ca.length,
          bacSi: doctors.length,
        });

      for (const day of input.changedDays)
        await this.branches.replaceScheduleRow(
          manager,
          request.chiNhanhId,
          day,
        );
      if (nextServices !== null) {
        await this.branches.removeServices(
          manager,
          request.chiNhanhId,
          removed,
        );
        await this.branches.addServices(
          manager,
          request.chiNhanhId,
          nextServices.filter((s) => !currentServices.includes(s)),
        );
      }
      // Đã khoá hàng nên luôn đổi đúng 1 dòng; vẫn kiểm để không bao giờ báo "đã áp dụng" khi DB không đổi
      if (
        (await this.requests.mark(manager, {
          id,
          column: 'ap_dung_luc',
          now,
        })) !== 1
      )
        throw new Error('không đặt được ap_dung_luc');
      return { kind: 'DaApDung' };
    });
  }

  /**
   * Quá hạn (Q48): KHÔNG áp dụng gì (không áp dụng một phần), đặt `qua_han_luc`; cảnh báo trong ứng dụng cho mọi Admin Toàn hệ thống đang hoạt động
   * và người đề xuất (một người một cái). Phiên bản sự kiện = số lần dời + 1: sau mỗi lần dời rồi lại quá hạn là cảnh báo MỚI (CN-109).
   * Từ đây job không chọn yêu cầu này nữa; lối thoát là dời hiệu lực (B22) hay hủy (B21).
   */
  private async markOverdue(
    manager: EntityManager,
    request: LockedForApply,
    now: Date,
    counts: { lichHen: number; ca: number; bacSi: number },
  ): Promise<ApplyOutcome> {
    if (
      (await this.requests.mark(manager, {
        id: request.yeuCauThayDoiChiNhanhId,
        column: 'qua_han_luc',
        now,
      })) !== 1
    )
      throw new Error('không đặt được qua_han_luc');
    const recipients = new Set(
      (await this.requests.activeSystemAdmins(manager)).map(
        (a) => a.taiKhoanId,
      ),
    );
    recipients.add(request.nguoiDeXuatId);
    // [đề xuất] (Trung chốt 22/11/2026: chữ đối chiếu Figma ở F6b/X1)
    const noiDung = `Yêu cầu thay đổi lịch hoạt động của chi nhánh ${request.tenChiNhanh} đã đến thời điểm dự kiến có hiệu lực ${humanTime(request.hieuLucTu ?? '')} nhưng chưa được áp dụng vì còn ${String(counts.lichHen)} lịch hẹn, ${String(counts.ca)} ca làm việc và ${String(counts.bacSi)} bác sĩ cần xử lý. Hãy dời hiệu lực hoặc hủy yêu cầu.`;
    for (const taiKhoanId of recipients)
      await this.notifier.notify(manager, {
        yeuCauId: request.yeuCauThayDoiChiNhanhId,
        taiKhoanId,
        event: {
          type: BRANCH_CHANGE_EVENTS.OVERDUE,
          version: request.soLanDoiHieuLuc + 1,
        },
        noiDung,
        now,
      });
    return { kind: 'QuaHan', ...counts };
  }
}
