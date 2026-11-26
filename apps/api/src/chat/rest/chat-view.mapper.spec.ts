import type { ChatActor } from '../core/chat-access.policy.js';
import type {
  HeaderRow,
  MessageRow,
} from '../read/conversation-read.repository.js';
import {
  HAS_VISITED_EXISTS,
  VISITED_STATUSES,
} from '../read/relationship.query.js';
import {
  excerptOf,
  partnerOf,
  senderName,
  toDetail,
  toListItem,
  toMessageItem,
} from './chat-view.mapper.js';

// chat B2 — dựng thân phản hồi theo vai trò (PLAN chat 5.6; QCH-11 phần U, NBN-08 phần U, Q15, Q16, Q18, Q23, MH8). Hàm thuần, không DB.
const patient: ChatActor = { vaiTro: 'BenhNhan', taiKhoanId: '10' };
const doctor: ChatActor = { vaiTro: 'BacSi', taiKhoanId: '20' };
const reception: ChatActor = {
  vaiTro: 'LeTan',
  taiKhoanId: '30',
  chiNhanhId: '5',
};
const colleague: ChatActor = {
  vaiTro: 'LeTan',
  taiKhoanId: '31',
  chiNhanhId: '5',
};

const header = (overrides: Partial<HeaderRow> = {}): HeaderRow => ({
  hoiThoaiId: '100',
  loai: 'BenhNhan_LeTan',
  chiNhanhId: '5',
  tenChiNhanh: 'Chi nhánh Quận 1',
  benhNhanId: '10',
  benhNhanHoTen: 'Nguyễn Văn An',
  benhNhanSoDienThoai: '0901234567',
  benhNhanTrangThai: 'DangHoatDong',
  bacSiId: null,
  bacSiHoTen: null,
  bacSiTrangThai: null,
  bacSiChucDanh: null,
  laThanhVien: true,
  daTungKham: false,
  soTinChuaDoc: 3,
  ...overrides,
});
const doctorHeader = (overrides: Partial<HeaderRow> = {}) =>
  header({
    loai: 'BenhNhan_BacSi',
    chiNhanhId: null,
    tenChiNhanh: null,
    bacSiId: '20',
    bacSiHoTen: 'Trần Thị Hương',
    bacSiTrangThai: 'DangHoatDong',
    bacSiChucDanh: 'TS_BS',
    ...overrides,
  });
const message = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  tinNhanId: '500',
  hoiThoaiId: '100',
  nguoiGuiId: '30',
  maGui: '6f1c8a52-1111-4222-8333-944455556666',
  noiDung: 'Chào anh',
  tepTenGoc: null,
  tepLoai: null,
  tepDungLuong: null,
  thoiDiemGui: new Date('2026-11-02T01:00:00.000Z'),
  hoTen: 'Lê Thị Lễ Tân',
  loaiTaiKhoan: 'LeTan',
  chucDanh: null,
  ...overrides,
});

