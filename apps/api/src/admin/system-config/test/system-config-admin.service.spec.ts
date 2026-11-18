import 'reflect-metadata';
import { QueryFailedError, type EntityManager } from 'typeorm';
import { AuditError } from '../../../audit/audit-error.js';
import type { AuditService } from '../../../audit/audit.service.js';
import type {
  AppException,
  ErrorBody,
} from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { CauHinhHeThong } from '../../entities/cau-hinh-he-thong.entity.js';
import type { SystemConfigAdminRepository } from '../system-config-admin.repository.js';
import { SystemConfigAdminService } from '../system-config-admin.service.js';
import type { UpdateSystemConfigDto } from '../system-config.dto.js';
import type { SystemConfigService } from '../system-config.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '12' };
const manager = { tag: 'manager' } as unknown as EntityManager;
const ACTOR = '7';
const REASON = 'Tăng giờ giữ chỗ';

// Object thuần thoả hình dạng entity (không gán kiểu class để spread ở các ca dưới không mất prototype)
const ROW = {
  id: 1,
  thoiGianGiuCho: 15,
  thoiDiemNhacLich: [72, 24, 2],
  soLichHenToiDaMoiHoSo: 3,
  soLanTuDoiLichToiDa: 2,
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  thoiHanPhanHoiLoiMoi: 60,
  soMucChoToiDa: 2,
  nguongNoShow: 3,
  soNgayBaoTruocDoiGioLam: 3,
  trongSoW1: '0.60',
  trongSoW2: '0.40',
} satisfies CauHinhHeThong;
const COLUMNS = [
  'thoi_gian_giu_cho',
  'thoi_diem_nhac_lich',
  'so_lich_hen_toi_da_moi_ho_so',
  'so_lan_tu_doi_lich_toi_da',
  'check_in_truoc_phut',
  'check_in_sau_phut',
  'thoi_han_phan_hoi_loi_moi',
  'so_muc_cho_toi_da',
  'nguong_no_show',
  'so_ngay_bao_truoc_doi_gio_lam',
  'trong_so_w1',
  'trong_so_w2',
];

// Thân PUT đã qua DTO: chỉ khoá có mặt
const dto = (values: Record<string, unknown>) =>
  ({ lyDo: REASON, ...values }) as unknown as UpdateSystemConfigDto;

// Bỏ các khoá khỏi một object (để dựng thân thiếu cột)
const without = (values: object, ...keys: string[]) =>
  Object.fromEntries(
    Object.entries(values).filter(([key]) => !keys.includes(key)),
  );

// Bảy tham số bắt buộc khi tạo lần đầu
const REQUIRED_SEVEN = {
  soLichHenToiDaMoiHoSo: 3,
  soLanTuDoiLichToiDa: 2,
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  soNgayBaoTruocDoiGioLam: 3,
  trongSoW1: 0.6,
  trongSoW2: 0.4,
};

function duplicateKeyError() {
  const driver = Object.assign(new Error('driver'), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
  });
  return new QueryFailedError('INSERT INTO cau_hinh_he_thong', [], driver);
}

