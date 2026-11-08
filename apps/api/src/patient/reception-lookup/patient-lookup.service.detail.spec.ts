import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { RelativeResponse } from '../relatives/relatives.dto.js';
import type { RelativesRepository } from '../relatives/relatives.repository.js';
import type { PatientDetailProfile } from './patient-lookup.dto.js';
import type { PatientLookupRepository } from './patient-lookup.repository.js';
import { PatientLookupService } from './patient-lookup.service.js';

// Task B7 — service getDetail: lấy hồ sơ rồi người thân của CHÍNH id đó, 404 cùng thân khi không có hàng (và KHÔNG đọc tiếp), chỉ ra đúng khoá, không giao dịch,
// lỗi của repository đi nguyên. Repository và kết nối giả; SQL thật ở patient-lookup.repository.detail.spec.ts và patient-lookup.detail.int-spec.ts.
// Mã ca PDS-nn là [đề xuất] (TRACKING B7-G). File MỚI (không sửa patient-lookup.service.spec.ts của B6).
const manager = { marker: 'manager' } as unknown as EntityManager;

const profile = (): PatientDetailProfile => ({
  hoTen: 'Nguyễn Văn Thử',
  email: 'thu@example.invalid',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '1990-05-15',
  diaChi: '12 Đường Giả, Quận Giả',
  thoiDiemTao: '2026-11-08T01:00:00.000Z',
  trangThai: 'DangHoatDong',
  soLanVangMat: 3,
});

const relative = (id: string, active: boolean): RelativeResponse => ({
  hoSoNguoiThanId: id,
  hoTen: `Người thân ${id}`,
  moiQuanHe: 'Con',
  gioiTinh: 'Nu',
  ngaySinh: '2018-03-04',
  soDienThoai: id === '2' ? null : '0911222333',
  trangThaiHieuLuc: active,
});

function build(
  found: PatientDetailProfile | null = profile(),
  relatives: RelativeResponse[] = [],
) {
  const findDetail = vi.fn((_em: EntityManager, _id: string) =>
    Promise.resolve(found),
  );
  const findRelatives = vi.fn((_em: EntityManager, _id: string) =>
    Promise.resolve(relatives),
  );
  const transaction = vi.fn();
  const service = new PatientLookupService(
    { manager, transaction } as unknown as DataSource,
    { findDetail } as unknown as PatientLookupRepository,
    { findRelatives } as unknown as RelativesRepository,
  );
  return { service, findDetail, findRelatives, transaction };
}