describe('chat B2 — tên hiển thị và danh sách trắng (Q18, Q23, QCH-11)', () => {
  it('QCH-11, Q18: Bệnh nhân thấy Lễ tân là "Lễ tân · {chi nhánh}", không bao giờ họ tên hay id Lễ tân; Lễ tân thấy họ tên đồng nghiệp', () => {
    const item = toMessageItem(patient, message(), 'Chi nhánh Quận 1');
    expect(item.nguoiGui).toEqual({
      vaiTro: 'LeTan',
      tenHienThi: 'Lễ tân · Chi nhánh Quận 1',
    });
    expect(JSON.stringify(item)).not.toContain('Lê Thị Lễ Tân');
    expect(JSON.stringify(item)).not.toContain('"30"');
    expect(senderName(colleague, message(), 'Chi nhánh Quận 1')).toBe(
      'Lê Thị Lễ Tân',
    );
    expect(partnerOf(patient, header())).toEqual({
      vaiTro: 'LeTan',
      tenHienThi: 'Lễ tân · Chi nhánh Quận 1',
    });
  });

  it('Bác sĩ hiện "{chức danh} {họ tên}" với mọi người xem; thiếu chức danh (dữ liệu hỏng) thì chỉ họ tên', () => {
    const fromDoctor = message({
      nguoiGuiId: '20',
      hoTen: 'Trần Thị Hương',
      loaiTaiKhoan: 'BacSi',
      chucDanh: 'TS_BS',
    });
    expect(senderName(patient, fromDoctor, null)).toBe('TS.BS. Trần Thị Hương');
    expect(senderName(doctor, fromDoctor, null)).toBe('TS.BS. Trần Thị Hương');
    expect(senderName(patient, { ...fromDoctor, chucDanh: null }, null)).toBe(
      'Trần Thị Hương',
    );
    expect(partnerOf(patient, doctorHeader())).toEqual({
      vaiTro: 'BacSi',
      tenHienThi: 'TS.BS. Trần Thị Hương',
    });
  });

  it('QCH-11, Q23: đối tác của Lễ tân có họ tên và SĐT Bệnh nhân; của Bác sĩ CHỈ họ tên (không khoá soDienThoai)', () => {
    expect(partnerOf(reception, header())).toEqual({
      vaiTro: 'BenhNhan',
      tenHienThi: 'Nguyễn Văn An',
      soDienThoai: '0901234567',
    });
    const forDoctor = partnerOf(doctor, doctorHeader());
    expect(forDoctor).toEqual({
      vaiTro: 'BenhNhan',
      tenHienThi: 'Nguyễn Văn An',
    });
    expect(Object.keys(forDoctor)).not.toContain('soDienThoai');
  });

  it('`maGui` chỉ trả cho chính người gửi; tệp có đủ ba cột mới thành `tep`', () => {
    expect(toMessageItem(reception, message(), null).maGui).toBe(
      '6f1c8a52-1111-4222-8333-944455556666',
    );
    expect(toMessageItem(colleague, message(), null).maGui).toBeNull();
    const withFile = message({
      noiDung: '',
      tepTenGoc: 'phieu.pdf',
      tepLoai: 'application/pdf',
      tepDungLuong: 2048,
    });
    expect(toMessageItem(patient, withFile, null).tep).toEqual({
      ten: 'phieu.pdf',
      loai: 'application/pdf',
      dungLuong: 2048,
    });
    expect(toMessageItem(patient, message(), null).tep).toBeNull();
    expect(toMessageItem(patient, message(), null).thoiDiemGui).toBe(
      '2026-11-02T01:00:00.000Z',
    );
  });
});

describe('chat B2 — trích dẫn tin cuối (MH8)', () => {
  it('tối đa 100 điểm mã (emoji ngoài BMP tính một, không bị cắt đôi); xuống dòng thành dấu cách; dài hơn thì 99 điểm mã kèm "…"', () => {
    expect(excerptOf({ noiDung: 'Dòng 1\nDòng 2\tcuối', tepLoai: null })).toBe(
      'Dòng 1 Dòng 2 cuối',
    );
    const exact = '😀'.repeat(100);
    expect(excerptOf({ noiDung: exact, tepLoai: null })).toBe(exact);
    const long = excerptOf({ noiDung: '😀'.repeat(101), tepLoai: null });
    expect(Array.from(long)).toHaveLength(100);
    expect(long).toBe(`${'😀'.repeat(99)}…`);
  });

  it('tin chỉ có tệp ⇒ "[Ảnh]" hay "[Tệp PDF]", không bao giờ tên tệp', () => {
    expect(excerptOf({ noiDung: '', tepLoai: 'image/webp' })).toBe('[Ảnh]');
    expect(excerptOf({ noiDung: '', tepLoai: 'application/pdf' })).toBe(
      '[Tệp PDF]',
    );
    expect(excerptOf({ noiDung: 'Có chữ', tepLoai: 'image/png' })).toBe(
      'Có chữ',
    );
  });
});

