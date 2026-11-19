import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../../appointments/testing/statement-recorder.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { DoctorFixtures } from '../testing/doctor-fixtures.js';
import { AdminLeaveListDto } from './admin-leave.dto.js';
import { AdminLeaveRepository } from './admin-leave.repository.js';
import { AdminLeaveService } from './admin-leave.service.js';
import type { AppointmentLeaveReadPort } from './appointment-leave-read.port.js';

// Doctor UX2 (G15) — danh sách yêu cầu nghỉ của Quản trị viên trả `lyDo` trên MySQL 8.4 THẬT, mức dịch vụ: PD-01, PD-02, PD-15, PD-16, QH-02 (phần lý do).
// Phần HTTP (vai trò, mã lỗi, tập khoá, log): test/doctor-admin-leave-list.e2e-spec.ts. Cổng đọc lịch hẹn của booking là bản giả (không liên quan tới lý do).
// Mọi lý do dưới đây là chữ GIẢ; chuỗi đánh dấu `BI_MAT_…` dùng để chứng minh một lý do KHÔNG xuất hiện ở bất cứ đâu trong phản hồi.
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const A_MARK = 'BI_MAT_CHI_NHANH_A_4Z8';
const B_MARK = 'BI_MAT_CHI_NHANH_B_7Q2';

function createService() {
  // Giữ riêng hàm giả để test đếm lời gọi mà không phải tham chiếu phương thức của đối tượng (unbound-method)
  const listAffected = vi
    .fn()
    .mockResolvedValue({ tong: 0, soBenhNhan: 0, soCoCoc: 0, items: [] });
  const affected: AppointmentLeaveReadPort = {
    listAffected,
    countByShifts: vi.fn().mockResolvedValue({}),
  };
  const service = new AdminLeaveService(
    db,
    new AdminLeaveRepository(db),
    new BranchAccessPolicy(),
    affected,
  );
  return { service, listAffected };
}

const query = (overrides: Partial<AdminLeaveListDto> = {}) =>
  Object.assign(new AdminLeaveListDto(), overrides);

const setCreatedAt = (id: string, at: string) =>
  db.query(
    `UPDATE yeu_cau_nghi_phep SET thoi_diem_tao = ? WHERE yeu_cau_nghi_phep_id = ?`,
    [at, id],
  );

/** Chi nhánh A (bác sĩ A, Admin Toàn hệ thống) và chi nhánh B (bác sĩ B), mỗi chi nhánh một Admin Chi nhánh (chỉ cần phạm vi). */
async function setup() {
  const world = await fx.world();
  const branchB = await fx.admin.branch();
  await fx.admin.weeklySchedule(branchB.chiNhanhId);
  const doctorB = await fx.admin.doctor(branchB, {}, { hoTen: 'Trần Thị Bê' });
  return {
    branchB,
    doctorAId: world.doctor.account.taiKhoanId,
    doctorBId: doctorB.account.taiKhoanId,
    adminId: world.systemAdmin.account.taiKhoanId,
    scopeA: { kind: 'ChiNhanh', chiNhanhId: world.branch.chiNhanhId } as const,
    scopeB: { kind: 'ChiNhanh', chiNhanhId: branchB.chiNhanhId } as const,
  };
}

const processed = (adminId: string) => ({
  nguoiXuLyId: adminId,
  thoiDiemXuLy: '2026-11-05 09:00:00',
});

