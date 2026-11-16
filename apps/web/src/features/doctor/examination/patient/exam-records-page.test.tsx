import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  figmaData,
  renderExamPage,
  useFixedClock,
} from './testing/render-exam-page';
import { jsonOk, listBody, visit } from './testing/fake-patient-exam-api';

// doctor-exam F5, mức TRANG (Figma `414:2`, `443:2`, `415:2`): WXH-02 (lưới 12 tháng, danh sách tháng, tab năm), WXH-03 (lọc người khám), WXH-04 (chọn ca ⇒ ngăn chi tiết), WXH-05 (nhãn và "Chưa có hồ sơ khám"), WXH-07 (liên kết), WXH-15 [đề xuất]
// (luồng hai bước), XHS-02 phần web. `fetch` là bộ giả theo hợp đồng B4, B5; đồng hồ giả chỉ `Date` (16/11/2026, năm hiện tại theo giờ VN là 2026). Bộ dữ liệu tái hiện Figma: tháng 10 có 2 ca, tháng 6 có 5 ca (testing/render-exam-page.tsx).
const PATH = '/benh-nhan/ho-so-kham-benh';

beforeEach(() => {
  useFixedClock();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const monthButton = (name: string) => screen.getByRole('button', { name });
const chip = (name: string) =>
  within(screen.getByRole('group', { name: 'Lọc theo người khám' })).getByRole(
    'button',
    { name },
  );
const yearTabs = () =>
  within(screen.getByRole('group', { name: 'Năm' })).getAllByRole('button');
const monthCard = (title: string) =>
  screen.findByRole('region', { name: title });
const pane = () => screen.getByRole('region', { name: 'Chi tiết ca khám' });
const rowsOf = (card: HTMLElement) => within(card).getAllByRole('button');

describe('doctor-exam F5 — mở trang, lưới 12 tháng và danh sách tháng', () => {
  it('WXH-15 mở trang: tiêu đề và mô tả Figma; ĐÚNG hai lời gọi (lưới `pageSize=1`, rồi tháng 10 `pageSize=50`), chưa gọi chi tiết; ngăn phải là lời nhắc', async () => {
    const { api } = renderExamPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hồ sơ khám bệnh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Lịch sử khám và ghi chú của bác sĩ cho các ca đã hoàn thành.',
      ),
    ).toBeInTheDocument();
    await monthCard('Tháng 10 2026');

    expect(api.listCalls().map((call) => call.params)).toEqual([
      { nam: '2026', pageSize: '1' },
      { nam: '2026', thang: '10', pageSize: '50' },
    ]);
    expect(api.detailCalls()).toHaveLength(0);
    expect(
      within(pane()).getByText('Chọn một ca khám để xem hồ sơ'),
    ).toBeInTheDocument();
  });

  it('WXH-02 lưới: mỗi tháng đúng số ca của máy chủ (tháng 1 có 1 ca vì 17:30Z ngày 31/12 đã là 00:30 ngày 01/01 giờ VN), ô 0 ca vô hiệu, tháng 10 đang chọn', async () => {
    renderExamPage();
    await monthCard('Tháng 10 2026');
    const expected: Record<number, number> = { 1: 1, 3: 2, 5: 1, 6: 5, 10: 2 };
    for (let month = 1; month <= 12; month += 1) {
      const count = expected[month] ?? 0;
      const button = monthButton(
        count > 0
          ? `Tháng ${month}, ${count} ca`
          : `Tháng ${month}, không có ca`,
      );
      if (count > 0) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
      expect(button).toHaveAttribute(
        'aria-pressed',
        month === 10 ? 'true' : 'false',
      );
    }
  });

  it('WXH-02 danh sách tháng 10: đầu thẻ "Tháng 10 2026" và "2 ca"; hai hàng giờ khám giảm dần (14:00 rồi 09:30) với nhãn đúng cờ `coHoSoKham` (Figma 414:275)', async () => {
    renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    expect(within(card).getByText('2 ca')).toBeInTheDocument();
    const [first, second] = rowsOf(card);
    for (const text of [
      '18',
      'CN',
      '14:00',
      'Nhi khoa',
      'Bùi Minh Khoa',
      'Con',
      'BS Lê Thảo Vy',
      'Chưa có hồ sơ',
    ]) {
      expect(first).toHaveTextContent(text);
    }
    for (const text of [
      '18',
      'CN',
      '09:30',
      'Tiêu hóa',
      'Nguyễn Văn A',
      'Bản thân',
      'TS.BS Phạm Hoàng Nam',
      'Đã có hồ sơ',
    ]) {
      expect(second).toHaveTextContent(text);
    }
    expect(first).not.toHaveTextContent('Đã có hồ sơ');
    expect(second).not.toHaveTextContent('Chưa có hồ sơ');
  });

  it('WXH-02 chọn tháng 6: MỘT lời gọi mới `thang=6`, KHÔNG gọi lại lưới (lưới giữ nguyên); thẻ "Tháng 6 2026", "5 ca", năm hàng ngày giảm dần với thứ đúng Figma 443:2', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    fireEvent.click(monthButton('Tháng 6, 5 ca'));
    const card = await monthCard('Tháng 6 2026');

    expect(within(card).getByText('5 ca')).toBeInTheDocument();
    const dates = rowsOf(card).map((row) =>
      (row.textContent ?? '').match(/^(\d+)(CN|Thứ \d)(\d\d:\d\d)/)?.slice(1),
    );
    expect(dates).toEqual([
      ['12', 'Thứ 6', '14:30'],
      ['11', 'Thứ 5', '09:30'],
      ['10', 'Thứ 4', '09:00'],
      ['5', 'Thứ 6', '08:30'],
      ['1', 'Thứ 2', '10:30'],
    ]);
    expect(api.listCalls()).toHaveLength(3);
    expect(api.listCalls()[2].params).toEqual({
      nam: '2026',
      thang: '6',
      pageSize: '50',
    });
    expect(monthButton('Tháng 6, 5 ca')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(monthButton('Tháng 10, 2 ca')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(monthButton('Tháng 3, 2 ca')).toBeInTheDocument();
  });

  it('WXH-02 bấm ô tháng không có ca: không có lời gọi nào', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    const before = api.calls.length;
    fireEvent.click(monthButton('Tháng 2, không có ca'));
    expect(api.calls).toHaveLength(before);
    expect(
      screen.getByRole('region', { name: 'Tháng 10 2026' }),
    ).toBeInTheDocument();
  });

  it('WXH-02 bấm lại tháng đang chọn: không lời gọi mới', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    const before = api.calls.length;
    fireEvent.click(monthButton('Tháng 10, 2 ca'));
    expect(api.calls).toHaveLength(before);
  });

  it('WXH-02 tab năm: năm hiện tại và 4 năm trước; chọn 2025 ⇒ lưới `nam=2025` rồi danh sách tháng 12 (tháng mới nhất có ca của năm đó)', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    expect(yearTabs().map((tab) => tab.textContent)).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
    ]);
    expect(yearTabs()[0]).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(yearTabs()[1]);
    const card = await monthCard('Tháng 12 2025');
    expect(
      api
        .listCalls()
        .slice(2)
        .map((call) => call.params),
    ).toEqual([
      { nam: '2025', pageSize: '1' },
      { nam: '2025', thang: '12', pageSize: '50' },
    ]);
    expect(yearTabs()[1]).toHaveAttribute('aria-pressed', 'true');
    expect(yearTabs()[0]).toHaveAttribute('aria-pressed', 'false');
    expect(monthButton('Tháng 12, 1 ca')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(rowsOf(card)).toHaveLength(1);
    expect(rowsOf(card)[0]).toHaveTextContent('Nội tổng quát');
  });

  it('WXH-12 năm hiện tại THEO GIỜ VIỆT NAM: 17:00Z ngày 31/12/2026 đã là năm 2027 (tab đầu và lời gọi lưới)', async () => {
    vi.setSystemTime(new Date('2026-12-31T17:00:00.000Z'));
    const { api } = renderExamPage();
    await screen.findByText('Năm 2027 chưa có ca khám nào đã hoàn thành.');
    expect(yearTabs().map((tab) => tab.textContent)).toEqual([
      '2027',
      '2026',
      '2025',
      '2024',
      '2023',
    ]);
    expect(api.listCalls().map((call) => call.params)).toEqual([
      { nam: '2027', pageSize: '1' },
    ]);
  });
});