describe('chat B2 — dòng danh sách và đầu khung (Q15, Q16, Q3)', () => {
  it('NBN-08 (U): Lễ tân thấy ChoTraLoi khi tin cuối của Bệnh nhân; DaTraLoi kèm "Bạn" hay họ tên đồng nghiệp; vai trò khác không có nhãn', () => {
    const fromPatient = message({
      nguoiGuiId: '10',
      hoTen: 'Nguyễn Văn An',
      loaiTaiKhoan: 'BenhNhan',
    });
    expect(toListItem(reception, header(), fromPatient)).toMatchObject({
      trangThaiTraLoi: 'ChoTraLoi',
      traLoiBoi: null,
    });
    expect(toListItem(reception, header(), message())).toMatchObject({
      trangThaiTraLoi: 'DaTraLoi',
      traLoiBoi: 'Bạn',
    });
    expect(toListItem(colleague, header(), message())).toMatchObject({
      trangThaiTraLoi: 'DaTraLoi',
      traLoiBoi: 'Lê Thị Lễ Tân',
    });
    expect(toListItem(patient, header(), message())).toMatchObject({
      trangThaiTraLoi: null,
      traLoiBoi: null,
    });
    expect(
      toListItem(patient, header(), message()).tinCuoi.nguoiGuiHienThi,
    ).toBe('Lễ tân · Chi nhánh Quận 1');
    expect(
      toListItem(patient, header(), fromPatient).tinCuoi.nguoiGuiHienThi,
    ).toBe('Bạn');
  });

  it('QCH-11 (U): dòng danh sách đúng tám khoá; quan hệ chỉ ở hội thoại bác sĩ', () => {
    const item = toListItem(
      doctor,
      doctorHeader({ daTungKham: true }),
      message({ nguoiGuiId: '10', loaiTaiKhoan: 'BenhNhan' }),
    );
    expect(Object.keys(item).sort()).toEqual([
      'doiTac',
      'id',
      'loai',
      'quanHe',
      'soTinChuaDoc',
      'tinCuoi',
      'traLoiBoi',
      'trangThaiTraLoi',
    ]);
    expect(item.quanHe).toBe('DaTungKham');
    expect(toListItem(reception, header(), message()).quanHe).toBeNull();
  });

  it('Q3: coTheGui theo bên kia (cùng luật lõi gửi): bác sĩ ngưng ⇒ Bệnh nhân không gửi được; hộp thư chung luôn được; Bệnh nhân ngưng ⇒ Bác sĩ, Lễ tân không gửi được', () => {
    const state = (viewer: ChatActor, h: HeaderRow) => {
      const d = toDetail(viewer, h);
      return [d.coTheGui, d.lyDoKhongGui];
    };
    expect(state(patient, doctorHeader())).toEqual([true, null]);
    expect(
      state(patient, doctorHeader({ bacSiTrangThai: 'NgungHoatDong' })),
    ).toEqual([false, 'CHAT_NGUOI_NHAN_KHONG_HOAT_DONG']);
    expect(
      state(patient, doctorHeader({ bacSiTrangThai: 'ChoKichHoat' }))[0],
    ).toBe(false);
    expect(
      state(patient, header({ benhNhanTrangThai: 'NgungHoatDong' })),
    ).toEqual([true, null]);
    expect(
      state(doctor, doctorHeader({ benhNhanTrangThai: 'NgungHoatDong' }))[0],
    ).toBe(false);
    expect(
      state(reception, header({ benhNhanTrangThai: 'NgungHoatDong' }))[0],
    ).toBe(false);
    expect(toDetail(patient, doctorHeader()).banner).toBe(true);
    expect(toDetail(reception, header()).banner).toBe(false);
  });

  it('Q16: câu "đã từng khám" liệt kê ĐÚNG ba trạng thái của VISITED_STATUSES (không thiếu DaTiepDon, không thêm DaHuy)', () => {
    const listed =
      /trang_thai IN \(([^)]*)\)/.exec(HAS_VISITED_EXISTS)?.[1] ?? '';
    expect(listed.split(',').map((s) => s.trim().replaceAll("'", ''))).toEqual([
      ...VISITED_STATUSES,
    ]);
    expect(HAS_VISITED_EXISTS).toContain('l.benh_nhan_id = h.nguoi_tao_id');
  });
});
