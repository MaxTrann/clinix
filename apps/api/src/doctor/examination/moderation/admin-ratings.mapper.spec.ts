import { keysDeep } from '../testing/patient-exam-stack.js';
import {
  toCounts,
  toDetail,
  toItem,
  type AdminRatingDetailRow,
  type AdminRatingRow,
} from './admin-ratings.mapper.js';

// doctor-exam B7 — ánh xạ hàng thô ⇒ hình dạng trả về (PLAN 5.8; KDD-03, KDD-18, KDD-20). Không DB. Mọi giá trị mong đợi do test viết tay; hàng thô có thêm cột "nhạy cảm" giả để chứng minh danh sách trắng.
const SHOWN: AdminRatingRow = {
  danhGiaId: '501',
  bacSiId: '31',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chiNhanhId: '7',
  chiNhanhTen: 'Chi nhánh Một',
  nguoiDanhGiaHoTen: 'Người Đặt Mẫu',
  soSao: 4,
  nhanXet: 'Tận tình',
  thoiDiemTao: new Date('2026-11-10T09:00:00+07:00'),
  biAn: 0,
};
const HIDDEN: AdminRatingDetailRow = {
  ...SHOWN,
  biAn: 1,
  maLichHen: 'CLX-20261110-7K3QD',
  thoiGianKham: new Date('2026-11-09T08:30:00+07:00'),
  lyDoAn: 'Nội dung quảng cáo',
};
const SHOWN_DETAIL: AdminRatingDetailRow = {
  ...SHOWN,
  maLichHen: 'CLX-20261110-7K3QD',
  thoiGianKham: new Date('2026-11-09T08:30:00+07:00'),
  lyDoAn: null,
};
const ITEM_KEYS = [
  'bacSi',
  'biAn',
  'chiNhanh',
  'danhGiaId',
  'nguoiDanhGia',
  'nhanXet',
  'soSao',
  'thoiDiemTao',
];
const SENSITIVE = {
  email: 'khach@example.com',
  soDienThoai: '0900000000',
  lyDoKham: 'đau đầu',
  benhNhanId: '41',
  matKhauBam: 'x',
};

describe('KDD-03, KDD-20 toItem: đúng tám khoá, danh sách trắng', () => {
  it('đủ giá trị: id là chuỗi, soSao là số, thời điểm ISO UTC, biAn là boolean; lồng nhau đúng khoá', () => {
    expect(toItem(SHOWN)).toEqual({
      danhGiaId: '501',
      bacSi: { bacSiId: '31', hoTen: 'Bác sĩ Mẫu' },
      chiNhanh: { chiNhanhId: '7', ten: 'Chi nhánh Một' },
      nguoiDanhGia: { hoTen: 'Người Đặt Mẫu' },
      soSao: 4,
      nhanXet: 'Tận tình',
      thoiDiemTao: '2026-11-10T02:00:00.000Z',
      biAn: false,
    });
    expect(Object.keys(toItem(SHOWN)).sort()).toEqual(ITEM_KEYS);
  });

  it('KDD-20: hàng thô có thêm email, SĐT, lý do khám, id bệnh nhân, mật khẩu ⇒ không khoá nào lọt ra (kể cả lồng nhau); không có lyDoAn, maLichHen ở danh sách', () => {
    const keys = keysDeep(toItem({ ...SHOWN, ...SENSITIVE } as AdminRatingRow));
    for (const forbidden of [
      ...Object.keys(SENSITIVE),
      'lyDoAn',
      'maLichHen',
      'thoiGianKham',
    ])
      expect(keys).not.toContain(forbidden);
    expect(
      JSON.stringify(toItem({ ...SHOWN, ...SENSITIVE } as AdminRatingRow)),
    ).not.toMatch(/example\.com|0900000000|đau đầu/);
  });

  it('kiểu của driver: id số ⇒ chuỗi; soSao và biAn là chuỗi, số hay boolean đều ra đúng kiểu', () => {
    const row = {
      ...SHOWN,
      danhGiaId: 501 as unknown as string,
      soSao: '5',
      biAn: '1',
    };
    expect(toItem(row)).toMatchObject({
      danhGiaId: '501',
      soSao: 5,
      biAn: true,
    });
    expect(toItem({ ...SHOWN, biAn: true }).biAn).toBe(true);
    expect(toItem({ ...SHOWN, biAn: false }).biAn).toBe(false);
    expect(toItem({ ...SHOWN, biAn: '0' }).biAn).toBe(false);
  });

  it('KDD-18: nhận xét dài bị cắt còn 200 đơn vị; NULL giữ null; không cắt đôi emoji', () => {
    expect(toItem({ ...SHOWN, nhanXet: 'x'.repeat(1000) }).nhanXet).toBe(
      'x'.repeat(200),
    );
    expect(toItem({ ...SHOWN, nhanXet: null }).nhanXet).toBeNull();
    const cut = toItem({ ...SHOWN, nhanXet: `${'a'.repeat(199)}😀` }).nhanXet;
    expect(cut).toBe('a'.repeat(199));
  });
});