describe('doctor-exam F5 — lọc người khám', () => {
  it('WXH-03 chip theo thứ tự API; chọn người thân ⇒ `nguoiKham=501` ở lưới và danh sách, chip KHÔNG biến mất lúc tải lại, lưới đổi theo người đó', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    expect(
      within(screen.getByRole('group', { name: 'Lọc theo người khám' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Tất cả người đi khám',
      'Nguyễn Văn A (Bản thân)',
      'Bùi Minh Khoa · Con',
    ]);

    fireEvent.click(chip('Bùi Minh Khoa · Con'));
    expect(chip('Bùi Minh Khoa · Con')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Nguyễn Văn A (Bản thân)')).toBeInTheDocument();
    expect(chip('Tất cả người đi khám')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    const card = await monthCard('Tháng 10 2026');
    expect(monthButton('Tháng 3, 2 ca')).toBeInTheDocument();
    expect(monthButton('Tháng 1, không có ca')).toBeDisabled();
    expect(rowsOf(card)).toHaveLength(1);
    expect(rowsOf(card)[0]).toHaveTextContent('Nhi khoa');
    expect(
      api
        .listCalls()
        .slice(2)
        .map((call) => call.params),
    ).toEqual([
      { nguoiKham: '501', nam: '2026', pageSize: '1' },
      { nguoiKham: '501', nam: '2026', thang: '10', pageSize: '50' },
    ]);
  });

  it('WXH-03 chọn bản thân ⇒ `nguoiKham=BanThan`; chọn "Tất cả người đi khám" ⇒ KHÔNG gửi khoá `nguoiKham`', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    fireEvent.click(chip('Nguyễn Văn A (Bản thân)'));
    await waitFor(() =>
      expect(monthButton('Tháng 3, không có ca')).toBeInTheDocument(),
    );
    await monthCard('Tháng 10 2026');
    expect(api.listCalls().at(-1)?.params).toEqual({
      nguoiKham: 'BanThan',
      nam: '2026',
      thang: '10',
      pageSize: '50',
    });

    fireEvent.click(chip('Tất cả người đi khám'));
    await waitFor(() =>
      expect(monthButton('Tháng 3, 2 ca')).toBeInTheDocument(),
    );
    await monthCard('Tháng 10 2026');
    expect(api.listCalls().at(-1)?.params).toEqual({
      nam: '2026',
      thang: '10',
      pageSize: '50',
    });
    expect(api.listCalls().at(-2)?.params).toEqual({
      nam: '2026',
      pageSize: '1',
    });
  });

  it('WXH-03 đổi người khám ⇒ tháng về mặc định (tháng mới nhất có ca của người đó), dù trước đó đã chọn tay tháng khác', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    fireEvent.click(monthButton('Tháng 6, 5 ca'));
    await monthCard('Tháng 6 2026');

    fireEvent.click(chip('Bùi Minh Khoa · Con'));
    await monthCard('Tháng 10 2026');
    expect(api.listCalls().at(-1)?.params.thang).toBe('10');
    expect(monthButton('Tháng 10, 1 ca')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('WXH-03 bấm lại người khám đang chọn: không lời gọi mới', async () => {
    const { api } = renderExamPage();
    await monthCard('Tháng 10 2026');
    const before = api.calls.length;
    fireEvent.click(chip('Tất cả người đi khám'));
    expect(api.calls).toHaveLength(before);
  });
});

describe('doctor-exam F5 — chọn ca và ngăn chi tiết', () => {
  it('WXH-04 chọn ca ⇒ MỘT lời gọi chi tiết theo mã; ngăn phải hiện thẻ đầu, bốn khối, liên kết; URL chỉ có `?ca=` và dùng REPLACE; hàng được tô; tiêu điểm vào ngăn', async () => {
    const { api, router } = renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Tiêu hóa/ }));

    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(api.detailCalls()).toHaveLength(1);
    expect(api.detailCalls()[0].path).toBe('/patient/exam-records/CLX-A2');
    expect(api.detailCalls()[0].params).toEqual({});
    expect(router.state.location.search).toBe('?ca=CLX-A2');
    expect(router.state.historyAction).toBe('REPLACE');

    const rows = rowsOf(screen.getByRole('region', { name: 'Tháng 10 2026' }));
    expect(rows[1]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    expect(pane()).toHaveFocus();

    expect(pane()).toHaveTextContent('CLX-A2');
    expect(pane()).toHaveTextContent('Hoàn thành');
    expect(pane()).toHaveTextContent('TS.BS Phạm Hoàng Nam');
    expect(pane()).toHaveTextContent('Chi nhánh');
    expect(pane()).toHaveTextContent('CLINIX Chi nhánh Quận 3');
    expect(
      within(pane())
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual([
      'Triệu chứng',
      'Chẩn đoán sơ bộ',
      'Hướng xử lý / Lời khuyên',
      'Ngày tái khám dự kiến',
    ]);
    expect(pane()).toHaveTextContent('Cập nhật lần cuối: 17:30 10/6/26');
    expect(
      within(pane()).getByRole('link', { name: 'Xem chi tiết lịch hẹn →' }),
    ).toHaveAttribute('href', '/benh-nhan/lich-hen-cua-toi/CLX-A2');
  });

  it('WXH-05 ca chưa có hồ sơ ⇒ hộp "Chưa có hồ sơ khám" (không nội dung giả, không bốn khối); thẻ đầu vẫn có', async () => {
    renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Nhi khoa/ }));
    await within(pane()).findByText('Chưa có hồ sơ khám');
    expect(within(pane()).queryAllByRole('term')).toHaveLength(0);
    expect(within(pane()).queryByText(/Cập nhật lần cuối/)).toBeNull();
    expect(
      within(pane()).getByRole('heading', { level: 2, name: 'Nhi khoa' }),
    ).toBeInTheDocument();
    expect(pane()).toHaveTextContent('Bùi Minh Khoa');
    expect(pane()).toHaveTextContent('Con');
  });

  it('WXH-04 mở thẳng `?ca=`: chi tiết tải ngay (không cần chọn), KHÔNG cướp tiêu điểm khi vào trang, hàng của ca được tô khi có trong danh sách', async () => {
    const { api, router } = renderExamPage({ url: `${PATH}?ca=CLX-A2` });
    await monthCard('Tháng 10 2026');
    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(api.detailCalls()).toHaveLength(1);
    expect(pane()).not.toHaveFocus();
    expect(document.body).toHaveFocus();
    expect(
      rowsOf(screen.getByRole('region', { name: 'Tháng 10 2026' }))[1],
    ).toHaveAttribute('aria-current', 'true');
    expect(router.state.location.search).toBe('?ca=CLX-A2');
  });

  it('WXH-15 bấm hai lần cùng ca: MỘT lời gọi chi tiết; sang ca khác: lời gọi thứ hai', async () => {
    const { api } = renderExamPage();
    const card = await monthCard('Tháng 10 2026');
    const row = within(card).getByRole('button', { name: /Tiêu hóa/ });
    fireEvent.click(row);
    fireEvent.click(row);
    await within(pane()).findByRole('heading', { level: 2, name: 'Tiêu hóa' });
    expect(api.detailCalls()).toHaveLength(1);

    fireEvent.click(within(card).getByRole('button', { name: /Nhi khoa/ }));
    await within(pane()).findByText('Chưa có hồ sơ khám');
    expect(api.detailCalls()).toHaveLength(2);
    expect(api.detailCalls()[1].path).toBe('/patient/exam-records/CLX-A1');
  });

  it('WXH-07 mã lịch có `/`, `?`, `#`: đường dẫn chi tiết và liên kết đều được mã hoá', async () => {
    const data = figmaData();
    data.visits.push(
      visit('2026-10-19T02:00:00.000Z', {
        maLichHen: 'CLX/9?1#2',
        chuyenKhoa: 'Mắt',
      }),
    );
    const { api } = renderExamPage({ data });
    const card = await monthCard('Tháng 10 2026');
    fireEvent.click(within(card).getByRole('button', { name: /Mắt/ }));
    await within(pane()).findByRole('heading', { level: 2, name: 'Mắt' });
    expect(api.detailCalls()[0].path).toBe(
      '/patient/exam-records/CLX%2F9%3F1%232',
    );
    expect(within(pane()).getByRole('link')).toHaveAttribute(
      'href',
      '/benh-nhan/lich-hen-cua-toi/CLX%2F9%3F1%232',
    );
  });
});