describe('PatientLookupService.getDetail', () => {
  it('PDS-01 (TC-11, H3) gọi findDetail rồi findRelatives, cùng manager của kết nối và CÙNG id (không id nào khác); trả hồ sơ cùng người thân', async () => {
    const order: string[] = [];
    const t = build(profile(), [relative('9', true)]);
    t.findDetail.mockImplementation(() => {
      order.push('findDetail');
      return Promise.resolve(profile());
    });
    t.findRelatives.mockImplementation(() => {
      order.push('findRelatives');
      return Promise.resolve([relative('9', true)]);
    });

    const result = await t.service.getDetail('9007199254740993');

    expect(order).toStrictEqual(['findDetail', 'findRelatives']);
    expect(t.findDetail.mock.calls).toStrictEqual([
      [manager, '9007199254740993'],
    ]);
    expect(t.findRelatives.mock.calls).toStrictEqual([
      [manager, '9007199254740993'],
    ]);
    expect(result.hoTen).toBe('Nguyễn Văn Thử');
    expect(result.nguoiThan).toHaveLength(1);
  });

  it('PDS-02 (TC-12, Q27) không có hàng ⇒ AppException 404 KHONG_TIM_THAY (đúng thân mặc định) và findRelatives KHÔNG được gọi', async () => {
    const t = build(null);

    const error: unknown = await t.service.getDetail('5').then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
    expect((error as AppException).getResponse()).toStrictEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    });
    expect(t.findDetail).toHaveBeenCalledOnce();
    expect(t.findRelatives).not.toHaveBeenCalled();
  });

  it('PDS-03 (Q18, TC-11) mỗi người thân ra ĐÚNG sáu khoá: không hoSoNguoiThanId, kể cả khi repository trả khoá thừa', async () => {
    const withExtra = {
      ...relative('7', true),
      benhNhanId: '3',
      diaChi: 'x',
    } as RelativeResponse;
    const t = build(profile(), [withExtra]);

    const { nguoiThan } = await t.service.getDetail('3');

    expect(nguoiThan).toStrictEqual([
      {
        hoTen: 'Người thân 7',
        moiQuanHe: 'Con',
        gioiTinh: 'Nu',
        ngaySinh: '2018-03-04',
        soDienThoai: '0911222333',
        trangThaiHieuLuc: true,
      },
    ]);
    expect(Object.keys(nguoiThan[0] ?? {}).sort()).toStrictEqual([
      'gioiTinh',
      'hoTen',
      'moiQuanHe',
      'ngaySinh',
      'soDienThoai',
      'trangThaiHieuLuc',
    ]);
  });

  it('PDS-04 (TC-11) giữ NGUYÊN thứ tự người thân của repository (đang dùng trước), giữ cả hai trạng thái và SĐT null; không người thân ⇒ []', async () => {
    const t = build(profile(), [
      relative('4', true),
      relative('2', false),
      relative('1', false),
    ]);

    const { nguoiThan } = await t.service.getDetail('3');

    expect(nguoiThan.map((r) => r.hoTen)).toStrictEqual([
      'Người thân 4',
      'Người thân 2',
      'Người thân 1',
    ]);
    expect(nguoiThan.map((r) => r.trangThaiHieuLuc)).toStrictEqual([
      true,
      false,
      false,
    ]);
    expect(nguoiThan[1]?.soDienThoai).toBeNull();
    await expect(build().service.getDetail('3')).resolves.toMatchObject({
      nguoiThan: [],
    });
  });

  it('PDS-04c (Q14, TC-11) không giới hạn số người thân: repository trả 8 người thân xen kẽ đang dùng và đã ngừng ⇒ nguoiThan đủ 8 phần tử, đúng thứ tự repository trả, mỗi phần tử đúng sáu khoá', async () => {
    const eight = Array.from({ length: 8 }, (_, i) =>
      relative(String(i + 1), i % 2 === 0),
    );
    const t = build(profile(), eight);

    const { nguoiThan } = await t.service.getDetail('3');

    expect(nguoiThan).toHaveLength(8);
    expect(nguoiThan.map((r) => r.hoTen)).toStrictEqual(
      eight.map((r) => r.hoTen),
    );
    expect(nguoiThan.map((r) => r.trangThaiHieuLuc)).toStrictEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    for (const item of nguoiThan) {
      expect(Object.keys(item).sort()).toStrictEqual([
        'gioiTinh',
        'hoTen',
        'moiQuanHe',
        'ngaySinh',
        'soDienThoai',
        'trangThaiHieuLuc',
      ]);
    }
  });

  it('PDS-05 (Q18, H4) gốc ra ĐÚNG mười khoá theo thứ tự của PLAN 5.7, không khoá thừa dù findDetail trả thêm (matKhauBam, loaiTaiKhoan, taiKhoanId)', async () => {
    const dirty = {
      ...profile(),
      matKhauBam: '$argon2id$gia',
      loaiTaiKhoan: 'BenhNhan',
      taiKhoanId: '3',
      khoaDatLichDoNoShow: false,
    } as PatientDetailProfile;
    const t = build(dirty, [relative('1', true)]);

    const result = await t.service.getDetail('3');

    expect(Object.keys(result)).toStrictEqual([
      'hoTen',
      'email',
      'soDienThoai',
      'gioiTinh',
      'ngaySinh',
      'diaChi',
      'thoiDiemTao',
      'trangThai',
      'soLanVangMat',
      'nguoiThan',
    ]);
    expect(result).toMatchObject(profile());
  });

  it('PDS-05b giá trị null của gioiTinh, ngaySinh, diaChi đi nguyên (không bị đổi thành chuỗi rỗng), soLanVangMat 0 vẫn là số 0', async () => {
    const t = build({
      ...profile(),
      gioiTinh: null,
      ngaySinh: null,
      diaChi: null,
      soLanVangMat: 0,
    });

    const result = await t.service.getDetail('3');

    expect(result.gioiTinh).toBeNull();
    expect(result.ngaySinh).toBeNull();
    expect(result.diaChi).toBeNull();
    expect(result.soLanVangMat).toBe(0);
  });

  it('PDS-06 (BM-02) lỗi của findDetail và của findRelatives đi nguyên: không bọc, không nuốt, không đổi thông điệp', async () => {
    const failure = new Error('mất kết nối');
    const detailFails = build();
    detailFails.findDetail.mockRejectedValueOnce(failure);
    await expect(detailFails.service.getDetail('3')).rejects.toBe(failure);
    expect(detailFails.findRelatives).not.toHaveBeenCalled();

    const relativesFail = build();
    relativesFail.findRelatives.mockRejectedValueOnce(failure);
    await expect(relativesFail.service.getDetail('3')).rejects.toBe(failure);
  });

  it('PDS-07 (TC-14, F) chỉ đọc: không mở giao dịch, chỉ dùng manager của kết nối', async () => {
    const t = build(profile(), [relative('1', true)]);

    await t.service.getDetail('3');

    expect(t.transaction).not.toHaveBeenCalled();
  });
});
