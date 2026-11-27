import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  apiError,
  cleanUpFakeChatApi,
  installFakeChatApi,
  message,
} from '../testing/fake-chat-api';
import { ChatWorkspace } from './chat-workspace';

// chat F6 — đính kèm ảnh, PDF trong khung chat (PLAN chat 5.8, 5.14; Q1, Q6, Q22): WCH-14 (chọn, chặn sớm loại và cỡ, xem trước, gửi `multipart`, ảnh object URL được
// thu hồi, PDF tải xuống, lỗi giữ tệp) và đột biến web bốn loại của phần tệp (WCH-17): (1) kho trình duyệt, (2) bấm đúp, (3) tính ở client (hiện tệp theo tên,
// loại ở máy thay vì của máy chủ), (4) chặn theo trạng thái (lỗi tệp của máy chủ làm khoá luôn việc đính kèm). API giả, đồng hồ giả, `URL.createObjectURL` giả.
// Mã ca CAT-nn là [đề xuất].
const PATH = '/benh-nhan/tin-nhan';

let api: ReturnType<typeof installFakeChatApi>;
let created: string[];
let revoked: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-27T03:00:00.000Z'));
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'visible',
  });
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  localStorage.clear();
  sessionStorage.clear();
  created = [];
  revoked = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:test/${created.length + 1}`;
    created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
    revoked.push(url);
  });
  api = installFakeChatApi();
});

afterEach(() => {
  vi.useRealTimers();
  cleanUpFakeChatApi();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'onLine');
});

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function renderChat(path = `${PATH}?hoiThoai=1`) {
  const router = createMemoryRouter(
    [
      {
        path: '/benh-nhan/tin-nhan',
        element: <ChatWorkspace role="BenhNhan" />,
      },
    ],
    { initialEntries: [path] },
  );
  const view = render(<RouterProvider router={router} />);
  await flush();
  return view;
}

const png = (name = 'anh.png') =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
const pdf = (name = 'ket-qua.pdf') =>
  new File(['%PDF-1.4 ... %%EOF'], name, { type: 'application/pdf' });

function pick(file: File) {
  fireEvent.change(screen.getByLabelText('Chọn tệp đính kèm'), {
    target: { files: [file] },
  });
}
const composer = () => screen.getByLabelText('Nội dung tin nhắn');
const sendButton = () => screen.getByRole('button', { name: 'Gửi' });
const posts = (id = '1') =>
  api.callsTo('POST', `/chat/conversations/${id}/messages`);
type MultipartBody = {
  noiDung: unknown;
  maGui: unknown;
  file: unknown;
  multipart?: boolean;
};
const lastBody = () => posts().at(-1)?.body as MultipartBody;
const thread = () => screen.getByRole('list', { name: 'Tin nhắn' });

describe('chat F6 — chọn và xem trước (WCH-14)', () => {
  it('WCH-14 CAT-01 chọn ảnh ⇒ xem trước bằng object URL; "Bỏ tệp" gỡ xem trước và THU HỒI URL', async () => {
    api.seed('1');
    await renderChat();
    pick(png());
    const preview = screen.getByRole('img', { name: 'Ảnh sắp gửi: anh.png' });
    expect(preview).toHaveAttribute('src', 'blob:test/1');
    expect(screen.getByText(/anh\.png/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ tệp anh.png' }));
    await flush();
    expect(screen.queryByRole('img', { name: /Ảnh sắp gửi/ })).toBeNull();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('WCH-14 CAT-02 (âm) chặn sớm: sai loại ⇒ câu loại tệp; quá 10 MB ⇒ "Tệp tối đa 10 MB."; không xem trước, không gửi', async () => {
    api.seed('1');
    await renderChat();
    pick(new File(['GIF89a'], 'dong.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF.',
    );
    const big = pdf('lon.pdf');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    pick(big);
    expect(screen.getByRole('alert')).toHaveTextContent('Tệp tối đa 10 MB.');
    expect(screen.queryByText('lon.pdf')).toBeNull();
    expect(sendButton()).toBeDisabled();
    const exact = pdf('vua.pdf');
    Object.defineProperty(exact, 'size', { value: 10 * 1024 * 1024 });
    pick(exact);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/vua\.pdf/)).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });
});

describe('chat F6 — gửi `multipart` (WCH-14)', () => {
  it('WCH-14 CAT-03 chỉ có tệp (không chữ) ⇒ POST `multipart` (`file`, `noiDung` rỗng, `maGui`); xong thì khung hiện ảnh tải bằng lớp client', async () => {
    api.seed('1');
    await renderChat();
    pick(png());
    expect(sendButton()).toBeEnabled();
    fireEvent.click(sendButton());
    await flush();
    await flush();
    expect(posts()).toHaveLength(1);
    const body = lastBody();
    expect(body.multipart).toBe(true);
    expect(body.noiDung).toBe('');
    expect(body.maGui).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.file).toBeInstanceOf(File);
    expect((body.file as File).name).toBe('anh.png');
    const sentId = api.threads.get('1')!.at(-1)!.id;
    expect(
      api.callsTo('GET', `/chat/messages/${sentId}/attachment`),
    ).toHaveLength(1);
    expect(
      within(thread()).getByRole('img', { name: 'anh.png' }),
    ).toHaveAttribute('src', expect.stringMatching(/^blob:test\//));
    expect(screen.queryByRole('img', { name: /Ảnh sắp gửi/ })).toBeNull();
  });

  it('WCH-14 CAT-04 (đột biến "tính ở client") tệp đã gửi hiện theo tên, loại của MÁY CHỦ; PDF có nút tải xuống bằng liên kết `download`, URL thu hồi ngay', async () => {
    api.seed('1');
    api.fileState.serverName = 'tep-dinh-kem.pdf';
    await renderChat();
    pick(pdf('ket qua/../x.pdf'));
    fireEvent.change(composer(), { target: { value: 'Kết quả xét nghiệm' } });
    fireEvent.click(sendButton());
    await flush();
    await flush();
    const bubble = within(thread())
      .getByText('Kết quả xét nghiệm')
      .closest('li')!;
    expect(bubble).toHaveTextContent('tep-dinh-kem.pdf');
    expect(bubble).not.toHaveTextContent('ket qua');
    const clicks: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download });
    });
    fireEvent.click(
      within(bubble).getByRole('button', {
        name: 'Tải xuống tep-dinh-kem.pdf',
      }),
    );
    await flush();
    expect(clicks).toEqual([
      { href: created.at(-1), download: 'tep-dinh-kem.pdf' },
    ]);
    expect(revoked).toContain(created.at(-1));
    expect(document.querySelector('iframe, embed, object')).toBeNull();
  });

  it('WCH-14 CAT-05 lỗi mạng ⇒ giữ CẢ chữ và tệp ở bong bóng; "Gửi lại" gửi lại đúng tệp đó với CÙNG `maGui`', async () => {
    api.seed('1');
    await renderChat();
    api.replyNext('POST /chat/conversations/1/messages', { network: true });
    pick(png('xet-nghiem.png'));
    fireEvent.change(composer(), { target: { value: 'Ảnh kết quả' } });
    fireEvent.click(sendButton());
    await flush();
    expect(
      screen.getByText('Tệp đính kèm: xet-nghiem.png'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ảnh kết quả')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi lại' }));
    await flush();
    const [first, second] = posts().map((call) => call.body as MultipartBody);
    expect(second!.maGui).toBe(first!.maGui);
    expect((second!.file as File).name).toBe('xet-nghiem.png');
    expect(screen.queryByText('Tệp đính kèm: xet-nghiem.png')).toBeNull();
  });

  it('WCH-14 CAT-06 (đột biến "bấm đúp") bấm Gửi hai lần hay "Gửi lại" hai lần khi đang tải lên ⇒ MỘT yêu cầu', async () => {
    api.seed('1');
    await renderChat();
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(503, 'CHAT_TAI_TEP_DANG_BAN'),
    );
    pick(pdf());
    fireEvent.click(sendButton());
    fireEvent.click(sendButton());
    fireEvent.keyDown(composer(), { key: 'Enter' });
    await flush();
    expect(posts()).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hệ thống đang bận nhận tệp. Thử lại sau ít phút.',
    );
    api.replyNext('POST /chat/conversations/1/messages', { hold: true });
    const resend = screen.getByRole('button', { name: 'Gửi lại' });
    // Hai lần bấm trong CÙNG một lượt (trước khi React vẽ lại, nút vẫn còn): chỉ chốt "mã đang bay" chặn được lần thứ hai
    act(() => {
      resend.click();
      resend.click();
    });
    await flush();
    expect(posts()).toHaveLength(2);
  });

  it('WCH-14 CAT-07 (đột biến "chặn theo trạng thái") máy chủ từ chối tệp (413, 400) ⇒ câu theo `maLoi`; vẫn chọn tệp khác và gửi được', async () => {
    api.seed('1');
    await renderChat();
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(413, 'CHAT_TEP_QUA_LON'),
    );
    api.replyNext(
      'POST /chat/conversations/1/messages',
      apiError(400, 'CHAT_TEP_KHONG_HOP_LE'),
    );
    pick(png('a.png'));
    fireEvent.click(sendButton());
    await flush();
    pick(png('b.png'));
    fireEvent.click(sendButton());
    await flush();
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent);
    expect(alerts.some((text) => text?.includes('Tệp tối đa 10 MB.'))).toBe(
      true,
    );
    expect(
      alerts.some((text) =>
        text?.includes('Chỉ gửi được ảnh JPEG, PNG, WebP hoặc tệp PDF.'),
      ),
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Đính kèm ảnh hoặc PDF' }),
    ).toBeEnabled();
    pick(pdf('c.pdf'));
    fireEvent.click(sendButton());
    await flush();
    await flush();
    expect(posts()).toHaveLength(3);
    expect(within(thread()).getByText(/c\.pdf/)).toBeInTheDocument();
  });

  it('WCH-14 CAT-08 (đột biến "kho trình duyệt") chọn, gửi, xem tệp không ghi gì vào `localStorage`, `sessionStorage`', async () => {
    api.seed('1');
    await renderChat();
    pick(png());
    fireEvent.change(composer(), { target: { value: 'Có ảnh' } });
    fireEvent.click(sendButton());
    await flush();
    await flush();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('chat F6 — hiện tệp đã có (WCH-14)', () => {
  it('WCH-14 CAT-09 ảnh của tin cũ tải bằng lớp client; lỗi ⇒ "Chưa tải được ảnh." và "Thử lại"; gỡ khung ⇒ THU HỒI object URL', async () => {
    api.seed('1', {
      messages: [
        message({
          id: '300',
          noiDung: '',
          tep: { ten: 'phim.png', loai: 'image/png', dungLuong: 2048 },
        }),
      ],
    });
    api.files.set('300', new Blob(['x'], { type: 'image/png' }));
    api.replyNext(
      'GET /chat/messages/300/attachment',
      apiError(503, 'HE_THONG_DANG_BAN'),
    );
    const view = await renderChat();
    expect(
      within(thread()).getByText(/Chưa tải được ảnh\./),
    ).toBeInTheDocument();
    fireEvent.click(within(thread()).getByRole('button', { name: 'Thử lại' }));
    await flush();
    const image = within(thread()).getByRole('img', { name: 'phim.png' });
    const url = image.getAttribute('src');
    expect(url).toMatch(/^blob:test\//);
    view.unmount();
    expect(revoked).toContain(url);
  });

  it('WCH-14 CAT-10 PDF cũ: tên và dung lượng của máy chủ, nút tải xuống; tải lỗi ⇒ câu lỗi, bấm lại được', async () => {
    api.seed('1', {
      messages: [
        message({
          id: '301',
          noiDung: '',
          tep: {
            ten: 'don-thuoc.pdf',
            loai: 'application/pdf',
            dungLuong: 1536 * 1024,
          },
        }),
      ],
    });
    api.replyNext('GET /chat/messages/301/attachment', { network: true });
    await renderChat();
    expect(within(thread()).getByText(/don-thuoc\.pdf/)).toBeInTheDocument();
    expect(within(thread()).getByText(/1,5 MB/)).toBeInTheDocument();
    const download = within(thread()).getByRole('button', {
      name: 'Tải xuống don-thuoc.pdf',
    });
    fireEvent.click(download);
    await flush();
    expect(within(thread()).getByRole('alert')).toHaveTextContent(
      'Chưa tải được tệp. Thử lại sau.',
    );
    expect(download).toBeEnabled();
  });
});

describe('chat F6 — tin đầu có tệp (WCH-14, chat F4)', () => {
  it('WCH-14 CAT-11 khung trước tin đầu gửi tệp bằng `multipart` tới route tìm-hoặc-tạo của bác sĩ', async () => {
    api.seedDoctorStart('7');
    await renderChat(`${PATH}?bacSi=7`);
    pick(pdf());
    fireEvent.click(sendButton());
    await flush();
    await flush();
    const call = api.callsTo('POST', '/chat/doctors/7/messages')[0]!;
    expect((call.body as MultipartBody).multipart).toBe(true);
    expect(((call.body as MultipartBody).file as File).name).toBe(
      'ket-qua.pdf',
    );
  });
});
