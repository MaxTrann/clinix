import {
  changedDaysOf,
  impactInputOf,
  parseRequestContent,
} from '../request-content.js';

// Admin B9 — đọc nội dung yêu cầu (hàm thuần; quy tắc 43). CN-87 (dạng cũ), YCB-03 [đề xuất mã] (dạng hiện hành, dữ liệu hỏng).
const row = (thu: number, over: Record<string, unknown> = {}) => ({
  thu_trong_tuan: thu,
  hoat_dong: true,
  gio_bat_dau_sang: '08:00:00',
  gio_ket_thuc_sang: '12:00:00',
  gio_bat_dau_chieu: '13:00:00',
  gio_ket_thuc_chieu: '17:00:00',
  ...over,
});
const off = {
  hoat_dong: false,
  gio_bat_dau_sang: null,
  gio_ket_thuc_sang: null,
  gio_bat_dau_chieu: null,
  gio_ket_thuc_chieu: null,
};

describe('YCB-03 dạng hiện hành', () => {
  it('ghép trước/sau theo thứ, sắp theo thứ; khoảng null ⇒ null', () => {
    const content = parseRequestContent(
      { lich_hoat_dong: [row(3), row(1)] },
      {
        lich_hoat_dong: [
          row(3, { gio_bat_dau_chieu: null, gio_ket_thuc_chieu: null }),
          row(1, off),
        ],
      },
    );
    expect(content.coDangCu).toBe(false);
    expect(content.dichVu).toBeNull();
    expect(changedDaysOf(content)).toEqual([1, 3]);
    expect(content.lichHoatDong[0]).toEqual({
      thuTrongTuan: 1,
      truoc: {
        hoatDong: true,
        sang: { batDau: '08:00:00', ketThuc: '12:00:00' },
        chieu: { batDau: '13:00:00', ketThuc: '17:00:00' },
      },
      sau: { hoatDong: false, sang: null, chieu: null },
    });
    expect(content.lichHoatDong[1]?.sau?.chieu).toBeNull();
  });

  it('dịch vụ: danh sách đầy đủ trước/sau; đầu vào tính ảnh hưởng gồm thứ mới và dịch vụ bỏ', () => {
    const content = parseRequestContent(
      { lich_hoat_dong: [row(2)], dich_vu_kham_ids: ['1', '2', '3'] },
      { lich_hoat_dong: [row(2, off)], dich_vu_kham_ids: ['1', '4'] },
    );
    expect(content.dichVu).toEqual({ truoc: ['1', '2', '3'], sau: ['1', '4'] });
    expect(impactInputOf(content)).toEqual({
      changedDays: [
        {
          thuTrongTuan: 2,
          hoatDong: false,
          gioBatDauSang: null,
          gioKetThucSang: null,
          gioBatDauChieu: null,
          gioKetThucChieu: null,
        },
      ],
      removedServiceIds: ['2', '3'],
    });
  });

  it('JSON dạng chuỗi (tuỳ driver) đọc như object', () => {
    const content = parseRequestContent(
      JSON.stringify({ lich_hoat_dong: [row(5)] }),
      JSON.stringify({ lich_hoat_dong: [row(5, off)] }),
    );
    expect(changedDaysOf(content)).toEqual([5]);
  });

  it('dữ liệu hỏng không ném lỗi: thứ ngoài 1..7, phần tử không phải object, khóa lạ, chuỗi JSON hỏng bị bỏ qua', () => {
    const content = parseRequestContent(
      { ten: 'Cũ', lich_hoat_dong: [row(0), 'x', row(8)] },
      '{hỏng',
    );
    expect(content).toEqual({
      lichHoatDong: [],
      dichVu: null,
      coDangCu: false,
    });
  });
});

describe('CN-87 dạng cũ gio_mo_cua/gio_dong_cua', () => {
  it('hiển thị được giờ mở/đóng cũ và đánh dấu không tính lại được', () => {
    const content = parseRequestContent(
      {
        lich_hoat_dong: [
          {
            thu_trong_tuan: 1,
            hoat_dong: true,
            gio_mo_cua: '08:00:00',
            gio_dong_cua: '17:00:00',
          },
        ],
      },
      {
        lich_hoat_dong: [
          {
            thu_trong_tuan: 1,
            hoat_dong: false,
            gio_mo_cua: null,
            gio_dong_cua: null,
          },
        ],
      },
    );
    expect(content.coDangCu).toBe(true);
    expect(content.lichHoatDong).toEqual([
      {
        thuTrongTuan: 1,
        truoc: {
          hoatDong: true,
          sang: null,
          chieu: null,
          dangCu: { gioMoCua: '08:00:00', gioDongCua: '17:00:00' },
        },
        sau: {
          hoatDong: false,
          sang: null,
          chieu: null,
          dangCu: { gioMoCua: null, gioDongCua: null },
        },
      },
    ]);
  });
});
