import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import {
  casesLabel,
  isNotFoundError,
  monthButtonName,
  noneInYear,
  PATIENT_TEXT,
  truncatedNote,
} from './patient-exam-text';

// doctor-exam F5: chữ của trang Hồ sơ khám bệnh (Figma `414:2`, `415:2`, `443:2`) và các câu ghép số. Câu Figma viết NGUYÊN VĂN ở đây (không import hằng) để đổi chữ ở mã là test đỏ; câu `[đề xuất]` là chữ Đại đã duyệt trực tiếp 16/11/2026.
describe('doctor-exam F5 — chữ của trang', () => {
  it('WXH-02 chữ Figma: tiêu đề, mô tả, chip, ngăn phải, nhãn hàng', () => {
    expect(PATIENT_TEXT.title).toBe('Hồ sơ khám bệnh');
    expect(PATIENT_TEXT.subtitle).toBe(
      'Lịch sử khám và ghi chú của bác sĩ cho các ca đã hoàn thành.',
    );
    expect(PATIENT_TEXT.allPeople).toBe('Tất cả người đi khám');
    expect(PATIENT_TEXT.panePrompt).toBe('Chọn một ca khám để xem hồ sơ');
    expect(PATIENT_TEXT.panePromptHint).toBe(
      'Nhấn vào mục bất kỳ ở danh sách bên trái',
    );
    expect(PATIENT_TEXT.hasRecord).toBe('Đã có hồ sơ');
    expect(PATIENT_TEXT.noRecord).toBe('Chưa có hồ sơ');
    expect(PATIENT_TEXT.detailLink).toBe('Xem chi tiết lịch hẹn →');
  });

  it('WXH-04, WXH-05 chữ Figma của ngăn chi tiết: nhãn thẻ đầu, bốn khối, hộp "Chưa có hồ sơ khám"', () => {
    expect(PATIENT_TEXT.visit).toEqual({
      completed: 'Hoàn thành',
      doctor: 'Bác sĩ',
      date: 'Ngày khám',
      branch: 'Chi nhánh',
      examinee: 'Người khám',
    });
    expect(PATIENT_TEXT.content.title).toBe('Nội dung hồ sơ khám');
    expect(PATIENT_TEXT.content.symptoms).toBe('Triệu chứng');
    expect(PATIENT_TEXT.content.diagnosis).toBe('Chẩn đoán sơ bộ');
    expect(PATIENT_TEXT.content.advice).toBe('Hướng xử lý / Lời khuyên');
    expect(PATIENT_TEXT.content.returnDate).toBe('Ngày tái khám dự kiến');
    expect(PATIENT_TEXT.content.updatedPrefix).toBe('Cập nhật lần cuối');
    expect(PATIENT_TEXT.missing.title).toBe('Chưa có hồ sơ khám');
    expect(PATIENT_TEXT.missing.hint).toBe(
      'Ca khám đã hoàn thành nhưng bác sĩ chưa ghi nội dung khám. Hồ sơ sẽ hiển thị tại đây sau khi bác sĩ cập nhật.',
    );
  });

  it('WXH-06 chữ [đề xuất] đã duyệt: đang tải, rỗng ba mức, 404, trống', () => {
    expect(PATIENT_TEXT.loading).toBe('Đang tải hồ sơ khám bệnh...');
    expect(PATIENT_TEXT.paneLoading).toBe('Đang tải hồ sơ khám...');
    expect(PATIENT_TEXT.noneYet).toBe('Bạn chưa có ca khám nào đã hoàn thành.');
    expect(noneInYear(2026)).toBe(
      'Năm 2026 chưa có ca khám nào đã hoàn thành.',
    );
    expect(PATIENT_TEXT.noneInMonth).toBe(
      'Tháng này chưa có ca khám nào đã hoàn thành.',
    );
    expect(PATIENT_TEXT.notFound).toBe('Không tìm thấy ca khám này.');
    expect(PATIENT_TEXT.content.blank).toBe('Chưa ghi');
  });

  it('WXH-17 tên truy cập đã duyệt: nhóm lọc, năm, tháng, ngăn chi tiết', () => {
    expect(PATIENT_TEXT.peopleGroup).toBe('Lọc theo người khám');
    expect(PATIENT_TEXT.yearGroup).toBe('Năm');
    expect(PATIENT_TEXT.monthGroup).toBe('Chọn tháng');
    expect(PATIENT_TEXT.paneTitle).toBe('Chi tiết ca khám');
  });

  it('WXH-02 số ca ghép vào câu: "2 ca", tên ô tháng "Tháng 5, 1 ca" và "Tháng 1, không có ca", ghi chú hơn 50 ca', () => {
    expect(casesLabel(2)).toBe('2 ca');
    expect(casesLabel(0)).toBe('0 ca');
    expect(monthButtonName(5, 1)).toBe('Tháng 5, 1 ca');
    expect(monthButtonName(12, 51)).toBe('Tháng 12, 51 ca');
    expect(monthButtonName(1, 0)).toBe('Tháng 1, không có ca');
    expect(truncatedNote(50, 51)).toBe(
      'Hiển thị 50 trên 51 ca. Hãy chọn người khám để thu hẹp.',
    );
  });

  it('WXH-06 chỉ 404 `KHONG_TIM_THAY` là "không thấy" (không Thử lại); lỗi khác, kể cả mã HTTP 404 mang mã lỗi lạ, thì không', () => {
    const body = { maLoi: 'KHONG_TIM_THAY', thongBao: 'x' };
    expect(isNotFoundError(new ApiError(404, body))).toBe(true);
    expect(
      isNotFoundError(new ApiError(404, { maLoi: 'LOI_LA', thongBao: 'x' })),
    ).toBe(false);
    expect(
      isNotFoundError(
        new ApiError(503, { maLoi: 'HE_THONG_DANG_BAN', thongBao: 'x' }),
      ),
    ).toBe(false);
    expect(isNotFoundError(new NetworkError())).toBe(false);
    expect(isNotFoundError(new UnexpectedResponseError(200))).toBe(false);
    expect(isNotFoundError('KHONG_TIM_THAY')).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
