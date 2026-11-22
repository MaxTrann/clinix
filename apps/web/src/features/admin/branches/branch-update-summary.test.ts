import { summarizeBranchUpdate } from './branch-update-summary';
import type { Branch, BranchUpdateResult } from './branch-types';

// Admin F6b — CN-89, CN-27b: kết quả Sửa lịch / dịch vụ nêu rõ phần ĐÃ LƯU NGAY và phần ĐANG CHỜ DUYỆT (Q2).

const branch = {} as Branch;
const empty = { items: [], tong: 0 };

function result(
  overrides: Partial<BranchUpdateResult> = {},
): BranchUpdateResult {
  return {
    chiNhanh: branch,
    daLuu: [],
    yeuCau: null,
    anhHuong: { lichHen: empty, ca: empty },
    canhBao: { khungGioTrongNgoaiLich: empty },
    ...overrides,
  };
}

describe('CN-89 tóm tắt kết quả sửa chi nhánh', () => {
  it('AF6B-04 không có ảnh hưởng: mọi phần lưu ngay, không có câu chờ duyệt', () => {
    const summary = summarizeBranchUpdate(
      result({ daLuu: ['ten', 'lichHoatDong', 'dichVuKham'] }),
    );
    expect(summary).toEqual({
      saved: 'Đã lưu ngay: tên, lịch hoạt động, dịch vụ khả dụng.',
      pending: null,
      warning: null,
    });
  });

  it('AF6B-04 CN-27b có ảnh hưởng: tên/địa chỉ lưu ngay, lịch và dịch vụ thành yêu cầu chờ duyệt kèm số lịch hẹn và ca', () => {
    const summary = summarizeBranchUpdate(
      result({
        daLuu: ['ten', 'diaChi'],
        yeuCau: {
          yeuCauThayDoiChiNhanhId: '9',
          trangThai: 'ChoDuyet',
          thuThayDoi: [1, 7],
          dichVuThem: ['4'],
          dichVuBo: ['5', '6'],
        },
        anhHuong: {
          lichHen: { items: [], tong: 3 },
          ca: { items: [], tong: 1 },
        },
      }),
    );
    expect(summary.saved).toBe('Đã lưu ngay: tên, địa chỉ.');
    expect(summary.pending).toBe(
      'Đã gửi yêu cầu thay đổi chờ Quản trị viên Toàn hệ thống duyệt (lịch Thứ 2, CN; thêm 1 dịch vụ; bỏ 2 dịch vụ), vì có 3 lịch hẹn và 1 ca làm việc bị ảnh hưởng. Phần này chưa áp dụng.',
    );
  });

  it('AF6B-04 chỉ gửi yêu cầu, không lưu gì ngay ⇒ không có câu "Đã lưu"', () => {
    const summary = summarizeBranchUpdate(
      result({
        yeuCau: {
          yeuCauThayDoiChiNhanhId: '9',
          trangThai: 'ChoDuyet',
          thuThayDoi: [1],
          dichVuThem: [],
          dichVuBo: [],
        },
      }),
    );
    expect(summary.saved).toBeNull();
    expect(summary.pending).toContain('(lịch Thứ 2)');
  });

  it('AF6B-04 khung giờ trống ngoài lịch mới ⇒ cảnh báo; 0 ⇒ không', () => {
    expect(
      summarizeBranchUpdate(
        result({
          daLuu: ['lichHoatDong'],
          canhBao: { khungGioTrongNgoaiLich: { items: [], tong: 2 } },
        }),
      ).warning,
    ).toBe(
      'Có 2 khung giờ còn trống nằm ngoài lịch mới; bệnh nhân không đặt được các khung giờ này.',
    );
  });
});
