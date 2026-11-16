import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  figmaData,
  renderExamPage,
  useFixedClock,
} from './testing/render-exam-page';
import {
  jsonOk,
  listBody,
  routeExamRequest,
  type FakeExamData,
} from './testing/fake-patient-exam-api';

// doctor-exam F5, WXH-06 (patient Q22: trạng thái chưa có frame Figma làm theo nếp): đang tải, rỗng ba mức (Q6, L6), lỗi kèm `Thử lại` chạy lại ĐÚNG bước vừa lỗi (lưới, danh sách tháng, ngăn chi tiết), mất mạng, phản hồi sai hình dạng,
// 404 của chi tiết, và đổi bộ lọc hay ca nhanh: yêu cầu cũ bị HUỶ, kết quả muộn không đè kết quả mới. Hết giờ (15 giây) kiểm ở `record-pane.test.tsx` (`FailureBox`).
const PATH = '/benh-nhan/ho-so-kham-benh';
const SERVER_BUSY = {
  maLoi: 'HE_THONG_DANG_BAN',
  thongBao: 'Hệ thống đang bận.',
};

beforeEach(() => {
  useFixedClock();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const monthCard = (title: string) =>
  screen.findByRole('region', { name: title });
const monthButton = (name: string) => screen.getByRole('button', { name });
const pane = () => screen.getByRole('region', { name: 'Chi tiết ca khám' });
const isList = (url: URL) => url.pathname.endsWith('/patient/exam-records');
const isCounts = (url: URL) => isList(url) && !url.searchParams.has('thang');
const isMonth = (url: URL) => isList(url) && url.searchParams.has('thang');
const busy = () => jsonOk(SERVER_BUSY, 503);

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('doctor-exam F5 — đang tải và rỗng', () => {
  it('WXH-06 đang tải lần đầu: tiêu đề vẫn hiện, MỘT dòng `role="status"` "Đang tải hồ sơ khám bệnh...", chưa có chip, tab năm, lưới', () => {
    // Câu trả lời treo mãi: trang ở trạng thái đang tải lần đầu
    renderExamPage({ respond: () => new Promise<Response>(() => undefined) });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Đang tải hồ sơ khám bệnh...',
    );
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('WXH-06 tài khoản chưa có ca hoàn thành nào (`nguoiKham[]` rỗng, 12 tháng bằng 0) ⇒ "Bạn chưa có ca khám nào đã hoàn thành.", không chip, không tab năm, không ngăn phải (Q6, L6)', async () => {
    renderExamPage({ data: { visits: [], people: [] } });
    expect(
      await screen.findByText('Bạn chưa có ca khám nào đã hoàn thành.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('WXH-06 năm không có ca (nhưng tài khoản có ca ở năm khác) ⇒ "Năm 2026 chưa có ca khám nào đã hoàn thành.": chip và tab năm VẪN hiện, 12 ô đều vô hiệu, không lời gọi danh sách tháng, không ngăn phải; đổi sang năm có ca thì có danh sách', async () => {
    const all = figmaData();
    const data: FakeExamData = {
      people: all.people,
      visits: all.visits.filter((row) => row.maLichHen === 'CLX-Y1'),
    };
    const { api } = renderExamPage({ data });
    expect(
      await screen.findByText('Năm 2026 chưa có ca khám nào đã hoàn thành.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Lọc theo người khám' }),
    ).toBeInTheDocument();
    const months = within(
      screen.getByRole('group', { name: 'Chọn tháng' }),
    ).getAllByRole('button');
    expect(months).toHaveLength(12);
    for (const month of months) expect(month).toBeDisabled();
    expect(
      screen.queryByRole('region', { name: 'Chi tiết ca khám' }),
    ).toBeNull();
    expect(api.listCalls()).toHaveLength(1);

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Năm' })).getByRole('button', {
        name: '2025',
      }),
    );
    expect(await monthCard('Tháng 12 2025')).toBeInTheDocument();
    expect(
      screen.queryByText('Năm 2026 chưa có ca khám nào đã hoàn thành.'),
    ).toBeNull();
  });

  it('WXH-06 tháng không có ca (lưới báo có ca nhưng danh sách trả rỗng) ⇒ "Tháng này chưa có ca khám nào đã hoàn thành.", lưới vẫn hiện', async () => {
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) => {
        if (!isMonth(url)) return undefined;
        const body = listBody(
          data,
          Object.fromEntries(url.searchParams.entries()),
        ) as {
          items: unknown[];
          total: number;
        };
        return jsonOk({ ...body, items: [], total: 0 });
      },
    });
    expect(
      await screen.findByText('Tháng này chưa có ca khám nào đã hoàn thành.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Chọn tháng' }),
    ).toBeInTheDocument();
  });

  it('WXH-06 danh sách tháng đang tải: dòng trạng thái ở cột trái, lưới và ngăn phải vẫn hiện', async () => {
    renderExamPage({
      respond: (url) =>
        isMonth(url) ? new Promise<Response>(() => undefined) : undefined,
    });
    await screen.findByRole('group', { name: 'Chọn tháng' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Đang tải hồ sơ khám bệnh...',
      ),
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(
      within(pane()).getByText('Chọn một ca khám để xem hồ sơ'),
    ).toBeInTheDocument();
  });
});