describe('doctor UX2 — danh sách yêu cầu nghỉ trả lý do (MySQL thật, mức dịch vụ)', () => {
  it('DUX2-05 PD-01 PD-02 mỗi hàng trả đúng lyDo của CHÍNH nó (ba trạng thái, ba lý do khác nhau) và khớp chi tiết của hàng đó', async () => {
    const w = await setup();
    const waiting = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      lyDo: 'Lý do của yêu cầu chờ duyệt',
    });
    const approved = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      trangThai: 'DaDuyet',
      lyDo: 'Lý do của yêu cầu đã duyệt',
      ...processed(w.adminId),
    });
    const rejected = await fx.leaveRequest({
      bacSiId: w.doctorBId,
      trangThai: 'TuChoi',
      lyDo: 'Lý do của yêu cầu bị từ chối',
      ...processed(w.adminId),
    });
    const { service } = createService();

    const page = await service.list(SYSTEM, query());

    const byId = Object.fromEntries(
      page.items.map((item) => [item.yeuCauNghiPhepId, item.lyDo]),
    );
    expect(byId).toEqual({
      [waiting]: 'Lý do của yêu cầu chờ duyệt',
      [approved]: 'Lý do của yêu cầu đã duyệt',
      [rejected]: 'Lý do của yêu cầu bị từ chối',
    });
    for (const id of [waiting, approved, rejected])
      expect((await service.get(SYSTEM, id)).lyDo).toBe(byId[id]);
  });

  it('DUX2-06 QH-02 PD-15 Toàn hệ thống thấy lý do mọi chi nhánh; Admin Chi nhánh KHÔNG thấy lý do chi nhánh khác ở bất cứ đâu trong phản hồi', async () => {
    const w = await setup();
    await fx.leaveRequest({
      bacSiId: w.doctorAId,
      lyDo: `Việc riêng ${A_MARK}`,
    });
    await fx.leaveRequest({
      bacSiId: w.doctorBId,
      lyDo: `Việc riêng ${B_MARK}`,
    });
    const { service } = createService();

    const all = JSON.stringify(await service.list(SYSTEM, query()));
    expect(all).toContain(A_MARK);
    expect(all).toContain(B_MARK);

    // Admin Chi nhánh A: thấy A; cố lọc sang chi nhánh B hay bác sĩ B vẫn không lộ B
    for (const attempt of [
      query(),
      query({ chiNhanhId: w.branchB.chiNhanhId }),
      query({ bacSiId: w.doctorBId }),
    ]) {
      const seen = JSON.stringify(await service.list(w.scopeA, attempt));
      expect(seen).not.toContain(B_MARK);
    }
    expect(JSON.stringify(await service.list(w.scopeA, query()))).toContain(
      A_MARK,
    );
    // Và ngược lại cho Admin Chi nhánh B
    const seenByB = JSON.stringify(await service.list(w.scopeB, query()));
    expect(seenByB).toContain(B_MARK);
    expect(seenByB).not.toContain(A_MARK);
  });

  it('DUX2-07 PD-16 bác sĩ đã đổi chi nhánh: lý do đi theo chi nhánh HIỆN TẠI', async () => {
    const w = await setup();
    await fx.leaveRequest({
      bacSiId: w.doctorAId,
      lyDo: `Lý do cũ ${A_MARK}`,
    });
    await db.query(
      `UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?`,
      [w.branchB.chiNhanhId, w.doctorAId],
    );
    const { service } = createService();

    expect(JSON.stringify(await service.list(w.scopeB, query()))).toContain(
      A_MARK,
    );
    expect(JSON.stringify(await service.list(w.scopeA, query()))).not.toContain(
      A_MARK,
    );
  });

  it('DUX2-08 lý do dài 500 điểm mã, HTML, dấu nháy, % _ \\, emoji 4 byte, tiếng Việt, xuống dòng và khoảng trắng hai đầu về NGUYÊN VẸN (không cắt, không thoát)', async () => {
    const w = await setup();
    const long = 'Đ'.repeat(250) + 'ệ'.repeat(249) + '🩺';
    expect(Array.from(long)).toHaveLength(500);
    const samples = [
      long,
      '<b>đậm</b> & <script>x</script>',
      `dấu nháy ' và " và \\ và % và _`,
      'dòng một\ndòng hai\r\ndòng ba',
      '  khoảng trắng hai đầu  ',
      'đi khám 🩺 cùng gia đình 👨‍👩‍👧',
    ];
    const ids: string[] = [];
    for (const lyDo of samples)
      ids.push(await fx.leaveRequest({ bacSiId: w.doctorAId, lyDo }));
    const { service } = createService();

    const page = await service.list(SYSTEM, query());

    for (const [index, lyDo] of samples.entries()) {
      const item = page.items.find((i) => i.yeuCauNghiPhepId === ids[index]);
      expect(item?.lyDo).toBe(lyDo);
    }
  });

  it('DUX2-09 danh sách vẫn CHỈ ĐỌC: không câu nào có FOR UPDATE, FOR SHARE, INSERT, UPDATE, DELETE (không thêm khoá khi thêm lyDo)', async () => {
    const w = await setup();
    await fx.leaveRequest({ bacSiId: w.doctorAId });
    const { service } = createService();
    const statements = recordStatements(db);

    await service.list(SYSTEM, query());

    expect(statements.length).toBeGreaterThan(0);
    expect(statements.filter((sql) => WRITE_OR_LOCK_SQL.test(sql))).toEqual([]);
    // Có đọc cột lý do trong câu danh sách (không thêm câu riêng cho lý do)
    expect(statements.filter((sql) => /\bly_do\b/.test(sql))).toHaveLength(1);
  });

  it('DUX2-10 phân trang trang 2, mới nhất trước: mỗi lyDo đi cùng đúng hàng của nó', async () => {
    const w = await setup();
    const reasons = new Map<string, string>();
    const ordered: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const lyDo = `Lý do số ${i + 1}`;
      const id = await fx.leaveRequest({ bacSiId: w.doctorAId, lyDo });
      await setCreatedAt(id, `2026-11-0${i + 1} 08:00:00`);
      reasons.set(id, lyDo);
      ordered.unshift(id);
    }
    const { service } = createService();

    const page = await service.list(SYSTEM, query({ page: 2, pageSize: 2 }));

    expect(page.items.map((i) => i.yeuCauNghiPhepId)).toEqual(
      ordered.slice(2, 4),
    );
    for (const item of page.items)
      expect(item.lyDo).toBe(reasons.get(item.yeuCauNghiPhepId));
    expect(page.total).toBe(5);
  });

  it('DUX2-11 yêu cầu TuChoi vẫn trả lý do của Bác sĩ, soLichHenBiAnhHuong vẫn null và không hỏi booking cho hàng đó', async () => {
    const w = await setup();
    const id = await fx.leaveRequest({
      bacSiId: w.doctorAId,
      trangThai: 'TuChoi',
      lyDo: 'Lý do xin nghỉ của bác sĩ',
      ...processed(w.adminId),
    });
    const { service, listAffected } = createService();

    const page = await service.list(SYSTEM, query());

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      yeuCauNghiPhepId: id,
      lyDo: 'Lý do xin nghỉ của bác sĩ',
      soLichHenBiAnhHuong: null,
    });
    expect(listAffected).not.toHaveBeenCalled();
  });
});
