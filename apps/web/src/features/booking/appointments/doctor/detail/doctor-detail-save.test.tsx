import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanUpDoctorAppointments,
  openDoctorDetail,
} from '../../../testing/doctor-harness';
import { jsonResponse } from '../../../testing/fake-appointment-list-api';
import {
  DOCTOR_CODE,
  makeDoctorDetail,
} from '../../../testing/fake-doctor-api';
import type { DoctorExamRecord } from '../api/doctor-appointment-types';

// doctor-exam F3, mức TRANG: hộp ghi và sửa hồ sơ khám của module `doctor` cắm vào thẻ "Hồ sơ khám bệnh" của "Chi tiết ca khám" (Q20 phương án C: `maLichHen`, họ tên, `thoiGian`, `ghiChuKham` và `reload` đi qua props).
// Mã WHS-17 [đề xuất] (từ nút bấm tới PUT rồi tải lại chi tiết), WHS-05 và WHS-09 mức trang; phần hộp ở `features/doctor/examination/doctor/exam-record-dialog.test.tsx`. Đặc biệt KHOÁ giả định R7 của kế hoạch (TRACKING 19.6):
// "dữ liệu mới đã về" = tham chiếu `ghiChuKham` ĐỔI sau khi trang tải lại (`useKeepPrevious` trả đối tượng MỚI), kể cả khi nội dung y hệt. Dựng bằng harness có sẵn của F11; PUT do test trả lời (bao `fetch` ngay ở đây,
// không sửa `testing/` của booking), mọi GET đi tiếp vào API giả. Dữ liệu giả, không phải của ai.
afterEach(cleanUpDoctorAppointments);

const detailPath = `/doctor/appointments/${DOCTOR_CODE}`;
const NOTE: DoctorExamRecord = {
  trieuChung: 'Đau ngực, khó thở khi gắng sức',
  chanDoanSoBo: 'Ghi nhận ban đầu; cần theo dõi',
  huongXuLy: 'Hạn chế hoạt động thể lực nặng',
  ngayTaiKhamDuKien: '2026-11-10',
  capNhatLanCuoi: '2026-10-18T03:30:00.000Z',
};
const NEWER: DoctorExamRecord = {
  trieuChung: 'Triệu chứng do nơi khác ghi',
  chanDoanSoBo: 'Chẩn đoán do nơi khác ghi',
  huongXuLy: 'Lời khuyên do nơi khác ghi',
  ngayTaiKhamDuKien: null,
  capNhatLanCuoi: '2026-10-18T04:00:00.000Z',
};

// Bao `fetch`: PUT do `respond` trả lời (và ghi lại thân), mọi yêu cầu khác đi tiếp vào API giả
function answerPut(respond: () => Response | Promise<Response>) {
  const inner = globalThis.fetch;
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        puts.push({
          url: String(input),
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return respond();
      }
      return inner(input, init);
    }),
  );
  return puts;
}

const record = () =>
  screen
    .getByRole('heading', { level: 2, name: 'Hồ sơ khám bệnh' })
    .closest('section') as HTMLElement;
const dialog = () => screen.getByRole('dialog');
const box = (label: RegExp) =>
  within(dialog()).getByLabelText(label) as HTMLTextAreaElement;
const type = (element: HTMLElement, value: string) =>
  fireEvent.change(element, { target: { value } });
const saveButton = () =>
  within(dialog()).getByRole('button', { name: 'Lưu ghi chú' });