describe('KDD-03 toDetail: tám khoá + maLichHen + thoiGianKham; lyDoAn CHỈ khi đã ẩn', () => {
  it('chưa ẩn: đúng mười khoá, KHÔNG có khoá lyDoAn; nhận xét đầy đủ; thoiGianKham ISO UTC', () => {
    const detail = toDetail(SHOWN_DETAIL);
    expect(Object.keys(detail).sort()).toEqual(
      [...ITEM_KEYS, 'maLichHen', 'thoiGianKham'].sort(),
    );
    expect(detail).toMatchObject({
      maLichHen: 'CLX-20261110-7K3QD',
      thoiGianKham: '2026-11-09T01:30:00.000Z',
      biAn: false,
    });
    expect('lyDoAn' in detail).toBe(false);
  });

  it('đã ẩn: có thêm lyDoAn đúng chữ của cột; biAn true', () => {
    const detail = toDetail(HIDDEN);
    expect(Object.keys(detail).sort()).toEqual(
      [...ITEM_KEYS, 'lyDoAn', 'maLichHen', 'thoiGianKham'].sort(),
    );
    expect(detail.lyDoAn).toBe('Nội dung quảng cáo');
    expect(detail.biAn).toBe(true);
  });

  it('lyDoAn quyết theo biAn, không theo ly_do_an có chữ hay không: chưa ẩn mà cột có chữ (DB cấm bằng CHECK) vẫn KHÔNG lộ; đã ẩn mà cột NULL (cũng bị cấm) thì không có khoá', () => {
    expect(
      'lyDoAn' in toDetail({ ...SHOWN_DETAIL, lyDoAn: 'lẽ ra NULL' }),
    ).toBe(false);
    expect('lyDoAn' in toDetail({ ...HIDDEN, lyDoAn: null })).toBe(false);
  });

  it('nhận xét ở chi tiết KHÔNG bị cắt (đủ 1.000 đơn vị)', () => {
    const full = 'x'.repeat(1000);
    expect(toDetail({ ...SHOWN_DETAIL, nhanXet: full }).nhanXet).toBe(full);
    expect(toDetail({ ...SHOWN_DETAIL, nhanXet: null }).nhanXet).toBeNull();
  });

  it('KDD-20: cột nhạy cảm của hàng thô không lọt vào chi tiết', () => {
    const keys = keysDeep(
      toDetail({ ...HIDDEN, ...SENSITIVE } as AdminRatingDetailRow),
    );
    for (const forbidden of Object.keys(SENSITIVE))
      expect(keys).not.toContain(forbidden);
  });
});

describe('KDD-02 toCounts: demTheoTrangThai từ câu đếm', () => {
  it('hai hàng ⇒ hai số (COUNT ra chuỗi hay số đều được); thiếu hàng ⇒ 0; không hàng nào ⇒ cả hai 0', () => {
    expect(
      toCounts([
        { biAn: 0, soLuong: '12' },
        { biAn: 1, soLuong: 3 },
      ]),
    ).toEqual({ HienThi: 12, DaAn: 3 });
    expect(toCounts([{ biAn: '1', soLuong: '2' }])).toEqual({
      HienThi: 0,
      DaAn: 2,
    });
    expect(toCounts([{ biAn: false, soLuong: 5 }])).toEqual({
      HienThi: 5,
      DaAn: 0,
    });
    expect(toCounts([])).toEqual({ HienThi: 0, DaAn: 0 });
  });
});
