import {
  AppException,
  type ErrorBody,
} from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AccountListDto } from '../account.dto.js';
import type { AccountRepository } from '../account.repository.js';
import { AccountService } from '../account.service.js';
import type { AccountRow } from '../account-view.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };

const row = (overrides: Partial<AccountRow> = {}): AccountRow => ({
  taiKhoanId: '10',
  loaiTaiKhoan: 'BenhNhan',
  hoTen: 'Nguyễn Văn A',
  email: 'a@example.com',
  soDienThoai: '0901234567',
  ngaySinh: '1990-05-17',
  gioiTinh: 'Nam',
  diaChi: '12 Lê Lợi',
  trangThai: 'DangHoatDong',
  daXacMinhEmail: 1,
  thoiDiemTao: new Date('2026-11-01T03:00:00.000Z'),
  khoaDatLichDoNoShow: 0,
  soLanNoShow: 0,
  phamViQuanTri: null,
  chiNhanhId: null,
  chiNhanhTen: null,
  ...overrides,
});
const query = (values: Partial<AccountListDto> = {}) =>
  Object.assign(new AccountListDto(), values);

async function failure(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe('AccountService — phạm vi, quy tắc và ánh xạ (repository giả)', () => {
  const repository = { list: vi.fn(), get: vi.fn() };
  const service = new AccountService(
    repository as unknown as AccountRepository,
    new BranchAccessPolicy(),
  );

  beforeEach(() => {
    repository.list.mockReset();
    repository.get.mockReset();
    repository.list.mockResolvedValue({ rows: [], total: 0 });
  });
  afterEach(() => vi.useRealTimers());

  describe('TKB17-06 (TK-03, PQ-07) — list', () => {
    it('Toàn hệ thống: chuyển phạm vi "tất cả", bộ lọc, giới hạn và offset; trả page/pageSize', async () => {
      repository.list.mockResolvedValue({ rows: [row()], total: 41 });
      const result = await service.list(
        system,
        query({
          page: 3,
          pageSize: 10,
          vaiTro: ['BenhNhan'],
          trangThai: 'DangHoatDong',
          khoaNoShow: 'true',
          q: 'an',
        }),
      );
      expect(repository.list).toHaveBeenCalledWith(
        { sql: '1 = 1', parameters: {} },
        {
          vaiTro: ['BenhNhan'],
          trangThai: 'DangHoatDong',
          khoaNoShow: 'true',
          q: 'an',
        },
        10,
        20,
      );
      expect(result).toMatchObject({ total: 41, page: 3, pageSize: 10 });
      expect(result.items).toHaveLength(1);
    });

    it('Toàn hệ thống lọc chi nhánh: điều kiện phạm vi có chi nhánh đó', async () => {
      await service.list(system, query({ chiNhanhId: '5' }));
      const [visibility] = repository.list.mock.calls[0] as [
        { parameters: Record<string, string> },
      ];
      expect(visibility.parameters.accountBranchId).toBe('5');
    });

    it('Chi nhánh: repository nhận chi nhánh CỦA scope, bỏ qua chiNhanhId client gửi (PQ-07)', async () => {
      await service.list(branch, query({ chiNhanhId: '9' }));
      const [visibility] = repository.list.mock.calls[0] as [
        { sql: string; parameters: Record<string, string> },
      ];
      expect(visibility.parameters).toEqual({
        accountBranchId: '7',
        rbacBranchId: '7',
      });
      expect(visibility.sql).not.toContain('QuanTriVien');
    });

    it('q rỗng (sau khi cắt khoảng trắng) không thành bộ lọc', async () => {
      await service.list(system, query({ q: '' }));
      expect(repository.list.mock.calls[0]![1]).toMatchObject({ q: undefined });
    });

    it('items đi qua mapper theo vai người xem: Chi nhánh nhận 8 khoá cho Bệnh nhân', async () => {
      repository.list.mockResolvedValue({ rows: [row()], total: 1 });
      const asBranch = await service.list(branch, query());
      expect(Object.keys(asBranch.items[0]!)).toHaveLength(8);
      const asSystem = await service.list(system, query());
      expect(Object.keys(asSystem.items[0]!)).toHaveLength(13);
    });

    it('SQL lỡ trả hàng Quản trị viên cho Chi nhánh ⇒ lỗi, không bao giờ trả dữ liệu (Q27)', async () => {
      repository.list.mockResolvedValue({
        rows: [
          row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ToanHeThong' }),
        ],
        total: 1,
      });
      await expect(service.list(branch, query())).rejects.toThrow(
        /Quản trị viên/,
      );
    });

    it.each(['true', 'false'] as const)(
      'Chi nhánh gửi khoaNoShow=%s ⇒ 403 KHONG_DU_QUYEN và KHÔNG chạm repository',
      async (value) => {
        const error = await failure(
          service.list(branch, query({ khoaNoShow: value })),
        );
        expect(error.getStatus()).toBe(403);
        expect(error.maLoi).toBe('KHONG_DU_QUYEN');
        expect(repository.list).not.toHaveBeenCalled();
      },
    );

    it('Toàn hệ thống được lọc khoaNoShow', async () => {
      await service.list(system, query({ khoaNoShow: 'false' }));
      expect(repository.list.mock.calls[0]![1]).toMatchObject({
        khoaNoShow: 'false',
      });
    });
  });

  describe('TKB17-03 (TK-05) — offset vượt số nguyên an toàn', () => {
    it('page cực lớn ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm TRANG_KHONG_HOP_LE, không chạm repository', async () => {
      const error = await failure(
        service.list(
          system,
          query({ page: Number.MAX_SAFE_INTEGER, pageSize: 2 }),
        ),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.maLoi).toBe('DU_LIEU_KHONG_HOP_LE');
      expect((error.getResponse() as ErrorBody).loi).toEqual([
        { truong: 'page', ma: 'TRANG_KHONG_HOP_LE' },
      ]);
      expect(repository.list).not.toHaveBeenCalled();
    });

    it('offset ngay dưới ngưỡng an toàn vẫn được chuyển cho repository (DB trả rỗng)', async () => {
      await service.list(
        system,
        query({ page: Number.MAX_SAFE_INTEGER, pageSize: 1 }),
      );
      expect(repository.list).toHaveBeenCalledOnce();
    });
  });

  describe('TKB17-06 (TK-03, TK-21) — get', () => {
    it('không thấy (không tồn tại HOẶC ngoài tầm nhìn) ⇒ 404 KHONG_TIM_THAY', async () => {
      repository.get.mockResolvedValue(null);
      const error = await failure(service.get(branch, '10'));
      expect(error.getStatus()).toBe(404);
      expect(error.maLoi).toBe('KHONG_TIM_THAY');
    });

    it('404 của hai kịch bản (không tồn tại, ngoài phạm vi) có CÙNG thân phản hồi', async () => {
      repository.get.mockResolvedValue(null);
      const missing = await failure(service.get(branch, '999'));
      const outOfScope = await failure(service.get(branch, '10'));
      expect(outOfScope.getResponse()).toEqual(missing.getResponse());
    });

    it('chuyển điều kiện phạm vi của người gọi và đúng id; Chi nhánh không có nhánh Quản trị viên', async () => {
      repository.get.mockResolvedValue(null);
      await failure(service.get(branch, '10'));
      const [visibility, id] = repository.get.mock.calls[0] as [
        { sql: string; parameters: Record<string, string> },
        string,
      ];
      expect(id).toBe('10');
      expect(visibility.parameters.accountBranchId).toBe('7');
      expect(visibility.sql).not.toContain('QuanTriVien');
      await failure(service.get(system, '10'));
      expect(repository.get.mock.calls[1]![0]).toEqual({
        sql: '1 = 1',
        parameters: {},
      });
    });

    it('Chi nhánh xem chi tiết Bệnh nhân: đúng 8 khoá', async () => {
      repository.get.mockResolvedValue({ row: row(), activationLink: null });
      expect(Object.keys(await service.get(branch, '10'))).toHaveLength(8);
    });

    it('Toàn hệ thống xem chi tiết Bệnh nhân: 13 khoá', async () => {
      repository.get.mockResolvedValue({ row: row(), activationLink: null });
      expect(Object.keys(await service.get(system, '10'))).toHaveLength(13);
    });

    it('SQL lỡ trả Quản trị viên cho Chi nhánh ⇒ lỗi, không trả dữ liệu', async () => {
      repository.get.mockResolvedValue({
        row: row({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ChiNhanh' }),
        activationLink: null,
      });
      await expect(service.get(branch, '10')).rejects.toThrow(/Quản trị viên/);
    });
  });

  describe('TKB17-21 (TK A2) — lienKetKichHoat dùng đồng hồ VN', () => {
    const staff = row({
      loaiTaiKhoan: 'LeTan',
      trangThai: 'ChoKichHoat',
      khoaDatLichDoNoShow: null,
      soLanNoShow: null,
      chiNhanhId: '7',
      chiNhanhTen: 'Chi nhánh Quận 7',
    });
    const facts = {
      daDungLuc: null,
      daGuiLuc: new Date('2026-11-18T01:00:00.000Z'),
      thuHoiLuc: null,
      hetHanLuc: new Date('2026-11-19T01:00:00.000Z'),
    };

    it('còn hạn ⇒ HOP_LE; sau hạn ⇒ HET_HAN (đồng hồ giả)', async () => {
      vi.useFakeTimers();
      repository.get.mockResolvedValue({ row: staff, activationLink: facts });
      vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
      expect(await service.get(branch, '10')).toMatchObject({
        lienKetKichHoat: { trangThai: 'HOP_LE', hetHanLuc: facts.hetHanLuc },
      });
      vi.setSystemTime(new Date('2026-11-19T01:00:00.000Z'));
      expect(await service.get(branch, '10')).toMatchObject({
        lienKetKichHoat: { trangThai: 'HET_HAN' },
      });
    });

    it('không có liên kết đang hiệu lực ⇒ lienKetKichHoat là null', async () => {
      repository.get.mockResolvedValue({ row: staff, activationLink: null });
      expect(await service.get(system, '10')).toMatchObject({
        lienKetKichHoat: null,
      });
    });
  });
});
