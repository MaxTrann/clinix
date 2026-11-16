import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonOk } from './testing/fake-patient-exam-api';
import {
  OTHER_CODE,
  RATING,
  renderSections,
  SECTIONS_CODE,
  sectionsData,
} from './testing/render-sections';

// doctor-exam F6, WXH-09 (phần doctor), WDG-04, WDG-05, WDG-08, WDG-18: `PatientExamSections` từ lời gọi API tới hai cột (hồ sơ ở trái, đánh giá ở phải). `fetch` là bộ giả theo hợp đồng B5, B6 (KHÔNG gọi backend thật). Lịch chưa `HoanThanh` KHÔNG có lời gọi nào.
afterEach(() => vi.unstubAllGlobals());

const left = () => within(screen.getByTestId('left-column'));
const right = () => within(screen.getByTestId('right-column'));
const rateNow = () => right().queryByRole('button', { name: 'Đánh giá ngay' });

async function loaded() {
  await right().findByRole('button', { name: 'Đánh giá ngay' });
}

async function rate(stars: number, text: string) {
  await loaded();
  fireEvent.click(rateNow()!);
  fireEvent.click(screen.getByRole('radio', { name: `${stars} sao` }));
  if (text !== '') {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  }
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
  });
}

describe('doctor-exam F6 — cổng `HoanThanh` (WXH-09, WDG-01)', () => {
  it.each([
    'DaXacNhan',
    'DaTiepDon',
    'DaHuy',
    'VangMat',
    'ChoThanhToan',
    'DaDoiLich',
    '',
    'hoanthanh',
    'HoanThanh ',
    'HOANTHANH',
    'mã lạ',
  ])(
    'WXH-09 trạng thái %j ⇒ `record` và `rating` là `null` (hai cột rỗng, nơi gọi giữ thẻ cũ) và KHÔNG lời gọi API nào',
    async (trangThai) => {
      const { api } = renderSections({ trangThai });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(screen.getByTestId('left-column')).toBeEmptyDOMElement();
      expect(screen.getByTestId('right-column')).toBeEmptyDOMElement();
      expect(api.calls).toHaveLength(0);
    },
  );

  it('WXH-09 `HoanThanh` ⇒ MỘT `GET /patient/exam-records/<mã>` và đủ hai thẻ ở đúng hai cột (hồ sơ trái, đánh giá phải)', async () => {
    const { api } = renderSections();
    await loaded();
    expect(api.detailCalls()).toHaveLength(1);
    expect(api.detailCalls()[0].path).toBe(
      `/patient/exam-records/${SECTIONS_CODE}`,
    );
    expect(api.calls).toHaveLength(1);
    expect(
      left().getByRole('region', { name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    expect(
      right().getByRole('region', { name: 'Đánh giá bác sĩ' }),
    ).toBeInTheDocument();
    expect(
      left().queryByRole('region', { name: 'Đánh giá bác sĩ' }),
    ).toBeNull();
    expect(
      right().queryByRole('region', { name: 'Hồ sơ khám bệnh' }),
    ).toBeNull();
  });

  it('WXH-09 trạng thái đổi từ `DaTiepDon` sang `HoanThanh` ⇒ lúc đó mới gọi API và dựng hai thẻ', async () => {
    const { api, rerenderWith } = renderSections({ trangThai: 'DaTiepDon' });
    expect(api.calls).toHaveLength(0);
    rerenderWith('HoanThanh', SECTIONS_CODE);
    await loaded();
    expect(api.calls).toHaveLength(1);
  });
});

describe('doctor-exam F6 — hai thẻ cùng một lần gọi (WXH-09)', () => {
  it('WXH-09 đang tải ⇒ mỗi thẻ một dòng "Đang tải …" (`role="status"`), chưa có nút; xong thì thay bằng nội dung', async () => {
    renderSections();
    expect(left().getByRole('status')).toHaveTextContent(
      'Đang tải hồ sơ khám...',
    );
    expect(right().getByRole('status')).toHaveTextContent(
      'Đang tải đánh giá...',
    );
    expect(rateNow()).toBeNull();
    await loaded();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('WXH-09 có hồ sơ và chưa đánh giá ⇒ trái: bốn khối và liên kết; phải: câu "chưa đánh giá" và `Đánh giá ngay`', async () => {
    renderSections();
    await loaded();
    expect(left().getByText('Triệu chứng')).toBeInTheDocument();
    expect(
      left().getByRole('link', { name: 'Xem trong sổ khám bệnh →' }),
    ).toBeInTheDocument();
    expect(
      right().getByText('Bạn chưa đánh giá bác sĩ cho buổi khám này.'),
    ).toBeInTheDocument();
  });

  it('WXH-09 chưa có hồ sơ mà vẫn đánh giá được (DGB-13: đánh giá KHÔNG phụ thuộc hồ sơ) ⇒ trái: "Chưa có hồ sơ khám…", không liên kết; phải: có `Đánh giá ngay`', async () => {
    renderSections({
      data: sectionsData({ hoSoKham: null, coHoSoKham: false }),
    });
    await loaded();
    expect(left().getByText(/^Chưa có hồ sơ khám\./)).toBeInTheDocument();
    expect(left().queryByRole('link')).toBeNull();
    expect(rateNow()).toBeInTheDocument();
  });

  it('WXH-09 đã đánh giá, chưa có hồ sơ (Figma 425:2) ⇒ trái rỗng-hồ-sơ, phải hiện đánh giá, KHÔNG nút', async () => {
    renderSections({
      data: sectionsData({
        hoSoKham: null,
        coHoSoKham: false,
        danhGia: RATING,
        daDanhGia: true,
      }),
    });
    await right().findByRole('img', { name: '5 sao' });
    expect(left().getByText(/^Chưa có hồ sơ khám\./)).toBeInTheDocument();
    expect(right().getByText('Xuất sắc')).toBeInTheDocument();
    expect(rateNow()).toBeNull();
  });

  it('WXH-09 đã có hồ sơ và đã đánh giá (Figma 424:2) ⇒ cả hai thẻ có nội dung, không nút, không form', async () => {
    renderSections({
      data: sectionsData({ danhGia: RATING, daDanhGia: true }),
    });
    await right().findByRole('img', { name: '5 sao' });
    expect(left().getByText('Triệu chứng')).toBeInTheDocument();
    expect(right().getByText(RATING.nhanXet!)).toBeInTheDocument();
    expect(rateNow()).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('WDG-08 (Q19) đánh giá đã bị ẩn: máy chủ vẫn gửi nguyên vẹn (khoá lạ `biAn`, `lyDoAn` nếu có bị bỏ) ⇒ hiện như chưa ẩn, không chữ "ẩn", không lộ lý do', async () => {
    renderSections({
      data: sectionsData({ danhGia: RATING, daDanhGia: true }),
      respond: (url) => {
        if (url.pathname.endsWith(`/${SECTIONS_CODE}`)) {
          return Promise.resolve(
            jsonOk({
              maLichHen: SECTIONS_CODE,
              thoiGian: '2026-06-10T02:00:00.000Z',
              chuyenKhoa: 'Tim mạch',
              chiNhanh: 'CLINIX Chi nhánh Quận 3',
              bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
              nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
              hoSoKham: null,
              danhGia: { ...RATING, biAn: true, lyDoAn: 'Spam quảng cáo' },
              coTheDanhGia: false,
            }),
          );
        }
        return undefined;
      },
    });
    await right().findByRole('img', { name: '5 sao' });
    expect(screen.getByTestId('right-column').textContent).not.toMatch(/ẩn/i);
    expect(document.body.textContent).not.toContain('Spam quảng cáo');
    expect(rateNow()).toBeNull();
  });
});

describe('doctor-exam F6 — lỗi gọi chỉ hỏng hai thẻ (WXH-09)', () => {
  it('WXH-09 500 ⇒ CẢ HAI thẻ có hộp lỗi và `Thử lại`; `Thử lại` ở thẻ nào cũng chạy lại ĐÚNG MỘT lời gọi và cả hai thẻ hồi phục', async () => {
    let fail = true;
    const { api } = renderSections({
      respond: () =>
        fail
          ? Promise.resolve(
              jsonOk({ maLoi: 'LOI_HE_THONG', thongBao: 'x' }, 500),
            )
          : undefined,
    });
    await left().findByRole('alert');
    expect(right().getByRole('alert')).toBeInTheDocument();
    expect(left().getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(
      right().getByRole('button', { name: 'Thử lại' }),
    ).toBeInTheDocument();
    expect(left().queryByText('Triệu chứng')).toBeNull();
    expect(rateNow()).toBeNull();
    expect(api.detailCalls()).toHaveLength(1);

    fail = false;
    fireEvent.click(right().getByRole('button', { name: 'Thử lại' }));
    await loaded();
    expect(api.detailCalls()).toHaveLength(2);
    expect(left().getByText('Triệu chứng')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WXH-09 mất mạng và 200 sai hình dạng (thiếu `coTheDanhGia`) ⇒ hộp lỗi ở cả hai thẻ, không vẽ dữ liệu dở', async () => {
    renderSections({
      respond: () =>
        Promise.resolve(
          jsonOk({
            maLichHen: SECTIONS_CODE,
            thoiGian: '2026-06-10T02:00:00.000Z',
            chuyenKhoa: 'Tim mạch',
            chiNhanh: 'x',
            bacSi: { hoTen: 'A', chucDanh: 'BS' },
            nguoiKham: { hoTen: 'B', quanHe: null },
            hoSoKham: null,
            danhGia: null,
          }),
        ),
    });
    await left().findByRole('alert');
    expect(right().getByRole('alert')).toBeInTheDocument();
    expect(rateNow()).toBeNull();
  });

  it('WXH-09 404 ⇒ "Không tìm thấy ca khám này." ở cả hai thẻ, KHÔNG `Thử lại`', async () => {
    renderSections({ maLichHen: 'CLX-KHONG-CO' });
    await left().findByRole('alert');
    expect(left().getByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(right().getByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});

describe('doctor-exam F6 — gửi đánh giá từ đầu tới cuối (WDG-04, WDG-05)', () => {
  it('WDG-04 gửi 4 sao kèm nhận xét ⇒ MỘT POST, hiện "đã đánh giá" ngay từ thân 201 (sao, nhãn "Tốt", ngày, nhận xét), "Đã gửi đánh giá của bạn." nhận tiêu điểm, KHÔNG tải lại chi tiết, hồ sơ bên trái không đổi', async () => {
    const { api } = renderSections();
    await rate(4, 'Bác sĩ tận tâm');
    await right().findByRole('img', { name: '4 sao' });
    expect(api.ratingCalls()).toHaveLength(1);
    expect(JSON.parse(api.ratingCalls()[0].body!)).toEqual({
      soSao: 4,
      nhanXet: 'Bác sĩ tận tâm',
    });
    expect(api.ratingCalls()[0].path).toBe(
      `/patient/exam-records/${SECTIONS_CODE}/rating`,
    );
    expect(api.detailCalls()).toHaveLength(1);
    expect(right().getByText('Tốt')).toBeInTheDocument();
    expect(right().getByText('Bác sĩ tận tâm')).toBeInTheDocument();
    expect(right().getByText(/^\d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
    const status = right().getByRole('status');
    expect(status).toHaveTextContent('Đã gửi đánh giá của bạn.');
    expect(document.activeElement).toBe(status);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(rateNow()).toBeNull();
    expect(left().getByText('Triệu chứng')).toBeInTheDocument();
  });

  it('WDG-04 không nhận xét ⇒ thân CHỈ `{ soSao }`; đánh giá hiện không có đoạn nhận xét', async () => {
    const { api } = renderSections();
    await rate(5, '');
    await right().findByRole('img', { name: '5 sao' });
    expect(api.ratingCalls()[0].body).toBe('{"soSao":5}');
    expect(right().getByText('Xuất sắc')).toBeInTheDocument();
  });

  it('WDG-05 409 `DA_DANH_GIA` (đã đánh giá ở tab khác) ⇒ tải lại chi tiết ĐÚNG MỘT lần và hiện đánh giá CỦA MÁY CHỦ kèm "Bạn đã đánh giá buổi khám này."; không form, không POST lần hai', async () => {
    const data = sectionsData();
    const { api } = renderSections({
      data,
      respond: (_url, call) => {
        if (call.method !== 'POST') return undefined;
        data.visits[0].danhGia = {
          soSao: 2,
          nhanXet: 'Từ tab khác',
          thoiDiemTao: '2026-06-10T04:00:00.000Z',
        };
        return Promise.resolve(
          jsonOk({ maLoi: 'DA_DANH_GIA', thongBao: 'x' }, 409),
        );
      },
    });
    await rate(5, 'Nội dung của tôi');
    await right().findByText('Từ tab khác');
    expect(api.detailCalls()).toHaveLength(2);
    expect(api.ratingCalls()).toHaveLength(1);
    expect(right().getByRole('img', { name: '2 sao' })).toBeInTheDocument();
    expect(right().getByText('Tệ')).toBeInTheDocument();
    expect(right().getByRole('status')).toHaveTextContent(
      'Bạn đã đánh giá buổi khám này.',
    );
    expect(right().queryByText('Nội dung của tôi')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(rateNow()).toBeNull();
  });

  it('WDG-05 lỗi 503 rồi gửi lại: hai POST đều do NGƯỜI DÙNG bấm; thành công thì hiện đánh giá; form không bị gỡ giữa chừng', async () => {
    let calls = 0;
    const { api } = renderSections({
      respond: (_url, call) => {
        if (call.method !== 'POST') return undefined;
        calls += 1;
        return calls === 1
          ? Promise.resolve(
              jsonOk({ maLoi: 'HE_THONG_DANG_BAN', thongBao: 'x' }, 503),
            )
          : undefined;
      },
    });
    await rate(3, 'Giữ lại');
    await right().findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('Giữ lại');
    expect(api.ratingCalls()).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }));
    });
    await right().findByRole('img', { name: '3 sao' });
    expect(api.ratingCalls()).toHaveLength(2);
  });

  it('WXH-18 bấm liên kết sổ khám ⇒ sang `/benh-nhan/ho-so-kham-benh?ca=<mã>` (trang F5), `location.state` rỗng', async () => {
    renderSections();
    await loaded();
    fireEvent.click(
      left().getByRole('link', { name: 'Xem trong sổ khám bệnh →' }),
    );
    expect(await screen.findByText('Trang sổ khám bệnh')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent(
      `/benh-nhan/ho-so-kham-benh?ca=${SECTIONS_CODE}`,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('null');
  });
});

describe('doctor-exam F6 — đổi lịch hẹn không giữ lại gì của lịch cũ (WDG-18)', () => {
  it('WDG-18 đổi `maLichHen` khi form đang mở ⇒ form ĐÓNG, nhận xét cũ KHÔNG sang lịch mới; lịch mới chưa đánh giá hiện `Đánh giá ngay`', async () => {
    const { api, rerenderWith } = renderSections();
    await loaded();
    fireEvent.click(rateNow()!);
    fireEvent.click(screen.getByRole('radio', { name: '4 sao' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Nhận xét của lịch cũ' },
    });
    rerenderWith('HoanThanh', OTHER_CODE);
    await loaded();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(document.body.textContent).not.toContain('Nhận xét của lịch cũ');
    expect(api.detailCalls().map((call) => call.path)).toEqual([
      `/patient/exam-records/${SECTIONS_CODE}`,
      `/patient/exam-records/${OTHER_CODE}`,
    ]);
    // mở form ở lịch mới: trống
    fireEvent.click(rateNow()!);
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  it('WDG-18 vừa gửi xong cho lịch cũ rồi đổi sang lịch mới ⇒ KHÔNG còn đánh giá và "Đã gửi…" của lịch cũ (`rated` gắn với mã lịch)', async () => {
    const { rerenderWith } = renderSections();
    await rate(5, 'Cho lịch cũ');
    await right().findByRole('img', { name: '5 sao' });
    rerenderWith('HoanThanh', OTHER_CODE);
    await loaded();
    expect(right().queryByRole('img')).toBeNull();
    expect(right().queryByRole('status')).toBeNull();
    expect(right().queryByText('Cho lịch cũ')).toBeNull();
    // quay lại lịch cũ: chi tiết tải lại từ máy chủ, thấy đánh giá đã lưu thật
    rerenderWith('HoanThanh', SECTIONS_CODE);
    await right().findByText('Cho lịch cũ');
  });

  it('WDG-18 đổi lịch hẹn khi đang gửi ⇒ yêu cầu cũ bị HUỶ (`signal`), kết quả muộn không hiện ở lịch mới', async () => {
    let finish!: (response: Response) => void;
    const { api, rerenderWith } = renderSections({
      respond: (_url, call) =>
        call.method === 'POST'
          ? new Promise<Response>((resolve) => {
              finish = resolve;
            })
          : undefined,
    });
    await rate(5, 'Đang gửi dở');
    expect(api.ratingCalls()).toHaveLength(1);
    expect(api.ratingCalls()[0].signal?.aborted).toBe(false);
    rerenderWith('HoanThanh', OTHER_CODE);
    await loaded();
    expect(api.ratingCalls()[0].signal?.aborted).toBe(true);
    await act(async () => {
      finish(jsonOk(RATING, 201));
    });
    await waitFor(() => expect(right().queryByRole('img')).toBeNull());
    expect(right().queryByRole('status')).toBeNull();
  });
});
