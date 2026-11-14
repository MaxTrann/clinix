import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiErrorResponse,
  jsonResponse,
} from '../../../testing/fake-appointment-list-api';
import {
  makeReceptionAppointment,
  makeReceptionDetail,
} from '../../../testing/fake-reception-api';
import {
  cleanUpReceptionPage,
  currentUrl,
  detailButton,
  listQueries,
  loaded,
  renderReceptionPage,
} from '../../../testing/reception-harness';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { DETAIL_TEXT } from './detail-messages';

// booking F8: ngăn chi tiết của Lễ tân. Mã LTC là [đề xuất] (PLAN booking mục 7.34); LTN-01 (nút theo `chuyenDuoc[]`) là LTC-02 và LTN-05 (`Thu tiền` vô hiệu) là LTC-03.
// API giả. Chữ lấy từ Figma `488:2`, `495:2` đến `497:2` đã đối chiếu trực tiếp ngày 12/11/2026.
// F9 (13/11/2026) sửa ĐÚNG hai chỗ mã hoá "F8 chưa có B12": LTC-02 (phần "mọi nút vô hiệu kèm chữ ẩn" thành "nút theo `chuyenDuoc[]` bật, không còn chữ ẩn; `Thu tiền` vẫn vô hiệu")
// và LTC-04 ("không POST" thu hẹp về việc xem chi tiết và bấm nút `Thu tiền` vô hiệu; POST của ba nút thao tác do LTA-* ở `reception-actions.test.tsx` kiểm). Mọi kỳ vọng khác giữ nguyên.
afterEach(cleanUpReceptionPage);

const CODE = 'CP20261018001';
const DETAIL_PATH = `/reception/appointments/${CODE}`;
const group = (dialog: HTMLElement) =>
  within(dialog).queryByRole('group', { name: DETAIL_TEXT.actionsGroup });

// Dựng trang với MỘT lịch và chi tiết cho trước, mở ngăn bằng nút `Chi tiết` của hàng
async function openDetail(detail: Partial<ReceptionAppointmentDetail> = {}) {
  const view = renderReceptionPage({
    before: (api) => {
      api.appointments = [makeReceptionAppointment()];
      api.details[CODE] = makeReceptionDetail(detail);
    },
  });
  await loaded();
  fireEvent.click(detailButton(CODE));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(DETAIL_TEXT.sections.patient);
  return { ...view, dialog };
}

// Nhãn các nút trong nhóm `Thao tác` theo thứ tự, bỏ chữ ẩn "(chưa được triển khai)" và chữ phụ của nút `Thu tiền`
const actionLabels = (dialog: HTMLElement) => {
  const buttons = group(dialog)
    ? within(group(dialog)!).getAllByRole('button')
    : [];
  return buttons.map((button) =>
    (button.textContent ?? '').replace(
      ` ${DETAIL_TEXT.notImplementedHidden}`,
      '',
    ),
  );
};

