import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { receptionAppointmentDetailPath } from '../../../../../shared/routes/booking-paths';
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
  detailLink,
  listQueries,
  loaded,
  openReceptionDetail,
  RECEPTION_CODE,
  renderReceptionPage,
} from '../../../testing/reception-harness';
import { DETAIL_TEXT } from './detail-messages';

// booking F12b: TRANG chi tiết lịch hẹn của Lễ tân (F8, F9 làm NGĂN kéo: file này thay `reception-drawer.test.tsx`; Đại đổi thành trang 14/11/2026, TRACKING 3.42 câu (h)). Mã LTC là [đề xuất] (PLAN booking mục 7.34)
// và giữ nguyên ý nghĩa của F8: LTC-01 (tải), LTC-02 (nút theo `chuyenDuoc[]`, LTN-01), LTC-03 (`Thu tiền & tiếp đón`, LTN-05), LTC-04 (không POST), LTC-05 (nội dung), LTC-06 (lỗi theo `maLoi`), LTC-08 (dữ liệu cá nhân),
// LTC-10 (mỗi lần mở gọi lại GET). Mã UIF-14 (khung trang, thẻ đầu, hai cột) là [đề xuất] (PLAN 7.48). LTC-07 (trợ năng của NGĂN: modal, bẫy Tab, Esc, `inert`) KHÔNG còn: trang không phải modal; bẫy Tab và Esc của HỘP
// thao tác ở `action-dialogs-a11y.test.tsx` (UIF-15). API giả. Chữ lấy từ Figma `488:2`, `495:2` đến `497:2` đã đối chiếu 12/11/2026 (tên khối đổi sang kiểu thẻ của F12a: lệch có chủ ý, PLAN L38). `page` là khung chứa
// nội dung trang (không gồm hộp thoại: dựng bằng portal).
afterEach(cleanUpReceptionPage);

const CODE = RECEPTION_CODE;
const DETAIL_PATH = `/reception/appointments/${CODE}`;
const group = (page: HTMLElement) =>
  within(page).queryByRole('group', { name: DETAIL_TEXT.sections.actions });

// Nhãn các nút trong nhóm `Thao tác` theo thứ tự, bỏ chữ ẩn "(chưa được triển khai)" và chữ phụ của nút `Thu tiền`
const actionLabels = (page: HTMLElement) => {
  const box = group(page);
  const buttons = box ? within(box).getAllByRole('button') : [];
  return buttons.map((button) =>
    (button.textContent ?? '').replace(
      ` ${DETAIL_TEXT.notImplementedHidden}`,
      '',
    ),
  );
};