describe('doctor-exam F5 — lỗi kèm Thử lại chạy lại đúng bước', () => {
  it('WXH-06 lưới lỗi lần đầu (503): hộp lỗi chung kèm `Thử lại`, chưa có chip; bấm ⇒ gọi lại lưới rồi hiện trang', async () => {
    let failures = 1;
    const { api } = renderExamPage({
      respond: (url) => {
        if (isCounts(url) && failures > 0) {
          failures -= 1;
          return busy();
        }
        return undefined;
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByRole('group')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await monthCard('Tháng 10 2026');
    expect(
      api.listCalls().filter((call) => call.params.pageSize === '1'),
    ).toHaveLength(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('WXH-06 mất mạng (fetch bị từ chối) ở lần tải đầu ⇒ câu mất mạng kèm `Thử lại`', async () => {
    renderExamPage({
      respond: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    );
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('WXH-10 lưới sai hình dạng (thiếu khoá tháng) ⇒ hộp lỗi chung, KHÔNG vẽ lưới dở dang', async () => {
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) => {
        if (!isCounts(url)) return undefined;
        const body = listBody(
          data,
          Object.fromEntries(url.searchParams.entries()),
        ) as {
          demTheoThang: Record<string, number | undefined>;
        };
        body.demTheoThang['7'] = undefined;
        return jsonOk(body);
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByRole('group', { name: 'Chọn tháng' })).toBeNull();
  });

  it('WXH-06 lưới lỗi sau khi đã có dữ liệu (đổi người khám): chip và tab năm VẪN hiện, vùng lưới báo lỗi kèm `Thử lại`; bấm ⇒ gọi lại lưới rồi danh sách', async () => {
    let failures = 0;
    const { api } = renderExamPage({
      respond: (url) => {
        if (
          isCounts(url) &&
          url.searchParams.get('nguoiKham') === '501' &&
          failures === 0
        ) {
          failures += 1;
          return busy();
        }
        return undefined;
      },
    });
    await monthCard('Tháng 10 2026');
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Lọc theo người khám' }),
      ).getByRole('button', {
        name: 'Bùi Minh Khoa · Con',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(
      screen.getByRole('group', { name: 'Lọc theo người khám' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Năm' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Chọn tháng' })).toBeNull();
    expect(
      screen.queryByRole('region', { name: 'Chi tiết ca khám' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await monthCard('Tháng 10 2026');
    expect(
      api
        .listCalls()
        .filter(
          (call) =>
            call.params.nguoiKham === '501' && call.params.pageSize === '1',
        ),
    ).toHaveLength(2);
  });

  it('WXH-06 danh sách tháng lỗi (503): hộp lỗi ở cột trái, lưới và ngăn phải vẫn hiện; `Thử lại` chạy lại CHỈ danh sách tháng (lưới không gọi lại)', async () => {
    let failures = 1;
    const { api } = renderExamPage({
      respond: (url) => {
        if (isMonth(url) && failures > 0) {
          failures -= 1;
          return busy();
        }
        return undefined;
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(
      screen.getByRole('group', { name: 'Chọn tháng' }),
    ).toBeInTheDocument();
    expect(
      within(pane()).getByText('Chọn một ca khám để xem hồ sơ'),
    ).toBeInTheDocument();
    const countsBefore = api
      .listCalls()
      .filter((call) => call.params.thang === undefined).length;

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await monthCard('Tháng 10 2026');
    expect(
      api.listCalls().filter((call) => call.params.thang === undefined),
    ).toHaveLength(countsBefore);
    expect(
      api.listCalls().filter((call) => call.params.thang === '10'),
    ).toHaveLength(2);
  });

  it('WXH-10 MỘT dòng danh sách sai kiểu (`coHoSoKham: "true"`) ⇒ cả danh sách tháng thành hộp lỗi, không dòng nào được vẽ', async () => {
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) => {
        if (!isMonth(url)) return undefined;
        const body = listBody(
          data,
          Object.fromEntries(url.searchParams.entries()),
        ) as {
          items: Record<string, unknown>[];
        };
        body.items[1] = { ...body.items[1], coHoSoKham: 'true' };
        return jsonOk(body);
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(screen.queryByRole('region', { name: 'Tháng 10 2026' })).toBeNull();
    expect(screen.queryByText('Nhi khoa')).toBeNull();
  });

  it('WXH-06 chi tiết lỗi (503): hộp lỗi trong ngăn phải kèm `Thử lại`; bấm ⇒ gọi lại CHỈ chi tiết, danh sách và lưới không gọi lại', async () => {
    let failures = 1;
    const { api } = renderExamPage({
      respond: (url) => {
        if (url.pathname.includes('/patient/exam-records/') && failures > 0) {
          failures -= 1;
          return busy();
        }
        return undefined;
      },
    });
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    expect(await within(pane()).findByRole('alert')).toHaveTextContent(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    const listCallsBefore = api.listCalls().length;

    fireEvent.click(within(pane()).getByRole('button', { name: 'Thử lại' }));
    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(api.detailCalls()).toHaveLength(2);
    expect(api.listCalls()).toHaveLength(listCallsBefore);
  });

  it('WXH-06 `?ca=` không khớp ca nào (404 `KHONG_TIM_THAY`) ⇒ "Không tìm thấy ca khám này." trong ngăn phải, KHÔNG `Thử lại`; danh sách vẫn dùng được', async () => {
    renderExamPage({ url: `${PATH}?ca=KHONG-CO` });
    const card = await monthCard('Tháng 10 2026');
    expect(await within(pane()).findByRole('alert')).toHaveTextContent(
      'Không tìm thấy ca khám này.',
    );
    expect(within(pane()).queryByRole('button')).toBeNull();
    expect(within(card).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(within(pane()).queryByRole('alert')).toBeNull();
  });
});

describe('doctor-exam F5 — đổi nhanh: yêu cầu cũ bị huỷ, kết quả muộn không đè', () => {
  it('WXH-06 đổi người khám khi lưới của người trước còn đang tải: `signal` yêu cầu cũ bị huỷ; kết quả đến muộn KHÔNG đè (lưới và chip theo người mới)', async () => {
    const gate = deferred();
    const data = figmaData();
    const { api } = renderExamPage({
      data,
      respond: (url) =>
        isCounts(url) && url.searchParams.get('nguoiKham') === '501'
          ? gate.promise.then(() => routeExamRequest(url, data))
          : undefined,
    });
    await monthCard('Tháng 10 2026');

    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Lọc theo người khám' }),
      ).getByRole('button', {
        name: 'Bùi Minh Khoa · Con',
      }),
    );
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Lọc theo người khám' }),
      ).getByRole('button', {
        name: 'Nguyễn Văn A (Bản thân)',
      }),
    );
    await monthCard('Tháng 10 2026');
    const held = api
      .listCalls()
      .find((call) => call.params.nguoiKham === '501');
    expect(held?.signal?.aborted).toBe(true);

    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    // Người khám đang chọn là bản thân: tháng 3 KHÔNG có ca (của người thân thì có 2)
    expect(monthButton('Tháng 3, không có ca')).toBeDisabled();
    expect(
      within(
        screen.getByRole('group', { name: 'Lọc theo người khám' }),
      ).getByRole('button', {
        name: 'Nguyễn Văn A (Bản thân)',
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('WXH-06 chọn ca A rồi ca B khi chi tiết A còn đang tải: `signal` của A bị huỷ; chi tiết A đến muộn KHÔNG đè chi tiết B', async () => {
    const gate = deferred();
    const data = figmaData();
    const { api } = renderExamPage({
      data,
      respond: (url) =>
        url.pathname.endsWith('/CLX-A2')
          ? gate.promise.then(() => routeExamRequest(url, data))
          : undefined,
    });
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    fireEvent.click(within(card).getByRole('button', { name: /Nhi khoa/ }));
    await within(pane()).findByText('Chưa có hồ sơ khám');

    const held = api
      .detailCalls()
      .find((call) => call.path.endsWith('/CLX-A2'));
    expect(held?.signal?.aborted).toBe(true);
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(
      within(pane()).getByRole('heading', { level: 2, name: 'Nhi khoa' }),
    ).toBeInTheDocument();
    expect(
      within(pane()).queryByRole('heading', { level: 2, name: 'Tiêu hóa' }),
    ).toBeNull();
  });

  it('WXH-06 chi tiết của ca trước KHÔNG hiện cho ca sau: ngay sau khi chọn ca mới, ngăn phải về "đang tải"', async () => {
    const gate = deferred();
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) =>
        url.pathname.endsWith('/CLX-A1')
          ? gate.promise.then(() => routeExamRequest(url, data))
          : undefined,
    });
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));
    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });

    fireEvent.click(within(card).getByRole('button', { name: /Nhi khoa/ }));
    expect(within(pane()).getByRole('status')).toHaveTextContent(
      'Đang tải hồ sơ khám...',
    );
    expect(pane()).toHaveAttribute('aria-busy', 'true');
    expect(
      within(pane()).queryByRole('heading', { level: 2, name: 'Tiêu hóa' }),
    ).toBeNull();
    gate.release();
    await within(pane()).findByRole('heading', { level: 2, name: 'Nhi khoa' });
    expect(pane()).toHaveAttribute('aria-busy', 'false');
  });
});