describe('doctor-exam F5 — số liệu của máy chủ và nội dung lọt vào danh sách', () => {
  it('WXH-02 số ca của lưới là `demTheoThang` và "N ca" là `total` của máy chủ (không đếm lại từ dòng): tháng 10 có 9 ca trên lưới, 51 ca ở đầu thẻ, 2 dòng đang hiện kèm ghi chú', async () => {
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) => {
        if (!url.pathname.endsWith('/patient/exam-records')) return undefined;
        const params = Object.fromEntries(url.searchParams.entries());
        const body = listBody(data, params) as {
          demTheoThang: Record<string, number>;
          total: number;
        };
        body.demTheoThang['10'] = 9;
        if (params.thang !== undefined) body.total = 51;
        return jsonOk(body);
      },
    });
    const card = await monthCard('Tháng 10 2026');
    expect(monthButton('Tháng 10, 9 ca')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(card).getByText('51 ca')).toBeInTheDocument();
    expect(rowsOf(card)).toHaveLength(2);
    expect(
      within(card).getByText(
        'Hiển thị 2 trên 51 ca. Hãy chọn người khám để thu hẹp.',
      ),
    ).toBeInTheDocument();
  });

  it('XHS-02 phần web: nội dung hồ sơ lọt vào dòng danh sách (trieuChung, hoSoKham…) KHÔNG lên màn hình', async () => {
    const leakedText = 'Bí mật đau thắt ngực';
    const data = figmaData();
    renderExamPage({
      data,
      respond: (url) => {
        if (!url.pathname.endsWith('/patient/exam-records')) return undefined;
        const body = listBody(
          data,
          Object.fromEntries(url.searchParams.entries()),
        ) as {
          items: Record<string, unknown>[];
        };
        body.items = body.items.map((row) => ({
          ...row,
          trieuChung: leakedText,
          chanDoanSoBo: leakedText,
          ghiChuKham: { trieuChung: leakedText },
          hoSoKham: { trieuChung: leakedText },
        }));
        return jsonOk(body);
      },
    });
    await monthCard('Tháng 10 2026');
    expect(document.body.textContent).not.toContain(leakedText);
    expect(
      rowsOf(screen.getByRole('region', { name: 'Tháng 10 2026' })),
    ).toHaveLength(2);
  });
});
