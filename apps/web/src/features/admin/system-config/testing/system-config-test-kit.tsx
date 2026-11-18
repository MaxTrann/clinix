import { fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { AdminMe } from '../../admin-me';
import { AdminMeProvider } from '../../admin-me-context';
import { SystemConfigPage } from '../system-config-page';
import {
  CONFIG_KEYS,
  type ConfigKey,
  type HistoryItem,
  type HistoryPage,
  type SystemConfig,
} from '../system-config-types';

// Dụng cụ chung của test admin F5 (chỉ dùng trong test): dữ liệu mẫu đúng hình dạng API (B5, B6), `fetch` giả ở mức hợp đồng, bộ dựng trang.

export const FULL_CONFIG: SystemConfig = {
  chuaCauHinh: false,
  thoiGianGiuCho: 15,
  thoiDiemNhacLich: [72, 24, 2],
  soLichHenToiDaMoiHoSo: 3,
  soLanTuDoiLichToiDa: 2,
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  thoiHanPhanHoiLoiMoi: 60,
  soMucChoToiDa: 2,
  nguongNoShow: 3,
  soNgayBaoTruocDoiGioLam: 3,
  trongSoW1: 0.6,
  trongSoW2: 0.4,
};

// Chưa có dòng cấu hình: cờ `chuaCauHinh` và MƯỜI HAI giá trị null
export const EMPTY_CONFIG = {
  chuaCauHinh: true,
  ...Object.fromEntries(CONFIG_KEYS.map((key) => [key, null])),
} as SystemConfig;

export function configWith(overrides: Partial<SystemConfig>): SystemConfig {
  return { ...FULL_CONFIG, ...overrides };
}

export function historyItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: '57',
    thoiDiem: '2026-11-18T10:15:03.000Z',
    nguoiThucHien: 'Nguyễn Văn A',
    lyDo: 'Tăng giờ giữ chỗ',
    thayDoi: [{ khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 }],
    ...overrides,
  };
}

export function historyPage(
  items: HistoryItem[],
  overrides: Partial<HistoryPage> = {},
): HistoryPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const apiError = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
): Response =>
  json(
    { maLoi, thongBao: 'câu của API', ...(loi === undefined ? {} : { loi }) },
    status,
  );

export interface RecordedRequest {
  method: string;
  // Đường dẫn bỏ tiền tố `/api`, ví dụ `/admin/system-config`
  path: string;
  query: Record<string, string>;
  body: unknown;
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

/** Thay `fetch` toàn cục: ghi lại mọi lời gọi và trả lời theo `handler`. Gọi `vi.unstubAllGlobals()` ở afterEach. */
export function installFetch(handler: Handler) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost');
      const recorded: RecordedRequest = {
        method: init?.method ?? 'GET',
        path: url.pathname.replace(/^\/api/, ''),
        query: Object.fromEntries(url.searchParams),
        body:
          typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      };
      requests.push(recorded);
      return handler(recorded);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return {
    requests,
    puts: () => requests.filter((request) => request.method === 'PUT'),
    gets: (path: string) =>
      requests.filter(
        (request) => request.method === 'GET' && request.path === path,
      ),
  };
}

// Nhãn của chín ô số nguyên và hai ô trọng số (nhãn ở `system-config-params.ts`); nhắc lịch có ô riêng (`Mốc nhắc lịch n (giờ)`)
export const FIELD_LABEL: Record<
  Exclude<ConfigKey, 'thoiDiemNhacLich'>,
  RegExp
> = {
  thoiGianGiuCho: /Thời hạn giữ chỗ/,
  soLichHenToiDaMoiHoSo: /Lịch hẹn đang hoạt động tối đa mỗi hồ sơ/,
  soLanTuDoiLichToiDa: /Số lần tự đổi lịch tối đa/,
  checkInTruocPhut: /Check-in sớm tối đa/,
  checkInSauPhut: /Check-in muộn tối đa/,
  thoiHanPhanHoiLoiMoi: /Hạn phản hồi lời mời/,
  soMucChoToiDa: /Số mục chờ tối đa/,
  nguongNoShow: /Ngưỡng no-show/,
  soNgayBaoTruocDoiGioLam: /Số ngày báo trước/,
  trongSoW1: /Trọng số đánh giá bác sĩ/,
  trongSoW2: /Trọng số kinh nghiệm và học vị/,
};

export type ScalarKey = keyof typeof FIELD_LABEL;

export const fieldOf = (key: ScalarKey) =>
  screen.getByLabelText(FIELD_LABEL[key]) as HTMLInputElement;

export const typeInto = (key: ScalarKey, value: string) =>
  fireEvent.change(fieldOf(key), { target: { value } });

export const reminderInputs = () =>
  screen.queryAllByLabelText(
    /^Mốc nhắc lịch \d \(giờ\)$/,
  ) as HTMLInputElement[];

export const saveButton = () =>
  screen.getByRole('button', { name: /^(Lưu thay đổi|Tạo cấu hình)/ });

export const openTab = (name: string) =>
  fireEvent.click(screen.getByRole('tab', { name }));

export const CONFIG_PATH = '/admin/system-config';
export const HISTORY_PATH = '/admin/system-config/history';

export function renderConfigPage(
  options: { scope?: AdminMe; path?: string; strict?: boolean } = {},
) {
  const router = createMemoryRouter(
    [
      { path: '/admin/cai-dat-he-thong', element: <SystemConfigPage /> },
      { path: '/admin', element: <p>Trang tổng quan</p> },
    ],
    { initialEntries: [options.path ?? '/admin/cai-dat-he-thong'] },
  );
  const page = (
    <AdminMeProvider value={options.scope ?? { phamVi: 'ToanHeThong' }}>
      <RouterProvider router={router} />
    </AdminMeProvider>
  );
  // `strict`: như `main.tsx` ở chế độ dev, mọi effect chạy hai lần (mount, huỷ, mount lại)
  const view = render(options.strict ? <StrictMode>{page}</StrictMode> : page);
  return { router, ...view };
}