describe('mở trang và tải chi tiết', () => {
  it('LTC-01 mã lịch hiện NGAY dưới h1, thân tải đúng MỘT GET theo mã rồi mới hiện nội dung (có token, không POST)', async () => {
    let release: () => void = () => {};
    const { api } = renderReceptionPage({
      entry: receptionAppointmentDetailPath(CODE),
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

    expect(
      await screen.findByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.getByText(DETAIL_TEXT.loading)).toBeInTheDocument();
    // Chưa có chi tiết: chưa có nội dung nào, kể cả của dòng danh sách (chỉ MỘT nguồn là chi tiết)
    expect(
      screen.queryByRole('heading', { name: DETAIL_TEXT.sections.patient }),
    ).toBeNull();

    release();
    expect(
      await screen.findByRole('heading', {
        name: DETAIL_TEXT.sections.patient,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(DETAIL_TEXT.loading)).toBeNull();
    expect(api.callsTo(DETAIL_PATH)).toHaveLength(1);
    expect(api.callsTo(DETAIL_PATH)[0].hasToken).toBe(true);
    expect(api.writes()).toEqual([]);
    // Khi chi tiết đã về, mã nằm ở thẻ đầu (một lần), không còn dòng mã dưới h1
    expect(screen.getAllByText(CODE)).toHaveLength(1);
  });

  it('LTC-05 UIF-14 nội dung: bốn thẻ đúng tên và đúng thứ tự (bệnh nhân, lịch hẹn | chi phí, thao tác); nhãn đúng; KHÔNG có `Email`, `Kênh đặt`, "Đã thanh toán"; tiền định dạng từ chuỗi; ngày giờ Việt Nam', async () => {
    const { page } = await openReceptionDetail({ conPhaiThu: '200000.00' });

    // Chuyên khoa là tiêu đề của thẻ đầu (h2 đầu tiên); rồi bốn thẻ: hai bên trái (`main`) trước hai bên phải (`side`) trong MỘT lưới
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Tim mạch',
      DETAIL_TEXT.sections.patient,
      DETAIL_TEXT.sections.appointment,
      DETAIL_TEXT.sections.cost,
      DETAIL_TEXT.sections.actions,
    ]);
    for (const label of [
      'Họ tên',
      'Số điện thoại',
      'Lý do khám',
      'Bác sĩ',
      'Chuyên khoa',
      'Dịch vụ',
      'Giá khám',
      'Ngày khám',
      'Giờ khám',
      'Chi nhánh',
      'Tiền cọc',
      'Còn phải thu',
    ]) {
      expect(within(page).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(page).toHaveTextContent('Nguyễn Văn A');
    expect(page).toHaveTextContent('0901234567');
    expect(page).toHaveTextContent('Đau ngực nhẹ, theo dõi huyết áp');
    expect(page).toHaveTextContent('300.000đ');
    expect(page).toHaveTextContent('100.000đ');
    expect(page).toHaveTextContent('200.000đ');
    // 01:00 UTC ngày 18/10/2026 là 08:00 giờ Việt Nam, Chủ nhật: thẻ đầu ghi thứ, ngày và giờ; thẻ `Thông tin lịch hẹn` ghi ngày và giờ riêng
    expect(page).toHaveTextContent('Chủ nhật, 18/10/2026');
    expect(page).toHaveTextContent('08:00');
    expect(page).toHaveTextContent('18/10/2026');
    expect(page).toHaveTextContent('Đã xác nhận');

    for (const absent of [
      'Email',
      'Kênh đặt',
      'Online',
      'Tại quầy',
      'Đã thanh toán',
      'Đã đặt cọc',
      'Đổi lịch hộ',
    ]) {
      expect(within(page).queryByText(new RegExp(absent))).toBeNull();
    }
    // Không có `lyDoHuy`, hạn thanh toán ở lịch `DaXacNhan`
    expect(within(page).queryByText('Lý do hủy')).toBeNull();
    expect(within(page).queryByText('Hạn thanh toán')).toBeNull();
  });

  it('LTC-05 `conPhaiThu` là chuỗi decimal đưa nguyên ra, KHÔNG qua Number (số lớn hơn 2^53 giữ đủ chữ số); lý do khám rỗng ⇒ "Không ghi lý do"', async () => {
    const { page } = await openReceptionDetail({
      conPhaiThu: '9007199254740993.00',
      lyDoKham: null,
    });
    expect(page).toHaveTextContent('9.007.199.254.740.993đ');
    expect(page).toHaveTextContent(DETAIL_TEXT.noReason);
  });

  it('LTC-05 `Chờ thanh toán`: hiện hạn thanh toán theo giờ Việt Nam, không có dòng "còn phải thu"; `Đã hủy`: hiện lý do hủy mà Lễ tân được thấy', async () => {
    const waiting = await openReceptionDetail({
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-10-18T01:15:00.000Z',
      conPhaiThu: null,
      chuyenDuoc: ['DaHuy'],
    });
    expect(waiting.page).toHaveTextContent('Hạn thanh toán');
    expect(waiting.page).toHaveTextContent('Chủ nhật, 18/10/2026 · 08:15');
    expect(within(waiting.page).queryByText('Còn phải thu')).toBeNull();
    waiting.unmount();
    cleanUpReceptionPage();

    const cancelled = await openReceptionDetail({
      trangThai: 'DaHuy',
      lyDoHuy: 'Bệnh nhân gọi điện xin hủy',
      conPhaiThu: null,
      chuyenDuoc: [],
    });
    expect(cancelled.page).toHaveTextContent('Lý do hủy');
    expect(cancelled.page).toHaveTextContent('Bệnh nhân gọi điện xin hủy');
    expect(cancelled.page).toHaveTextContent('Đã hủy');
    // Không có nút nào ⇒ KHÔNG dựng thẻ `Thao tác`
    expect(group(cancelled.page)).toBeNull();
    expect(
      within(cancelled.page).queryByRole('heading', {
        name: DETAIL_TEXT.sections.actions,
      }),
    ).toBeNull();
  });

  it('LTC-05 người khám khác người đặt: có dòng `Người đặt`, SĐT ghi rõ là của người đặt, họ tên ghi "Người thân"; cùng một người thì không', async () => {
    const relative = await openReceptionDetail({
      nguoiKham: { hoTen: 'Bùi Minh Khoa', laBanThan: false },
      nguoiDat: { hoTen: 'Lê Thị M', soDienThoai: '0912345678' },
    });
    expect(relative.page).toHaveTextContent('Bùi Minh Khoa');
    expect(within(relative.page).getByText('Người đặt')).toBeInTheDocument();
    expect(relative.page).toHaveTextContent('Lê Thị M');
    expect(relative.page).toHaveTextContent('0912345678');
    expect(relative.page).toHaveTextContent(DETAIL_TEXT.bookerPhone);
    expect(relative.page).toHaveTextContent(DETAIL_TEXT.relativePerson);
    relative.unmount();
    cleanUpReceptionPage();

    const own = await openReceptionDetail();
    expect(within(own.page).queryByText('Người đặt')).toBeNull();
    expect(own.page).not.toHaveTextContent(DETAIL_TEXT.bookerPhone);
    expect(own.page).toHaveTextContent(DETAIL_TEXT.ownPerson);
  });

  it('LTC-10 mỗi lần vào trang gọi lại GET (không dùng bản của lần trước); vào lịch khác thì không thấy dữ liệu của lịch trước trong lúc tải', async () => {
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
    const patient = { name: DETAIL_TEXT.sections.patient };
    fireEvent.click(detailLink('CP20261018001'));
    await screen.findByRole('heading', patient);
    fireEvent.click(screen.getByRole('link', { name: DETAIL_TEXT.back }));
    await loaded();

    fireEvent.click(detailLink('CP20261018001'));
    await screen.findByRole('heading', patient);
    expect(api.callsTo('/reception/appointments/CP20261018001')).toHaveLength(
      2,
    );
    fireEvent.click(screen.getByRole('link', { name: DETAIL_TEXT.back }));
    await loaded();

    // Lịch 2: giữ phản hồi để thấy trạng thái đang tải
    api.failNext('detail', () => new Promise(() => {}));
    fireEvent.click(detailLink('CP20261018002'));
    expect(await screen.findByText(DETAIL_TEXT.loading)).toBeInTheDocument();
    expect(screen.getByText('CP20261018002')).toBeInTheDocument();
    expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
  });
});

describe('khung trang (UIF-14)', () => {
  it('UIF-14 khung căn giữa `max-w-[64rem]` như ba vai trò còn lại: liên kết `Quay lại danh sách`, h1 `Chi tiết lịch hẹn`, thẻ đầu là vùng có tên, hai cột `main` rồi `side` trong MỘT lưới; không phải hộp thoại', async () => {
    await openReceptionDetail();
    // Chữ cố định (không qua `DETAIL_TEXT.title`): đổi hằng thì cả hai vế đổi theo (đột biến G3H, TRACKING 3.44.6).
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Chi tiết lịch hẹn',
    });
    const frame = heading.closest('section');
    expect(frame).toHaveClass('mx-auto', 'max-w-[64rem]');
    expect(
      within(frame as HTMLElement).getByRole('link', {
        name: DETAIL_TEXT.back,
      }),
    ).toHaveAttribute('href', '/le-tan/quan-ly-lich-hen');

    const hero = screen.getByRole('region', { name: DETAIL_TEXT.summary });
    expect(within(hero).getByText(CODE)).toBeInTheDocument();
    expect(within(hero).getByText('Đã xác nhận')).toBeInTheDocument();
    // Bốn ô của thẻ đầu: Người khám, Ngày khám, Bác sĩ, Chi nhánh
    for (const label of ['Người khám', 'Ngày khám', 'Bác sĩ', 'Chi nhánh']) {
      expect(within(hero).getByText(label)).toBeInTheDocument();
    }
    // Hai cột trong MỘT lưới, `main` (bệnh nhân, lịch hẹn) đứng trước `side` (chi phí, thao tác)
    const grid = hero.nextElementSibling as HTMLElement;
    expect(grid.children).toHaveLength(2);
    expect(
      within(grid.children[0] as HTMLElement).getByRole('heading', {
        name: DETAIL_TEXT.sections.patient,
      }),
    ).toBeInTheDocument();
    expect(
      within(grid.children[1] as HTMLElement).getByRole('heading', {
        name: DETAIL_TEXT.sections.cost,
      }),
    ).toBeInTheDocument();
    // Trang, không phải hộp thoại: không `dialog`, không `aria-modal`, không `inert`
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('[aria-modal]')).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
  });

  it('UIF-14 ba thẻ thông tin cùng MỘT lớp CSS của `DetailCard` (h2 có đường kẻ, chữ thường đậm, có biểu tượng), thẻ `Thao tác` cùng kiểu đường kẻ; không chữ HOA của ngăn (Figma 488:2 viết HOA: lệch có chủ ý)', async () => {
    await openReceptionDetail();
    const cards = [
      DETAIL_TEXT.sections.patient,
      DETAIL_TEXT.sections.appointment,
      DETAIL_TEXT.sections.cost,
    ].map((name) => screen.getByRole('heading', { level: 2, name }));
    for (const head of cards) {
      expect(head.className).toBe(cards[0].className);
      expect(head.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(head).not.toHaveClass('uppercase');
    }
    expect(cards[0]).toHaveClass('border-b', 'px-5', 'py-3.5', 'font-semibold');
    const actions = screen.getByRole('heading', {
      level: 2,
      name: DETAIL_TEXT.sections.actions,
    });
    expect(actions).toHaveClass('border-b', 'px-5', 'py-3.5', 'font-semibold');
    expect(actions).not.toHaveClass('uppercase');
  });

  it('UIF-14 `aria-busy` của khung bật khi đang tải và tắt khi đã có chi tiết', async () => {
    let release: () => void = () => {};
    renderReceptionPage({
      entry: receptionAppointmentDetailPath(CODE),
      before: (fake) => {
        fake.failNext(
          'detail',
          () =>
            new Promise<Response>((resolve) => {
              release = () => resolve(jsonResponse(makeReceptionDetail()));
            }),
        );
      },
    });
    const heading = await screen.findByRole('heading', {
      level: 1,
      name: DETAIL_TEXT.title,
    });
    const frame = heading.closest('section') as HTMLElement;
    expect(frame).toHaveAttribute('aria-busy', 'true');
    release();
    await screen.findByRole('heading', { name: DETAIL_TEXT.sections.patient });
    expect(frame).toHaveAttribute('aria-busy', 'false');
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
    const { page } = await openReceptionDetail({
      trangThai: item.trangThai,
      chuyenDuoc: item.chuyenDuoc,
      conPhaiThu: item.conPhaiThu,
    });
    const labels = actionLabels(page);
    // `Thu tiền & tiếp đón` đứng đầu nhóm khi có; phần còn lại theo thứ tự cố định của Figma
    const expected = item.collect
      ? ['Thu tiền & tiếp đón', ...item.labels]
      : item.labels;
    expect(labels).toEqual(expected);

    // F9 đã gắn hành động cho cả ba nút theo `chuyenDuoc[]`: nút BẬT và tên truy cập chính xác là nhãn (không còn chữ ẩn "(chưa được triển khai)" của F8).
    // `Thu tiền & tiếp đón` mở hộp của payment F4 nên cũng BẬT (LTC-03, LTN-05 hết vô hiệu).
    for (const label of item.labels) {
      expect(within(page).getByRole('button', { name: label })).toBeEnabled();
    }
    if (item.collect) {
      expect(
        within(page).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
      ).toBeEnabled();
    }
  });

  it('LTC-03 `Thu tiền & tiếp đón` (LTN-05, payment F4 WTQ-04): BẬT; chỉ khi Đã xác nhận còn phải thu (kiểm trên chuỗi)', async () => {
    const due = await openReceptionDetail({ conPhaiThu: '0.10' });
    const button = within(due.page).getByRole('button', {
      name: /Thu tiền & tiếp đón/,
    });
    expect(button).toBeEnabled();
    due.unmount();
    cleanUpReceptionPage();

    // Hết nợ hay không có số (mọi cách viết số không): không nút
    for (const conPhaiThu of ['0', '0.0', '0.00', '000.00', null]) {
      const view = await openReceptionDetail({ conPhaiThu });
      expect(
        within(view.page).queryByRole('button', {
          name: /Thu tiền & tiếp đón/,
        }),
        String(conPhaiThu),
      ).toBeNull();
      view.unmount();
      cleanUpReceptionPage();
    }

    // Ca âm: trạng thái khác `DaXacNhan` không có nút này dù API lỡ trả số (backend chỉ trả ở Đã xác nhận)
    const waiting = await openReceptionDetail({
      trangThai: 'ChoThanhToan',
      conPhaiThu: '300000.00',
      chuyenDuoc: ['DaHuy'],
    });
    expect(
      within(waiting.page).queryByRole('button', {
        name: /Thu tiền & tiếp đón/,
      }),
    ).toBeNull();
  });

  it('LTC-04 xem chi tiết không gọi route ghi nào: bấm `Thu tiền & tiếp đón` chỉ MỞ hộp (GET bản xem trước), không phát sinh POST', async () => {
    const { page, api } = await openReceptionDetail({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '200000.00',
    });
    fireEvent.click(
      within(page).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(api.writes()).toEqual([]);
    expect(api.requests.every((request) => request.method === 'GET')).toBe(
      true,
    );
  });
});

describe('lỗi tải chi tiết theo maLoi', () => {
  function openWith(failure: () => Response | Promise<Response>) {
    return renderReceptionPage({
      entry: receptionAppointmentDetailPath(CODE),
      before: (api) => {
        api.appointments = [makeReceptionAppointment()];
        api.failNext('detail', failure);
      },
    });
  }
  const retry = () => screen.queryByRole('button', { name: 'Thử lại' });

  it('LTC-06 404 `KHONG_TIM_THAY` ⇒ MỘT câu "Không tìm thấy lịch hẹn này.", không `Thử lại`; `Quay lại danh sách` về danh sách (dựng lại và tự tải)', async () => {
    const { api } = openWith(() => apiErrorResponse(404, 'KHONG_TIM_THAY'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      DETAIL_TEXT.notFound,
    );
    expect(retry()).toBeNull();
    expect(
      screen.queryByRole('heading', { name: DETAIL_TEXT.sections.patient }),
    ).toBeNull();
    // Mã lịch vẫn hiện dưới h1 và không lộ gì khác
    expect(screen.getByText(CODE)).toBeInTheDocument();

    expect(listQueries(api)).toHaveLength(0);
    fireEvent.click(screen.getByRole('link', { name: DETAIL_TEXT.back }));
    await loaded();
    expect(listQueries(api)).toHaveLength(1);
  });

  it('LTC-06 `CHUA_DANG_NHAP` và `KHONG_DU_QUYEN` có câu riêng, không `Thử lại`; cùng `maLoi` khác mã HTTP vẫn ra đúng câu', async () => {
    for (const [status, maLoi, text] of [
      [401, 'CHUA_DANG_NHAP', DETAIL_TEXT.sessionExpired],
      [500, 'CHUA_DANG_NHAP', DETAIL_TEXT.sessionExpired],
      [403, 'KHONG_DU_QUYEN', DETAIL_TEXT.forbidden],
      [500, 'KHONG_DU_QUYEN', DETAIL_TEXT.forbidden],
    ] as const) {
      const { unmount } = openWith(() => apiErrorResponse(status, maLoi));
      expect(await screen.findByRole('alert')).toHaveTextContent(text);
      expect(retry()).toBeNull();
      unmount();
      cleanUpReceptionPage();
    }
  });

  it('LTC-06 `maLoi` lạ cùng HTTP 404 (hay 500, 403) ⇒ câu chung kèm `Thử lại`, KHÔNG phải câu "không tìm thấy"; `Thử lại` tải lại và hiện nội dung', async () => {
    for (const status of [404, 500, 403]) {
      const { unmount } = openWith(() => apiErrorResponse(status, 'MA_LOI_LA'));
      expect(await screen.findByRole('alert')).not.toHaveTextContent(
        DETAIL_TEXT.notFound,
      );
      expect(retry()).toBeInTheDocument();
      unmount();
      cleanUpReceptionPage();
    }

    openWith(() => apiErrorResponse(500, 'MA_LOI_LA'));
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('heading', {
        name: DETAIL_TEXT.sections.patient,
      }),
    ).toBeInTheDocument();
  });

  it('LTC-06 mạng đứt và phản hồi sai hình dạng (HTML, thiếu `chuyenDuoc`) ⇒ câu chung kèm `Thử lại`, trang không vỡ (vẫn có h1 và liên kết quay lại)', async () => {
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
      const { unmount } = openWith(failure);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(retry()).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: DETAIL_TEXT.sections.patient }),
      ).toBeNull();
      expect(
        screen.getByRole('heading', { level: 1, name: DETAIL_TEXT.title }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: DETAIL_TEXT.back }),
      ).toBeInTheDocument();
      unmount();
      cleanUpReceptionPage();
    }
  });
});

