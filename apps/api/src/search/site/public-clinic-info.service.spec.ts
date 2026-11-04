import { PublicClinicInfoService } from './public-clinic-info.service.js';
import type { PublicClinicInfoRepository } from './public-clinic-info.repository.js';

const serviceWith = (row: unknown) =>
  new PublicClinicInfoService({
    find: vi.fn().mockResolvedValue(row),
  } as unknown as PublicClinicInfoRepository);

describe('B7 — PublicClinicInfoService', () => {
  it('KC-05: trả đúng bốn trường công khai', async () => {
    const info = {
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: '12 Đường Mẫu',
      duongDayNong: '1900 1234',
      email: 'support@example.com',
    };
    await expect(serviceWith(info).get()).resolves.toEqual(info);
  });

  it('AN-04: chưa có dòng nào ⇒ mọi trường null', async () => {
    await expect(serviceWith(null).get()).resolves.toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
  });

  it('một số trường NULL được giữ nguyên null; trường lạ của dòng không lọt ra ngoài', async () => {
    const result = await serviceWith({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: null,
      email: 'a@b.vn',
      id: 1,
      truongNoiBo: 'bí mật',
    }).get();
    expect(result).toEqual({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: null,
      duongDayNong: null,
      email: 'a@b.vn',
    });
    expect(Object.keys(result).sort()).toEqual([
      'diaChiTruSo',
      'duongDayNong',
      'email',
      'tenThuongHieu',
    ]);
  });
});
