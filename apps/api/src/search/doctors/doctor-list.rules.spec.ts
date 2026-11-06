import { filterSortPage } from './doctor-list.rules.js';
import type { PublicDoctorItem } from './public-doctor.dto.js';

// B5 — TBS-11, TBS-12: lọc giá/điểm, sắp xếp, cắt trang trong bộ nhớ (hàm thuần).
function doctor(
  id: string,
  over: {
    hoTen?: string;
    nam?: number;
    giaKham?: string;
    diem?: string | null;
    luot?: number;
  } = {},
): PublicDoctorItem {
  return {
    bacSiId: id,
    hoTen: over.hoTen ?? `Bác sĩ ${id}`,
    chucDanh: 'BS',
    soNamKinhNghiem: over.nam ?? 5,
    chuyenKhoa: { chuyenKhoaId: '1', ten: 'Tim mạch' },
    chiNhanh: { chiNhanhId: '1', ten: 'CN1', diaChi: 'Địa chỉ' },
    dichVu: { dichVuKhamId: '1', ten: 'Khám', thoiLuong: 30 },
    gia: {
      giaMacDinh: '200000.00',
      phuPhi: '0.00',
      giaKham: over.giaKham ?? '200000.00',
      mucDatCoc: '0.00',
    },
    danhGia: { diemTrungBinh: over.diem ?? null, soDanhGia: over.luot ?? 0 },
  };
}

const none = {
  giaTuCents: null,
  giaDenCents: null,
  diemTuTenths: null,
  sapXep: 'kinhNghiem' as const,
};
const window = { page: 1, pageSize: 20 };
const ids = (r: { items: PublicDoctorItem[] }) => r.items.map((i) => i.bacSiId);

describe('B5 — filterSortPage', () => {
  it('TBS-12: lọc giá là khoảng đóng ở cả hai đầu, so bằng số nguyên', () => {
    const items = [
      doctor('1', { giaKham: '199999.99' }),
      doctor('2', { giaKham: '200000.00' }),
      doctor('3', { giaKham: '300000.00' }),
      doctor('4', { giaKham: '300000.01' }),
    ];
    const result = filterSortPage(
      items,
      { ...none, giaTuCents: 20000000n, giaDenCents: 30000000n },
      window,
    );
    expect(ids(result).sort()).toEqual(['2', '3']);
    expect(result.total).toBe(2);
  });

  it('TBS-07/12: diemTu 4 giữ 4.0, loại 3.9 và bác sĩ chưa có đánh giá', () => {
    const items = [
      doctor('1', { diem: '4.0', luot: 3 }),
      doctor('2', { diem: '3.9', luot: 9 }),
      doctor('3', { diem: null }),
      doctor('4', { diem: '4.5', luot: 1 }),
    ];
    const result = filterSortPage(items, { ...none, diemTuTenths: 40 }, window);
    expect(ids(result).sort()).toEqual(['1', '4']);
  });

  it('TBS-12: không lọc diemTu thì bác sĩ chưa có đánh giá vẫn hiện', () => {
    expect(
      filterSortPage([doctor('1', { diem: null })], none, window).total,
    ).toBe(1);
  });

  it('TBS-12: mặc định kinh nghiệm giảm dần → họ tên → id (ổn định khi trùng)', () => {
    const items = [
      doctor('10', { nam: 5, hoTen: 'B' }),
      doctor('2', { nam: 5, hoTen: 'A' }),
      doctor('3', { nam: 9, hoTen: 'Z' }),
      doctor('4', { nam: 5, hoTen: 'A' }),
    ];
    // id so như số: '2' < '4' (không phải so chuỗi, '10' < '2').
    expect(ids(filterSortPage(items, none, window))).toEqual([
      '3',
      '2',
      '4',
      '10',
    ]);
  });

  it('TBS-12: giaTangDan, trùng giá thì theo thứ tự mặc định', () => {
    const items = [
      doctor('1', { giaKham: '500000.00', nam: 1 }),
      doctor('2', { giaKham: '300000.00', nam: 1 }),
      doctor('3', { giaKham: '300000.00', nam: 8 }),
    ];
    expect(
      ids(filterSortPage(items, { ...none, sapXep: 'giaTangDan' }, window)),
    ).toEqual(['3', '2', '1']);
  });

  it('TBS-12: danhGiaCao, chưa có đánh giá xếp cuối, trùng điểm thì nhiều lượt trước', () => {
    const items = [
      doctor('1', { diem: null }),
      doctor('2', { diem: '4.5', luot: 2 }),
      doctor('3', { diem: '4.5', luot: 10 }),
      doctor('4', { diem: '5.0', luot: 1 }),
    ];
    expect(
      ids(filterSortPage(items, { ...none, sapXep: 'danhGiaCao' }, window)),
    ).toEqual(['4', '3', '2', '1']);
  });

  it('TBS-11: 25 bác sĩ khớp, trang 2 cỡ 20 ⇒ 5 phần tử, total 25', () => {
    const items = Array.from({ length: 25 }, (_, i) => doctor(String(i + 1)));
    const result = filterSortPage(items, none, { page: 2, pageSize: 20 });
    expect(result.items).toHaveLength(5);
    expect(result).toMatchObject({ total: 25, page: 2, pageSize: 20 });
  });

  it('TBS-10 (biên): không khớp ⇒ items rỗng, total 0; trang quá cuối ⇒ rỗng nhưng total đúng', () => {
    expect(filterSortPage([], none, window)).toMatchObject({
      items: [],
      total: 0,
    });
    const one = filterSortPage([doctor('1')], none, { page: 5, pageSize: 20 });
    expect(one).toMatchObject({ items: [], total: 1 });
  });

  it('không làm đổi mảng đầu vào', () => {
    const items = [doctor('2'), doctor('1')];
    filterSortPage(items, none, window);
    expect(items.map((i) => i.bacSiId)).toEqual(['2', '1']);
  });
});