describe('dữ liệu cá nhân khi xem chi tiết', () => {
  it('LTC-08 vào, xem, quay lại (lý do khám, SĐT): không localStorage, sessionStorage, cookie, không console; URL chỉ có mã lịch (không SĐT, không lý do, không query)', async () => {
    const consoleSpies = (
      ['log', 'info', 'warn', 'error', 'debug'] as const
    ).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    localStorage.clear();
    sessionStorage.clear();

    const { page } = await openReceptionDetail({ lyDoHuy: null });
    expect(page).toHaveTextContent('0901234567');
    expect(currentUrl()).toBe(receptionAppointmentDetailPath(CODE));
    expect(currentUrl()).not.toMatch(/0901234567|Đau ngực|\?|#/);
    fireEvent.click(screen.getByRole('link', { name: DETAIL_TEXT.back }));
    await loaded();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    expect(currentUrl()).toBe('/le-tan/quan-ly-lich-hen');
    consoleSpies.forEach((spy) => spy.mockRestore());
  });
});

describe('payment F4 — hộp "Thu tiền & tiếp đón" gắn vào trang chi tiết', () => {
  const COLLECT_PATH = `${DETAIL_PATH}/collect-cash`;
  const openDue = () =>
    openReceptionDetail({
      chuyenDuoc: ['DaHuy'],
      conPhaiThu: '200000.00',
      giaSnapshot: '300000.00',
    });

  it('WTQ-04 ★ bấm `Thu tiền & tiếp đón` ⇒ mở hộp với thông tin lịch của trang và ba số của máy chủ; KHÔNG POST khi chưa xác nhận', async () => {
    const { page, api } = await openDue();
    fireEvent.click(
      within(page).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Thu tiền & tiếp đón',
    });
    expect(
      await within(dialog).findByRole('button', {
        name: 'Thu tiền & tiếp đón',
      }),
    ).toBeEnabled();
    expect(within(dialog).getByText(`#${RECEPTION_CODE}`)).toBeVisible();
    expect(within(dialog).getByText('300.000đ')).toBeVisible();
    expect(api.callsTo(`${DETAIL_PATH}/cash-preview`)).toHaveLength(1);
    expect(api.writes()).toEqual([]);
  });

  it('WTQ-05 ★ thu thành công ⇒ phiếu thu trong hộp, chi tiết TẢI LẠI (Đã tiếp đón, hết nút thu); đóng hộp không gọi thêm', async () => {
    const { page, api } = await openDue();
    fireEvent.click(
      within(page).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Thu tiền & tiếp đón',
      }),
    );
    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Đã thu tiền và tiếp đón bệnh nhân.',
    );
    expect(api.writes().map((request) => request.path)).toEqual([COLLECT_PATH]);
    expect(api.writes()[0]!.body).toEqual({ soTien: '200000' });
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
    await waitFor(() =>
      expect(
        within(page).queryByRole('button', { name: /Thu tiền & tiếp đón/ }),
      ).toBeNull(),
    );
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Đóng' })[1]!,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.writes()).toHaveLength(1);
  });

  it('WTQ-06 `Hủy` đóng hộp, KHÔNG POST, tiêu điểm về đúng nút `Thu tiền & tiếp đón`', async () => {
    const { page, api } = await openDue();
    const trigger = within(page).getByRole('button', {
      name: /Thu tiền & tiếp đón/,
    });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(api.writes()).toEqual([]);
  });

  it('WTQ-03 thu trả 409 LICH_HEN_KHONG_CHO_THU_TIEN (Lễ tân khác vừa tiếp đón) ⇒ câu theo mã trong hộp và chi tiết TẢI LẠI', async () => {
    const { page, api } = await openDue();
    // Lời gọi thứ nhất (xem trước) đi đường mặc định của API giả; lời gọi thứ hai (thu) bị máy chủ từ chối
    api.failNext('cash', () =>
      jsonResponse({
        maLichHen: RECEPTION_CODE,
        giaKham: '300000.00',
        daThanhToanTruoc: '100000.00',
        thuTaiQuay: '200000.00',
      }),
    );
    api.failNext('cash', () =>
      apiErrorResponse(409, 'LICH_HEN_KHONG_CHO_THU_TIEN'),
    );
    fireEvent.click(
      within(page).getByRole('button', { name: /Thu tiền & tiếp đón/ }),
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      await within(dialog).findByRole('button', {
        name: 'Thu tiền & tiếp đón',
      }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Lịch hẹn không còn ở trạng thái đã xác nhận.',
    );
    await waitFor(() => expect(api.callsTo(DETAIL_PATH)).toHaveLength(2));
  });
});