const apiError = (maLoi: string) =>
  jsonResponse({ maLoi, thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN' }, 409);
const definitions = (root: HTMLElement) =>
  within(root)
    .getAllByRole('definition')
    .map((definition) => definition.textContent);

describe('doctor-exam F3 — ghi và sửa hồ sơ từ trang chi tiết (WHS-17)', () => {
  it('WHS-17 `DaTiepDon` chưa có hồ sơ: bấm `Ghi hồ sơ khám` ⇒ hộp (mã · họ tên) ⇒ MỘT PUT đúng mã, token null ⇒ trang tải lại chi tiết, thẻ đổi sang bốn khối và dòng "Đã lưu hồ sơ khám."', async () => {
    const { api } = await openDoctorDetail({ trangThai: 'DaTiepDon' });
    // Họ tên người khám của chi tiết mẫu (`api.details` là `unknown`: đọc từ chính bộ dựng)
    const hoTen = makeDoctorDetail().nguoiKham.hoTen;
    expect(
      within(record()).getByText('Chưa ghi hồ sơ khám.'),
    ).toBeInTheDocument();
    const puts = answerPut(() => {
      // Máy chủ đã lưu: lần tải lại sau đó thấy hồ sơ
      api.details[DOCTOR_CODE] = makeDoctorDetail({
        maLichHen: DOCTOR_CODE,
        trangThai: 'DaTiepDon',
        ghiChuKham: NOTE,
      });
      return jsonResponse(NOTE);
    });

    fireEvent.click(
      within(record()).getByRole('button', { name: 'Ghi hồ sơ khám' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Ghi chú khám' }),
    ).toBeInTheDocument();
    expect(
      within(dialog()).getByText(`${DOCTOR_CODE} · ${hoTen}`),
    ).toBeInTheDocument();
    type(box(/^Triệu chứng/), NOTE.trieuChung);
    type(box(/^Chẩn đoán sơ bộ/), NOTE.chanDoanSoBo);
    type(box(/^Hướng xử lý/), NOTE.huongXuLy);
    fireEvent.change(
      within(dialog()).getByLabelText(/^Ngày tái khám dự kiến/),
      {
        target: { value: '2026-11-10' },
      },
    );
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts).toHaveLength(1);
    expect(puts[0].url).toMatch(`${detailPath}/exam-record`);
    expect(puts[0].body).toEqual({
      trieuChung: NOTE.trieuChung,
      chanDoanSoBo: NOTE.chanDoanSoBo,
      huongXuLy: NOTE.huongXuLy,
      ngayTaiKhamDuKien: '2026-11-10',
      capNhatLanCuoi: null,
    });
    await waitFor(() =>
      expect(definitions(record())).toEqual([
        NOTE.trieuChung,
        NOTE.chanDoanSoBo,
        NOTE.huongXuLy,
        '10/11/2026',
      ]),
    );
    expect(api.callsTo(detailPath)).toHaveLength(2);
    expect(within(record()).getByRole('status')).toHaveTextContent(
      'Đã lưu hồ sơ khám.',
    );
    // Sau khi có hồ sơ: nút đổi thành `Chỉnh sửa ghi chú`
    expect(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    ).toBeInTheDocument();
    expect(
      within(record()).queryByRole('button', { name: 'Ghi hồ sơ khám' }),
    ).toBeNull();
  });

  it('WHS-17 `HoanThanh` đã có hồ sơ: `Chỉnh sửa ghi chú` ⇒ hộp điền sẵn ⇒ PUT mang `capNhatLanCuoi` đã thấy NGUYÊN VĂN ⇒ thẻ thấy bản mới', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'HoanThanh',
      ghiChuKham: NOTE,
    });
    const saved: DoctorExamRecord = {
      ...NOTE,
      huongXuLy: 'Lời khuyên đã sửa',
      capNhatLanCuoi: '2026-10-18T05:00:00.000Z',
    };
    const puts = answerPut(() => {
      api.details[DOCTOR_CODE] = makeDoctorDetail({
        maLichHen: DOCTOR_CODE,
        trangThai: 'HoanThanh',
        ghiChuKham: saved,
      });
      return jsonResponse(saved);
    });

    fireEvent.click(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'Chỉnh sửa ghi chú khám' }),
    ).toBeInTheDocument();
    expect(box(/^Hướng xử lý/)).toHaveValue(NOTE.huongXuLy);
    type(box(/^Hướng xử lý/), 'Lời khuyên đã sửa');
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(puts).toHaveLength(1);
    expect(puts[0].body.capNhatLanCuoi).toBe('2026-10-18T03:30:00.000Z');
    expect(puts[0].body.huongXuLy).toBe('Lời khuyên đã sửa');
    await waitFor(() =>
      expect(
        within(record()).getByText('Lời khuyên đã sửa'),
      ).toBeInTheDocument(),
    );
    expect(api.callsTo(detailPath)).toHaveLength(2);
  });

  it('WHS-05 409 sửa chồng ⇒ `Tải lại bản mới` tải lại chi tiết THẬT (GET lần hai), hộp vẫn mở và giữ nội dung, thấy khối "Bản mới nhất"; `Giữ bản của tôi` rồi Lưu gửi token MỚI', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'HoanThanh',
      ghiChuKham: NOTE,
    });
    let respond = (): Response => apiError('HO_SO_KHAM_DA_THAY_DOI');
    const puts = answerPut(() => respond());

    fireEvent.click(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    );
    type(box(/^Hướng xử lý/), 'Lời khuyên của tôi');
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    expect(api.callsTo(detailPath)).toHaveLength(1);
    expect(saveButton()).toBeDisabled();

    // Nơi khác đã sửa: lần tải lại thấy bản mới
    api.details[DOCTOR_CODE] = makeDoctorDetail({
      maLichHen: DOCTOR_CODE,
      trangThai: 'HoanThanh',
      ghiChuKham: NEWER,
    });
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Tải lại bản mới' }),
    );
    const latest = await within(dialog()).findByRole('region', {
      name: 'Bản mới nhất',
    });
    expect(api.callsTo(detailPath)).toHaveLength(2);
    expect(latest).toHaveTextContent(NEWER.huongXuLy);
    expect(box(/^Hướng xử lý/)).toHaveValue('Lời khuyên của tôi');

    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Giữ bản của tôi' }),
    );
    respond = () => jsonResponse({ ...NEWER, huongXuLy: 'Lời khuyên của tôi' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Lần Lưu sau `Giữ bản của tôi` gửi token của bản MỚI nhất (không còn 409)
    expect(puts).toHaveLength(2);
    expect(puts[1].body.capNhatLanCuoi).toBe(NEWER.capNhatLanCuoi);
    expect(puts[1].body.huongXuLy).toBe('Lời khuyên của tôi');
  });

  it('WHS-09 lần gửi đầu ĐÃ lưu nhưng phản hồi mất (mạng): bấm Lưu lại nhận 409 ⇒ tải lại thấy nội dung TRÙNG ⇒ hộp đóng, báo "Đã lưu hồ sơ khám."', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'HoanThanh',
      ghiChuKham: NOTE,
    });
    let attempt = 0;
    const puts = answerPut(() => {
      attempt += 1;
      if (attempt === 1) {
        // Máy chủ đã lưu nhưng phản hồi không về tới trình duyệt
        api.details[DOCTOR_CODE] = makeDoctorDetail({
          maLichHen: DOCTOR_CODE,
          trangThai: 'HoanThanh',
          ghiChuKham: {
            ...NOTE,
            huongXuLy: 'Lời khuyên của tôi',
            capNhatLanCuoi: '2026-10-18T05:00:00.000Z',
          },
        });
        throw new TypeError('Failed to fetch');
      }
      return apiError('HO_SO_KHAM_DA_THAY_DOI');
    });

    fireEvent.click(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    );
    type(box(/^Hướng xử lý/), 'Lời khuyên của tôi');
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/^Chưa rõ hồ sơ đã được lưu chưa/);
    // KHÔNG tự gửi lại
    expect(puts).toHaveLength(1);

    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    expect(puts).toHaveLength(2);
    expect(puts[1].body.capNhatLanCuoi).toBe(NOTE.capNhatLanCuoi);

    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Tải lại bản mới' }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(record()).getByRole('status')).toHaveTextContent(
      'Đã lưu hồ sơ khám.',
    );
    expect(
      within(record()).getByText('Lời khuyên của tôi'),
    ).toBeInTheDocument();
    expect(puts).toHaveLength(2);
  });

  it('WHS-09 R7: lần gửi đầu CHƯA lưu (mạng) rồi `Tải lại bản mới` cho đúng nội dung và token cũ (đối tượng MỚI, tham chiếu đổi) ⇒ "Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.", hộp mở, nội dung giữ', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'HoanThanh',
      ghiChuKham: NOTE,
    });
    const puts = answerPut(() => {
      throw new TypeError('Failed to fetch');
    });

    fireEvent.click(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    );
    type(box(/^Hướng xử lý/), 'Lời khuyên của tôi');
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/^Chưa rõ hồ sơ đã được lưu chưa/);
    expect(api.callsTo(detailPath)).toHaveLength(1);

    // Dữ liệu máy chủ không đổi: vẫn đúng `NOTE`, nhưng bộ đọc tạo đối tượng mới ⇒ hộp nhận biết "đã tải xong"
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Tải lại bản mới' }),
    );
    await within(dialog()).findByText(
      'Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.',
    );
    expect(api.callsTo(detailPath)).toHaveLength(2);
    expect(saveButton()).toBeEnabled();
    expect(box(/^Hướng xử lý/)).toHaveValue('Lời khuyên của tôi');
    expect(puts).toHaveLength(1);
  });

  it('WHS-17 tải lại chi tiết trong lúc hộp mở KHÔNG gỡ hộp (trang giữ bản cũ khi tải lại): nội dung đang gõ còn nguyên', async () => {
    const { api } = await openDoctorDetail({
      trangThai: 'DaTiepDon',
      ghiChuKham: NOTE,
    });
    fireEvent.click(
      within(record()).getByRole('button', { name: 'Chỉnh sửa ghi chú' }),
    );
    type(box(/^Hướng xử lý/), 'Đang gõ dở');
    answerPut(() => apiError('HO_SO_KHAM_DA_THAY_DOI'));
    fireEvent.click(saveButton());
    await within(dialog()).findByText(/vừa được cập nhật ở nơi khác/);
    fireEvent.click(
      within(dialog()).getByRole('button', { name: 'Tải lại bản mới' }),
    );
    await waitFor(() => expect(api.callsTo(detailPath)).toHaveLength(2));
    expect(dialog()).toBeInTheDocument();
    expect(box(/^Hướng xử lý/)).toHaveValue('Đang gõ dở');
  });
});