describe('mở ngăn và tải chi tiết', () => {
  it('LTC-01 đầu ngăn hiện mã lịch NGAY, thân tải đúng MỘT GET theo mã rồi mới hiện nội dung (có token, không POST)', async () => {
    let release: () => void = () => {};
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = [makeReceptionAppointment()];
        fake.failNext(
          'detail',
          () =>
            new Promise<Response>((resolve) => {
              release = () => resolve(jsonResponse(makeReceptionDetail()));
            }),
        );
      },
    });
    await loaded();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(detailButton(CODE));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(`${DETAIL_TEXT.dialogPrefix}${CODE}`);
    expect(within(dialog).getByText(DETAIL_TEXT.loading)).toBeInTheDocument();
    // Chưa có chi tiết: chưa có nội dung nào, kể cả của dòng danh sách (chỉ MỘT nguồn là chi tiết)
    expect(within(dialog).queryByText(DETAIL_TEXT.sections.patient)).toBeNull();

    release();
    expect(
      await within(dialog).findByText(DETAIL_TEXT.sections.patient),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(DETAIL_TEXT.loading)).toBeNull();
    expect(api.callsTo(DETAIL_PATH)).toHaveLength(1);
    expect(api.callsTo(DETAIL_PATH)[0].hasToken).toBe(true);
    expect(api.writes()).toEqual([]);
  });

  it('LTC-05 nội dung theo Figma `488:2`: ba khối, nhãn đúng; KHÔNG có `Email`, `Kênh đặt`, "Đã thanh toán"; tiền định dạng từ chuỗi; ngày giờ Việt Nam', async () => {
    const { dialog } = await openDetail({ conPhaiThu: '200000.00' });

    for (const title of Object.values(DETAIL_TEXT.sections)) {
      expect(
        within(dialog).getByRole('heading', { name: title }),
      ).toBeInTheDocument();
    }
    for (const label of [
      'Họ tên',
      'Số điện thoại',
      'Lý do khám',
      'Bác sĩ',
      'Chuyên khoa',
      'Dịch vụ',
      'Giá khám',
      'Mã lịch',
      'Ngày khám',
      'Chi nhánh',
      'Tiền cọc',
      'Còn phải thu',
    ]) {
      expect(within(dialog).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(dialog).toHaveTextContent('Nguyễn Văn A');
    expect(dialog).toHaveTextContent('0901234567');
    expect(dialog).toHaveTextContent('Đau ngực nhẹ, theo dõi huyết áp');
    expect(dialog).toHaveTextContent('300.000đ');
    expect(dialog).toHaveTextContent('100.000đ');
    expect(dialog).toHaveTextContent('200.000đ');
    // 01:00 UTC ngày 18/10/2026 là 08:00 giờ Việt Nam, Chủ nhật; dòng phụ ở đầu ngăn đúng Figma "18/10 lúc 08:00"
    expect(dialog).toHaveTextContent('Chủ nhật, 18/10/2026 · 08:00');
    expect(dialog).toHaveTextContent('18/10 lúc 08:00');
    expect(dialog).toHaveTextContent('Đã xác nhận');

    for (const absent of [
      'Email',
      'Kênh đặt',
      'Online',
      'Tại quầy',
      'Đã thanh toán',
      'Đã đặt cọc',
      'Đổi lịch hộ',
    ]) {
      expect(within(dialog).queryByText(new RegExp(absent))).toBeNull();
    }
    // Không có `lyDoHuy`, hạn thanh toán ở lịch `DaXacNhan`
    expect(within(dialog).queryByText('Lý do hủy')).toBeNull();
    expect(within(dialog).queryByText('Hạn thanh toán')).toBeNull();
  });

  it('LTC-05 `conPhaiThu` là chuỗi decimal đưa nguyên ra, KHÔNG qua Number (id lớn hơn 2^53 giữ đủ chữ số); lý do khám rỗng ⇒ "Không ghi lý do"', async () => {
    const { dialog } = await openDetail({
      conPhaiThu: '9007199254740993.00',
      lyDoKham: null,
    });
    expect(dialog).toHaveTextContent('9.007.199.254.740.993đ');
    expect(dialog).toHaveTextContent(DETAIL_TEXT.noReason);
  });

  it('LTC-05 `Chờ thanh toán`: hiện hạn thanh toán theo giờ Việt Nam, không có hộp "còn phải thu"; `Đã hủy`: hiện lý do hủy mà Lễ tân được thấy', async () => {
    const waiting = await openDetail({
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-10-18T01:15:00.000Z',
      conPhaiThu: null,
      chuyenDuoc: ['DaHuy'],
    });
    expect(waiting.dialog).toHaveTextContent('Hạn thanh toán');
    expect(waiting.dialog).toHaveTextContent('Chủ nhật, 18/10/2026 · 08:15');
    expect(within(waiting.dialog).queryByText('Còn phải thu')).toBeNull();
    waiting.unmount();
    cleanUpReceptionPage();

    const cancelled = await openDetail({
      trangThai: 'DaHuy',
      lyDoHuy: 'Bệnh nhân gọi điện xin hủy',
      conPhaiThu: null,
      chuyenDuoc: [],
    });
    expect(cancelled.dialog).toHaveTextContent('Lý do hủy');
    expect(cancelled.dialog).toHaveTextContent('Bệnh nhân gọi điện xin hủy');
    expect(cancelled.dialog).toHaveTextContent('Đã hủy');
    expect(group(cancelled.dialog)).toBeNull();
  });

  it('LTC-05 người khám khác người đặt: có dòng `Người đặt`, SĐT ghi rõ là của người đặt, họ tên ghi "Người thân"; cùng một người thì không', async () => {
    const relative = await openDetail({
      nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
      nguoiDat: { hoTen: 'Lê Thị M', soDienThoai: '0912345678' },
    });
    expect(relative.dialog).toHaveTextContent('Bùi Minh Khoa');
    expect(within(relative.dialog).getByText('Người đặt')).toBeInTheDocument();
    expect(relative.dialog).toHaveTextContent('Lê Thị M');
    expect(relative.dialog).toHaveTextContent('0912345678');
    expect(relative.dialog).toHaveTextContent(DETAIL_TEXT.bookerPhone);
    expect(relative.dialog).toHaveTextContent(DETAIL_TEXT.relativePerson);
    relative.unmount();
    cleanUpReceptionPage();

    const own = await openDetail();
    expect(within(own.dialog).queryByText('Người đặt')).toBeNull();
    expect(own.dialog).not.toHaveTextContent(DETAIL_TEXT.bookerPhone);
    expect(own.dialog).toHaveTextContent(DETAIL_TEXT.ownPerson);
  });

  it('LTC-10 mỗi lần mở gọi lại GET (không dùng bản của lần trước); mở dòng khác thì không thấy dữ liệu của dòng trước trong lúc tải', async () => {
    const { api } = renderReceptionPage({
      before: (fake) => {
        fake.appointments = [
          makeReceptionAppointment({ maLichHen: 'CP20261018001' }),
          makeReceptionAppointment({
            maLichHen: 'CP20261018002',
            nguoiKham: { hoTen: 'Trần Thị B', laBanThan: true },
          }),
        ];
        fake.details.CP20261018002 = makeReceptionDetail({
          maLichHen: 'CP20261018002',
          nguoiKham: { hoTen: 'Trần Thị B', laBanThan: true },
        });
      },
    });
    await loaded();
    fireEvent.click(detailButton('CP20261018001'));
    await screen.findByText(DETAIL_TEXT.sections.patient);
    fireEvent.click(screen.getByRole('button', { name: DETAIL_TEXT.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(detailButton('CP20261018001'));
    await screen.findByText(DETAIL_TEXT.sections.patient);
    expect(api.callsTo('/reception/appointments/CP20261018001')).toHaveLength(
      2,
    );
    fireEvent.click(screen.getByRole('button', { name: DETAIL_TEXT.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Dòng 2: giữ phản hồi để thấy trạng thái đang tải
    api.failNext('detail', () => new Promise(() => {}));
    fireEvent.click(detailButton('CP20261018002'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName(
      `${DETAIL_TEXT.dialogPrefix}CP20261018002`,
    );
    expect(within(dialog).getByText(DETAIL_TEXT.loading)).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('Nguyễn Văn A');
  });
});

describe('nút theo chuyenDuoc[] (LTN-01)', () => {
  type Case = {
    name: string;
    trangThai: string;
    chuyenDuoc: string[];
    conPhaiThu: string | null;
    labels: string[];
    collect: boolean;
  };
  const CASES: Case[] = [
    {
      name: 'Chờ thanh toán: chỉ huỷ',
      trangThai: 'ChoThanhToan',
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: null,
      labels: ['Hủy lịch'],
      collect: false,
    },
    {
      name: 'Đã xác nhận còn phải thu: Thu tiền & tiếp đón và huỷ',
      trangThai: 'DaXacNhan',
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '200000.00',
      labels: ['Hủy lịch'],
      collect: true,
    },
    {
      name: 'Đã xác nhận đủ tiền, trong cửa sổ: tiếp đón, vắng mặt, huỷ',
      trangThai: 'DaXacNhan',
      chuyenDuoc: ['DaHuy', 'DaTiepDon', 'VangMat'],
      conPhaiThu: '0.00',
      labels: ['Tiếp đón bệnh nhân', 'Vắng mặt', 'Hủy lịch'],
      collect: false,
    },
    {
      name: 'Đã xác nhận đủ tiền, sau cửa sổ: vắng mặt và huỷ (thứ tự mảng không quyết định thứ tự nút)',
      trangThai: 'DaXacNhan',
      chuyenDuoc: ['VangMat', 'DaHuy'],
      conPhaiThu: '0.00',
      labels: ['Vắng mặt', 'Hủy lịch'],
      collect: false,
    },
    {
      name: 'chỉ tiếp đón (huỷ vắng khỏi mảng thì không có nút huỷ)',
      trangThai: 'DaXacNhan',
      chuyenDuoc: ['DaTiepDon'],
      conPhaiThu: '0.00',
      labels: ['Tiếp đón bệnh nhân'],
      collect: false,
    },
    {
      name: 'Đã xác nhận nhưng mảng rỗng (thiếu cấu hình cửa sổ): KHÔNG nút nào dù là trạng thái hay có nút',
      trangThai: 'DaXacNhan',
      chuyenDuoc: [],
      conPhaiThu: '0.00',
      labels: [],
      collect: false,
    },
    {
      name: 'Đã tiếp đón: không nút (Q21: Lễ tân không huỷ lịch đã tiếp đón)',
      trangThai: 'DaTiepDon',
      chuyenDuoc: [],
      conPhaiThu: null,
      labels: [],
      collect: false,
    },
    {
      name: 'Hoàn thành: không nút',
      trangThai: 'HoanThanh',
      chuyenDuoc: [],
      conPhaiThu: null,
      labels: [],
      collect: false,
    },
    {
      name: 'Đã hủy: không nút',
      trangThai: 'DaHuy',
      chuyenDuoc: [],
      conPhaiThu: null,
      labels: [],
      collect: false,
    },
    {
      name: 'Vắng mặt: không nút',
      trangThai: 'VangMat',
      chuyenDuoc: [],
      conPhaiThu: null,
      labels: [],
      collect: false,
    },
    // Đối chứng "không theo trạng thái": cùng trạng thái, mảng khác thì nút khác; trạng thái khác mà mảng có `DaHuy` thì VẪN có nút (nguồn là mảng)
    {
      name: 'trạng thái Hoàn thành nhưng mảng có DaHuy: nút theo mảng, không theo trạng thái',
      trangThai: 'HoanThanh',
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: null,
      labels: ['Hủy lịch'],
      collect: false,
    },
    {
      name: 'mã khác ba đích của Lễ tân (HoanThanh, DaXacNhan, DaDoiLich) bị bỏ qua',
      trangThai: 'DaXacNhan',
      chuyenDuoc: ['HoanThanh', 'DaXacNhan', 'DaDoiLich'],
      conPhaiThu: '0.00',
      labels: [],
      collect: false,
    },
  ];

  it.each(CASES)('LTC-02 $name', async (item) => {
    const { dialog } = await openDetail({
      trangThai: item.trangThai,
      chuyenDuoc: item.chuyenDuoc,
      conPhaiThu: item.conPhaiThu,
    });
    const labels = actionLabels(dialog);
    // `Thu tiền & tiếp đón` đứng đầu nhóm khi có; phần còn lại theo thứ tự cố định của Figma
    const expected = item.collect
      ? ['Thu tiền & tiếp đón', ...item.labels]
      : item.labels;
    expect(labels).toEqual(expected);

    // F9 đã gắn hành động cho cả ba nút theo `chuyenDuoc[]`: nút BẬT và tên truy cập chính xác là nhãn (không còn chữ ẩn "(chưa được triển khai)" của F8).
    // `Thu tiền & tiếp đón` thuộc `payment` nên VẪN vô hiệu (LTC-03).
    for (const label of item.labels) {
      expect(within(dialog).getByRole('button', { name: label })).toBeEnabled();
    }
    if (item.collect) {
      expect(
        within(dialog).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
      ).toBeDisabled();
    }
  });

  it('LTC-03 `Thu tiền & tiếp đón` (LTN-05): vô hiệu kèm chữ "Chưa được triển khai" HIỆN; chỉ khi Đã xác nhận còn phải thu (kiểm trên chuỗi)', async () => {
    const due = await openDetail({ conPhaiThu: '0.10' });
    const button = within(due.dialog).getByRole('button', {
      name: /Thu tiền & tiếp đón/,
    });
    expect(button).toBeDisabled();
    expect(
      within(due.dialog).getByText(DETAIL_TEXT.notImplemented),
    ).toBeVisible();
    due.unmount();
    cleanUpReceptionPage();

    // Hết nợ hay không có số (mọi cách viết số không): không nút
    for (const conPhaiThu of ['0', '0.0', '0.00', '000.00', null]) {
      const view = await openDetail({ conPhaiThu });
      expect(
        within(view.dialog).queryByRole('button', {
          name: /Thu tiền & tiếp đón/,
        }),
        String(conPhaiThu),
      ).toBeNull();
      expect(
        within(view.dialog).queryByText(DETAIL_TEXT.notImplemented),
      ).toBeNull();
      view.unmount();
      cleanUpReceptionPage();
    }

    // Ca âm: trạng thái khác `DaXacNhan` không có nút này dù API lỡ trả số (backend chỉ trả ở Đã xác nhận)
    const waiting = await openDetail({
      trangThai: 'ChoThanhToan',
      conPhaiThu: '300000.00',
      chuyenDuoc: ['DaHuy'],
    });
    expect(
      within(waiting.dialog).queryByRole('button', {
        name: /Thu tiền & tiếp đón/,
      }),
    ).toBeNull();
  });

  it('LTC-04 xem chi tiết không gọi route ghi nào: bấm nút `Thu tiền & tiếp đón` (vô hiệu, thuộc `payment`) không phát sinh POST; chỉ có GET', async () => {
    const { dialog, api } = await openDetail({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '200000.00',
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.writes()).toEqual([]);
    expect(api.requests.every((request) => request.method === 'GET')).toBe(
      true,
    );
  });
});

describe('lỗi tải chi tiết theo maLoi', () => {
  async function openWith(failure: () => Response | Promise<Response>) {
    const view = renderReceptionPage({
      before: (api) => {
        api.appointments = [makeReceptionAppointment()];
        api.failNext('detail', failure);
      },
    });
    await loaded();
    fireEvent.click(detailButton(CODE));
    const dialog = await screen.findByRole('dialog');
    return { ...view, dialog };
  }
  const retry = (dialog: HTMLElement) =>
    within(dialog).queryByRole('button', { name: 'Thử lại' });

  it('LTC-06 404 `KHONG_TIM_THAY` ⇒ MỘT câu "Không tìm thấy lịch hẹn này.", không `Thử lại`; đóng ngăn thì tải lại danh sách (dòng đã cũ)', async () => {
    const { dialog, api } = await openWith(() =>
      apiErrorResponse(404, 'KHONG_TIM_THAY'),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      DETAIL_TEXT.notFound,
    );
    expect(retry(dialog)).toBeNull();
    expect(within(dialog).queryByText(DETAIL_TEXT.sections.patient)).toBeNull();
    // Mã lịch vẫn ở đầu ngăn và không lộ gì khác
    expect(dialog).toHaveAccessibleName(`${DETAIL_TEXT.dialogPrefix}${CODE}`);

    const calls = listQueries(api).length;
    fireEvent.click(
      within(dialog).getByRole('button', { name: DETAIL_TEXT.back }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(listQueries(api)).toHaveLength(calls + 1));
  });

  it('LTC-06 `CHUA_DANG_NHAP` và `KHONG_DU_QUYEN` có câu riêng, không `Thử lại`; cùng `maLoi` khác mã HTTP vẫn ra đúng câu', async () => {
    for (const [status, maLoi, text] of [
      [401, 'CHUA_DANG_NHAP', DETAIL_TEXT.sessionExpired],
      [500, 'CHUA_DANG_NHAP', DETAIL_TEXT.sessionExpired],
      [403, 'KHONG_DU_QUYEN', DETAIL_TEXT.forbidden],
      [500, 'KHONG_DU_QUYEN', DETAIL_TEXT.forbidden],
    ] as const) {
      const { dialog, unmount } = await openWith(() =>
        apiErrorResponse(status, maLoi),
      );
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
      expect(retry(dialog)).toBeNull();
      unmount();
      cleanUpReceptionPage();
    }
  });

  it('LTC-06 `maLoi` lạ cùng HTTP 404 (hay 500, 403) ⇒ câu chung kèm `Thử lại`, KHÔNG phải câu "không tìm thấy"; `Thử lại` tải lại và hiện nội dung', async () => {
    for (const status of [404, 500, 403]) {
      const { dialog, unmount } = await openWith(() =>
        apiErrorResponse(status, 'MA_LOI_LA'),
      );
      expect(await within(dialog).findByRole('alert')).not.toHaveTextContent(
        DETAIL_TEXT.notFound,
      );
      expect(retry(dialog)).toBeInTheDocument();
      unmount();
      cleanUpReceptionPage();
    }

    const { dialog } = await openWith(() => apiErrorResponse(500, 'MA_LOI_LA'));
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Thử lại' }),
    );
    expect(
      await within(dialog).findByText(DETAIL_TEXT.sections.patient),
    ).toBeInTheDocument();
  });

  it('LTC-06 mạng đứt và phản hồi sai hình dạng (HTML, thiếu `chuyenDuoc`) ⇒ câu chung kèm `Thử lại`, ngăn không vỡ', async () => {
    const failures = [
      () => {
        throw new TypeError('Failed to fetch');
      },
      () => new Response('<html>502</html>', { status: 200 }),
      () => {
        const detail: Record<string, unknown> = { ...makeReceptionDetail() };
        delete detail.chuyenDuoc;
        return jsonResponse(detail);
      },
    ];
    for (const failure of failures) {
      const { dialog, unmount } = await openWith(failure);
      expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
      expect(retry(dialog)).toBeInTheDocument();
      expect(
        within(dialog).queryByText(DETAIL_TEXT.sections.patient),
      ).toBeNull();
      unmount();
      cleanUpReceptionPage();
    }
  });
});

describe('trợ năng của ngăn', () => {
  it('LTC-07 hộp thoại modal có tên là mã lịch; focus vào `Danh sách` khi mở; nền `inert` khi mở và gỡ khi đóng', async () => {
    const { dialog } = await openDetail();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(`${DETAIL_TEXT.dialogPrefix}${CODE}`);
    expect(
      within(dialog).getByRole('button', { name: DETAIL_TEXT.back }),
    ).toHaveFocus();

    // Mọi phần tử con khác của `body` (gốc React) bị `inert` trong lúc mở
    const overlay = dialog.parentElement!;
    const background = Array.from(document.body.children).filter(
      (element) => element !== overlay,
    );
    expect(background.length).toBeGreaterThan(0);
    for (const element of background) expect(element).toHaveAttribute('inert');

    fireEvent.click(
      within(dialog).getByRole('button', { name: DETAIL_TEXT.close }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('LTC-07 Esc đóng và trả focus về ĐÚNG nút `Chi tiết` của hàng đã mở', async () => {
    const { dialog } = await openDetail();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(detailButton(CODE)).toHaveFocus();
  });

  it('LTC-07 có ba cách đóng nhìn thấy được: `Danh sách` (Figma), nút X `Đóng` (đề xuất) và bấm lớp phủ; bấm trong ngăn không đóng', async () => {
    const { dialog } = await openDetail();
    // Bấm vào nội dung ngăn: không đóng
    fireEvent.click(within(dialog).getByText(DETAIL_TEXT.sections.patient));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    for (const close of [
      () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: DETAIL_TEXT.back,
          }),
        ),
      () =>
        fireEvent.click(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: DETAIL_TEXT.close,
          }),
        ),
      () => fireEvent.click(screen.getByRole('dialog').parentElement!),
    ]) {
      fireEvent.click(detailButton(CODE));
      await screen.findByRole('dialog');
      close();
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
  });

  it('LTC-07 Tab bẫy trong ngăn: từ nút cuối quay về nút đầu, Shift+Tab từ nút đầu về nút cuối', async () => {
    const { dialog } = await openDetail({ chuyenDuoc: [], conPhaiThu: null });
    const back = within(dialog).getByRole('button', { name: DETAIL_TEXT.back });
    const close = within(dialog).getByRole('button', {
      name: DETAIL_TEXT.close,
    });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(back).toHaveFocus();
    fireEvent.keyDown(back, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
  });
});

describe('dữ liệu cá nhân khi xem chi tiết', () => {
  it('LTC-08 mở, xem, đóng chi tiết (lý do khám, SĐT): không localStorage, sessionStorage, cookie, không console, URL không đổi', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    localStorage.clear();
    sessionStorage.clear();

    const { dialog } = await openDetail({ lyDoHuy: null });
    expect(dialog).toHaveTextContent('0901234567');
    expect(currentUrl()).toBe('/le-tan/quan-ly-lich-hen');
    fireEvent.click(
      within(dialog).getByRole('button', { name: DETAIL_TEXT.close }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/le-tan/quan-ly-lich-hen');
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});