describe('B5 CH — SystemConfigAdminService (repository và AuditService giả)', () => {
  const repository = {
    transaction: vi.fn(),
    lockRow: vi.fn(),
    insertRow: vi.fn(),
    updateRow: vi.fn(),
    reload: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const reader = { get: vi.fn() };
  const service = new SystemConfigAdminService(
    reader as unknown as SystemConfigService,
    repository as unknown as SystemConfigAdminRepository,
    audit as unknown as AuditService,
    new BranchAccessPolicy(),
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repository.transaction.mockImplementation(
      (work: (m: EntityManager) => Promise<unknown>) => work(manager),
    );
  });

  describe('đọc (GET)', () => {
    it('CH-10: chưa có dòng ⇒ chuaCauHinh = true và mười hai giá trị null, không giá trị ngầm', async () => {
      reader.get.mockResolvedValue(null);
      const result = await service.read();
      expect(result.chuaCauHinh).toBe(true);
      const values = without(result, 'chuaCauHinh');
      expect(Object.keys(values)).toHaveLength(12);
      expect(Object.values(values).every((value) => value === null)).toBe(true);
    });

    it('trả đủ mười hai giá trị kiểu số; trọng số decimal về số, không chuỗi', async () => {
      reader.get.mockResolvedValue(ROW);
      expect(await service.read()).toEqual({
        chuaCauHinh: false,
        thoiGianGiuCho: 15,
        thoiDiemNhacLich: [72, 24, 2],
        soLichHenToiDaMoiHoSo: 3,
        soLanTuDoiLichToiDa: 2,
        checkInTruocPhut: 30,
        checkInSauPhut: 15,
        thoiHanPhanHoiLoiMoi: 60,
        soMucChoToiDa: 2,
        nguongNoShow: 3,
        soNgayBaoTruocDoiGioLam: 3,
        trongSoW1: 0.6,
        trongSoW2: 0.4,
      });
    });

    it('CHB5-03: dòng cũ lưu nhắc lịch lệch thứ tự vẫn được trả đã chuẩn hoá giảm dần; không trả id', async () => {
      reader.get.mockResolvedValue({ ...ROW, thoiDiemNhacLich: [2, 72, 24] });
      const result = await service.read();
      expect(result.thoiDiemNhacLich).toEqual([72, 24, 2]);
      expect(result).not.toHaveProperty('id');
    });

    it('lỗi đọc DB không biến thành "chưa cấu hình"', async () => {
      const error = new Error('TEST_DB_DOWN');
      reader.get.mockRejectedValue(error);
      await expect(service.read()).rejects.toBe(error);
    });
  });

  describe('quyền', () => {
    it('CH-09: Quản trị viên Chi nhánh bị 403 TRƯỚC mọi truy vấn', async () => {
      await expect(
        service.update(branch, ACTOR, dto({ thoiGianGiuCho: 20 })),
      ).rejects.toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
      expect(repository.transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('cập nhật khi đã có dòng', () => {
    it('CH-01: sửa MỘT tham số: khoá hàng, UPDATE đúng cột đổi, rồi ghi nhật ký cùng manager; trả cấu hình đã lưu', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({ ...ROW, thoiGianGiuCho: 20 });
      const result = await service.update(
        system,
        ACTOR,
        dto({ thoiGianGiuCho: 20 }),
      );
      expect(repository.lockRow).toHaveBeenCalledWith(manager);
      expect(repository.updateRow).toHaveBeenCalledExactlyOnceWith(manager, {
        thoiGianGiuCho: 20,
      });
      expect(repository.insertRow).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledExactlyOnceWith(manager, {
        actorId: ACTOR,
        branchId: null,
        action: 'CapNhatCauHinh',
        targetType: 'cau_hinh_he_thong',
        targetId: '1',
        result: 'ThanhCong',
        changes: {
          truoc: { thoi_gian_giu_cho: 15 },
          sau: { thoi_gian_giu_cho: 20 },
          ly_do: REASON,
        },
      });
      expect(result).toMatchObject({ chuaCauHinh: false, thoiGianGiuCho: 20 });
      // Thứ tự: khoá ⇒ UPDATE ⇒ đọc lại ⇒ nhật ký
      const order = (fn: { mock: { invocationCallOrder: number[] } }) =>
        fn.mock.invocationCallOrder[0]!;
      expect(order(repository.lockRow)).toBeLessThan(
        order(repository.updateRow),
      );
      expect(order(repository.updateRow)).toBeLessThan(
        order(repository.reload),
      );
      expect(order(repository.reload)).toBeLessThan(order(audit.record));
    });

    it('CH-02: sửa NHIỀU tham số ⇒ MỘT lần UPDATE, MỘT dòng nhật ký, truoc và sau cùng tập khoá chỉ gồm tham số đổi', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({
        ...ROW,
        thoiGianGiuCho: 20,
        nguongNoShow: 5,
        thoiDiemNhacLich: [48, 12],
      });
      await service.update(
        system,
        ACTOR,
        dto({
          thoiGianGiuCho: 20,
          nguongNoShow: 5,
          thoiDiemNhacLich: [12, 48],
          soMucChoToiDa: 2, // không đổi: không được vào nhật ký
        }),
      );
      expect(repository.updateRow).toHaveBeenCalledExactlyOnceWith(manager, {
        thoiGianGiuCho: 20,
        thoiDiemNhacLich: [48, 12],
        nguongNoShow: 5,
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      const changes = audit.record.mock.calls[0]![1].changes as {
        truoc: object;
        sau: object;
      };
      expect(changes.truoc).toEqual({
        thoi_gian_giu_cho: 15,
        thoi_diem_nhac_lich: [72, 24, 2],
        nguong_no_show: 3,
      });
      expect(changes.sau).toEqual({
        thoi_gian_giu_cho: 20,
        thoi_diem_nhac_lich: [48, 12],
        nguong_no_show: 5,
      });
    });

    it.each([
      ['thân chỉ có lyDo', {}],
      [
        'mọi giá trị trùng dòng hiện có',
        { thoiGianGiuCho: 15, nguongNoShow: 3 },
      ],
      ['trọng số 0.6 so với chuỗi "0.60" trong DB', { trongSoW1: 0.6 }],
      ['nhắc lịch cùng tập, khác thứ tự', { thoiDiemNhacLich: [2, 24, 72] }],
      [
        'gửi lại đủ mười hai giá trị y hệt',
        {
          thoiGianGiuCho: 15,
          thoiDiemNhacLich: [72, 24, 2],
          soLichHenToiDaMoiHoSo: 3,
          soLanTuDoiLichToiDa: 2,
          checkInTruocPhut: 30,
          checkInSauPhut: 15,
          thoiHanPhanHoiLoiMoi: 60,
          soMucChoToiDa: 2,
          nguongNoShow: 3,
          soNgayBaoTruocDoiGioLam: 3,
          trongSoW1: 0.6,
          trongSoW2: 0.4,
        },
      ],
    ])(
      'CH-03 và CHB5-03: không đổi gì (%s) ⇒ 400 KHONG_CO_THAY_DOI, không UPDATE, không nhật ký',
      async (_label, values) => {
        repository.lockRow.mockResolvedValue(ROW);
        await expect(
          service.update(system, ACTOR, dto(values)),
        ).rejects.toMatchObject({
          status: 400,
          maLoi: 'KHONG_CO_THAY_DOI',
          response: { thongBao: 'Không có thay đổi nào để lưu.' },
        });
        expect(repository.updateRow).not.toHaveBeenCalled();
        expect(repository.reload).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
      },
    );

    it('CHB5-04: gửi MỘT nửa cặp trọng số thì kiểm tổng với nửa còn lại của dòng hiện có', async () => {
      repository.lockRow.mockResolvedValue(ROW); // w1 0.60, w2 0.40
      await expect(
        service.update(system, ACTOR, dto({ trongSoW1: 0.7 })),
      ).rejects.toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        response: {
          loi: [
            { truong: 'trongSoW1', ma: 'TONG_TRONG_SO_KHAC_1' },
            { truong: 'trongSoW2', ma: 'TONG_TRONG_SO_KHAC_1' },
          ],
        },
      });
      expect(repository.updateRow).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('CHB5-04: đổi CẢ HAI trọng số về tổng 1,00 thì được; nhật ký ghi số, không chuỗi', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({
        ...ROW,
        trongSoW1: '0.70',
        trongSoW2: '0.30',
      });
      await service.update(
        system,
        ACTOR,
        dto({ trongSoW1: 0.7, trongSoW2: 0.3 }),
      );
      expect(repository.updateRow).toHaveBeenCalledWith(manager, {
        trongSoW1: 0.7,
        trongSoW2: 0.3,
      });
      const changes = audit.record.mock.calls[0]![1].changes as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
      };
      expect(changes.truoc).toEqual({ trong_so_w1: 0.6, trong_so_w2: 0.4 });
      expect(changes.sau).toEqual({ trong_so_w1: 0.7, trong_so_w2: 0.3 });
    });

    it('CHB5-04: tổng ≠ 1,00 khi đổi cả hai (0.6 + 0.5) ⇒ 400, không ghi gì', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      await expect(
        service.update(system, ACTOR, dto({ trongSoW1: 0.5, trongSoW2: 0.6 })),
      ).rejects.toMatchObject({ status: 400, maLoi: 'DU_LIEU_KHONG_HOP_LE' });
      expect(repository.updateRow).not.toHaveBeenCalled();
    });

    it('CHB5-04: đổi tham số KHÁC khi tổng cũ trong DB lệch (dữ liệu cũ) vẫn được, vì trọng số không bị đụng', async () => {
      const legacy = { ...ROW, trongSoW1: '0.50', trongSoW2: '0.20' };
      repository.lockRow.mockResolvedValue(legacy);
      repository.reload.mockResolvedValue({ ...legacy, nguongNoShow: 4 });
      await expect(
        service.update(system, ACTOR, dto({ nguongNoShow: 4 })),
      ).resolves.toMatchObject({ nguongNoShow: 4 });
    });

    it('CH-18: khoá nhật ký là TÊN CỘT, giá trị là số hoặc mảng số (không chuỗi)', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({
        ...ROW,
        thoiGianGiuCho: 20,
        trongSoW1: '0.70',
        trongSoW2: '0.30',
        thoiDiemNhacLich: [48, 12],
      });
      await service.update(
        system,
        ACTOR,
        dto({
          thoiGianGiuCho: 20,
          trongSoW1: 0.7,
          trongSoW2: 0.3,
          thoiDiemNhacLich: [48, 12],
        }),
      );
      const { truoc, sau } = audit.record.mock.calls[0]![1].changes as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
      };
      for (const side of [truoc, sau])
        for (const [key, value] of Object.entries(side)) {
          expect(COLUMNS).toContain(key);
          expect(
            typeof value === 'number' ||
              (Array.isArray(value) &&
                value.every((item) => typeof item === 'number')),
            key,
          ).toBe(true);
        }
      expect(Object.keys(truoc)).toEqual(Object.keys(sau));
    });

    it('lý do được chuyển nguyên văn vào nhật ký', async () => {
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({ ...ROW, soMucChoToiDa: 4 });
      await service.update(
        system,
        ACTOR,
        dto({ lyDo: 'Mở thêm mục chờ', soMucChoToiDa: 4 }),
      );
      expect(audit.record.mock.calls[0]![1].changes).toMatchObject({
        ly_do: 'Mở thêm mục chờ',
      });
    });
  });

  describe('tạo lần đầu (Q35)', () => {
    it('CH-11: đủ bảy cột bắt buộc ⇒ INSERT đúng phần gửi, nhật ký truoc = null và sau đủ 12 khoá đọc lại từ DB', async () => {
      repository.lockRow.mockResolvedValue(null);
      repository.reload.mockResolvedValue(ROW); // DB đã điền DEFAULT cho 5 cột còn lại
      const result = await service.update(system, ACTOR, dto(REQUIRED_SEVEN));
      expect(repository.insertRow).toHaveBeenCalledExactlyOnceWith(
        manager,
        REQUIRED_SEVEN,
      );
      expect(repository.updateRow).not.toHaveBeenCalled();
      const { truoc, sau } = audit.record.mock.calls[0]![1].changes as {
        truoc: Record<string, unknown>;
        sau: Record<string, unknown>;
      };
      expect(Object.keys(truoc)).toEqual(COLUMNS);
      expect(Object.values(truoc).every((value) => value === null)).toBe(true);
      expect(sau).toEqual({
        thoi_gian_giu_cho: 15,
        thoi_diem_nhac_lich: [72, 24, 2],
        so_lich_hen_toi_da_moi_ho_so: 3,
        so_lan_tu_doi_lich_toi_da: 2,
        check_in_truoc_phut: 30,
        check_in_sau_phut: 15,
        thoi_han_phan_hoi_loi_moi: 60,
        so_muc_cho_toi_da: 2,
        nguong_no_show: 3,
        so_ngay_bao_truoc_doi_gio_lam: 3,
        trong_so_w1: 0.6,
        trong_so_w2: 0.4,
      });
      expect(result.chuaCauHinh).toBe(false);
    });

    it('CHB5-06: gửi kèm cột có DEFAULT thì INSERT mang theo; nhắc lịch được chuẩn hoá', async () => {
      repository.lockRow.mockResolvedValue(null);
      repository.reload.mockResolvedValue({
        ...ROW,
        thoiGianGiuCho: 30,
        thoiDiemNhacLich: [48, 12],
      });
      await service.update(
        system,
        ACTOR,
        dto({
          ...REQUIRED_SEVEN,
          thoiGianGiuCho: 30,
          thoiDiemNhacLich: [12, 48],
        }),
      );
      expect(repository.insertRow).toHaveBeenCalledWith(manager, {
        ...REQUIRED_SEVEN,
        thoiGianGiuCho: 30,
        thoiDiemNhacLich: [48, 12],
      });
    });

    it('CH-12: thiếu cột bắt buộc ⇒ 400 liệt kê ĐỦ cột thiếu theo thứ tự bảng, không INSERT, không nhật ký', async () => {
      repository.lockRow.mockResolvedValue(null);
      const missingTwo = without(REQUIRED_SEVEN, 'checkInSauPhut', 'trongSoW2');
      await expect(
        service.update(system, ACTOR, dto(missingTwo)),
      ).rejects.toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        response: {
          loi: [
            { truong: 'checkInSauPhut', ma: 'CAU_HINH_THIEU_GIA_TRI' },
            { truong: 'trongSoW2', ma: 'CAU_HINH_THIEU_GIA_TRI' },
          ],
        },
      });
      expect(repository.insertRow).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('CHB5-11: thân chỉ có lyDo khi chưa có dòng ⇒ 400 thiếu cả bảy cột (không phải KHONG_CO_THAY_DOI)', async () => {
      repository.lockRow.mockResolvedValue(null);
      const failure = await service.update(system, ACTOR, dto({})).then(
        () => null,
        (error: unknown) => error as AppException,
      );
      expect(failure).toMatchObject({
        status: 400,
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
      });
      const { loi } = failure!.getResponse() as ErrorBody;
      expect(loi).toHaveLength(7);
      expect(loi).toContainEqual({
        truong: 'soLichHenToiDaMoiHoSo',
        ma: 'CAU_HINH_THIEU_GIA_TRI',
      });
      expect(repository.insertRow).not.toHaveBeenCalled();
    });

    it('tạo lần đầu cũng kiểm w1 + w2 = 1,00', async () => {
      repository.lockRow.mockResolvedValue(null);
      await expect(
        service.update(
          system,
          ACTOR,
          dto({ ...REQUIRED_SEVEN, trongSoW1: 0.5, trongSoW2: 0.4 }),
        ),
      ).rejects.toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        response: {
          loi: [
            { truong: 'trongSoW1', ma: 'TONG_TRONG_SO_KHAC_1' },
            { truong: 'trongSoW2', ma: 'TONG_TRONG_SO_KHAC_1' },
          ],
        },
      });
      expect(repository.insertRow).not.toHaveBeenCalled();
    });
  });

  describe('đua khi tạo lần đầu (CH-13)', () => {
    it('INSERT bị 1062 (người khác vừa tạo): chạy lại đúng MỘT lần, lần hai thấy dòng và đi đường cập nhật', async () => {
      repository.lockRow
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...ROW, thoiGianGiuCho: 20 });
      repository.insertRow.mockRejectedValueOnce(duplicateKeyError());
      repository.reload.mockResolvedValue({ ...ROW, thoiGianGiuCho: 25 });
      const result = await service.update(
        system,
        ACTOR,
        dto({ ...REQUIRED_SEVEN, thoiGianGiuCho: 25 }),
      );
      expect(repository.transaction).toHaveBeenCalledTimes(2);
      expect(repository.updateRow).toHaveBeenCalledWith(manager, {
        thoiGianGiuCho: 25,
      });
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record.mock.calls[0]![1].changes).toMatchObject({
        truoc: { thoi_gian_giu_cho: 20 },
        sau: { thoi_gian_giu_cho: 25 },
      });
      expect(result.thoiGianGiuCho).toBe(25);
    });

    it('1062 hai lần liên tiếp ⇒ ném lỗi gốc, không chạy lại lần thứ ba', async () => {
      const error = duplicateKeyError();
      repository.lockRow.mockResolvedValue(null);
      repository.insertRow.mockRejectedValue(error);
      await expect(
        service.update(system, ACTOR, dto(REQUIRED_SEVEN)),
      ).rejects.toBe(error);
      expect(repository.transaction).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['lỗi thường', new Error('TEST_DB_DOWN')],
      [
        'khoá ngoại (người thực hiện không tồn tại)',
        new QueryFailedError(
          'INSERT INTO nhat_ky_hanh_dong',
          [],
          Object.assign(new Error('fk'), {
            code: 'ER_NO_REFERENCED_ROW_2',
            errno: 1452,
          }),
        ),
      ],
    ])('%s: không chạy lại', async (_label, error) => {
      repository.lockRow.mockResolvedValue(null);
      repository.insertRow.mockRejectedValue(error);
      await expect(
        service.update(system, ACTOR, dto(REQUIRED_SEVEN)),
      ).rejects.toBe(error);
      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('lỗi ghi nhật ký (CH-14)', () => {
    it('AUDIT_WRITE_FAILED nổi nguyên ra (giao dịch của người gọi sẽ rollback); không bắt, không chạy lại', async () => {
      const error = new AuditError('AUDIT_WRITE_FAILED');
      repository.lockRow.mockResolvedValue(ROW);
      repository.reload.mockResolvedValue({ ...ROW, thoiGianGiuCho: 20 });
      audit.record.mockRejectedValue(error);
      await expect(
        service.update(system, ACTOR, dto({ thoiGianGiuCho: 20 })),
      ).rejects.toBe(error);
      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });

    it('lỗi ghi nhật ký khi đang TẠO lần đầu cũng nổi ra', async () => {
      const error = new AuditError('AUDIT_WRITE_FAILED');
      repository.lockRow.mockResolvedValue(null);
      repository.reload.mockResolvedValue(ROW);
      audit.record.mockRejectedValue(error);
      await expect(
        service.update(system, ACTOR, dto(REQUIRED_SEVEN)),
      ).rejects.toBe(error);
      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });
  });
});
