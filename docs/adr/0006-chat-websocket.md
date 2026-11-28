# ADR — Nhắn tin tức thời qua WebSocket (socket.io)

Status: Accepted  
Date: 2026-11-27  
Scope: chat P4, issue #709; consumer chat B5 (#715), F2 (#718)

## Bối cảnh

Đại chọn **WebSocket** cho nhắn tin (Q2, khác đề xuất ban đầu là thăm dò) và cho **gửi lẫn nhận** tin qua socket (Q8). Chuông thông báo của repo vẫn thăm dò 30 giây, nên repo có hai cơ chế tức thời. Hai điểm cần quyết riêng là chọn thư viện và cách xác thực. Guard HTTP (`JwtAuthGuard` đọc header `Authorization`) không áp cho lúc bắt tay socket (rủi ro R2 của PLAN chat).

## Quyết định

- **Thư viện** (T1, phiên bản tra từ npm registry lúc làm P4):
  - API: `@nestjs/websockets` 12.6.3 và `@nestjs/platform-socket.io` 12.6.3 (kéo theo `socket.io` 4.8.4), dùng `IoAdapter` mặc định của Nest, chung cổng HTTP.
  - Test của API: `socket.io-client` 4.8.4 (devDependency). Web thêm `socket.io-client` 4.8.4 ở F2.
- **Đường và vận chuyển:** trình duyệt nối `/api/socket.io/`, proxy bỏ `/api`, API phục vụ ở `/socket.io`.
  - Chỉ dùng `transports: ['websocket']`, không long-polling.
  - `serveClient: false`; `cors: false` (WebSocket không theo CORS, nguồn hợp lệ kiểm bằng `Origin`).
  - Gói tối đa 64 KB.
- **Bắt tay** (`chat/realtime/chat-socket-auth.ts`). Dùng lại đúng hai bước của guard, không sửa mã auth:
  - Kiểm theo thứ tự:
    1. `Origin` phải đúng `WEB_ORIGIN`.
    2. Token có trong gói xác thực của giao thức (`auth.token`). Token ở query hay URL **bị bỏ qua**, vì URL lọt vào log proxy và lịch sử trình duyệt.
    3. Chữ ký token (`TokenService.verifyAccessToken`).
    4. Phiên còn hiệu lực (`SessionService.resolveActive`).
    5. Vai trò là Bệnh nhân, Bác sĩ hay Lễ tân. Quản trị viên bị từ chối.
    6. Tối đa 5 kết nối mỗi tài khoản.
  - Bị từ chối thì client nhận `connect_error` với `err.message` bằng `err.data.maLoi`:
    - `CHUA_DANG_NHAP`, `TOKEN_KHONG_HOP_LE`, `PHIEN_HET_HIEU_LUC`: dùng lại mã của auth, để web xử lý như 401 của REST.
    - `KHONG_DU_QUYEN`: sai vai trò.
    - `CHAT_NGUON_KHONG_HOP_LE`, `CHAT_QUA_NHIEU_KET_NOI`: mã mới, `[đề xuất]`.
  - Log chỉ có mã và tên lớp lỗi, không bao giờ có token.
- **Sổ kết nối trong bộ nhớ** (`ChatConnectionRegistry`): giữ chỗ **đồng bộ**, ngay sau lần `await` cuối của phép kiểm. Nhờ vậy sáu lần bắt tay đồng thời của một tài khoản chỉ có năm lần qua. Kết nối đóng thì nhả chỗ. B5 dùng sổ này để tìm người nhận.
- **Vòng đời:** máy chủ hẹn ngắt kết nối đúng lúc access token hết hạn (`exp` đọc sau khi đã kiểm chữ ký). Web làm mới token rồi nối lại. Kiểm phiên ở mỗi sự kiện và quét phiên mỗi 60 giây thuộc B5.
- **Proxy:**
  - `apps/web/nginx.conf` thêm `location ^~ /api/socket.io/`, đặt trước `/api/` vì tiền tố dài hơn. Location này có `proxy_http_version 1.1`, `Upgrade $http_upgrade`, `Connection "upgrade"` và timeout đọc, gửi 3600 giây `[đề xuất]` (lớn hơn nhiều nhịp ping 25 giây của socket.io).
  - Location `/api/` giữ nguyên (`Connection ""`, 60 giây).
  - `apps/web/vite.config.ts` thêm khoá `'/api/socket.io/'` có `ws: true`, đặt trước khoá `'/api/'`.

## Phương án đã cân nhắc

- **`ws` thuần:** nhẹ hơn, nhưng phải tự viết nối lại, ack, phân phòng, nhịp ping. Mỗi việc đó là chỗ dễ sai.
- **Thăm dò (đề xuất ban đầu):** đơn giản, cùng nếp với chuông thông báo, nhưng trễ tới 15 đến 30 giây. Đại đã chọn WebSocket (Q2).
- **Server-Sent Events:** chỉ một chiều máy chủ tới client, không đáp ứng Q8 (gửi qua socket).

## Đánh đổi và hệ quả

- **Sổ kết nối nằm trong bộ nhớ:** chỉ chạy đúng với **một tiến trình API**. Muốn nhiều tiến trình thì cần adapter dùng chung (ví dụ Redis) và sổ dùng chung. Nợ kỹ thuật đã ghi ở `docs/TECH_DEBT.md` dòng 324 khi B5 merge (kiểm lại ở chat D1, 28/11/2026).
- **Hai cơ chế tức thời** cùng tồn tại: chuông thăm dò 30 giây, chat dùng WebSocket.
- **Guard, pipe, bộ lọc lỗi toàn cục của HTTP** không bảo vệ sự kiện socket. Gateway tự xác thực và B5 tự kiểm DTO, tự đổi lỗi thành mã. P4 chưa có handler `@SubscribeMessage` nào nên **chưa kiểm** guard toàn cục (`APP_GUARD` `JwtAuthGuard`, đọc header HTTP) có chạy ở handler socket hay không. B5 phải kiểm điểm này và chứng minh bằng ca SOC, X1 M9 (R2).
  - **Kết quả kiểm ở chat B5 (27/11/2026):** guard toàn cục **có** chạy ở handler `@SubscribeMessage` (Nest áp `APP_GUARD` cho gateway) và chặn sự kiện vì không có header `Authorization` (thử bỏ `@Public()` khỏi handler `chat:gui`: client không nhận được ack, ca SOC-05 hết giờ). Nên handler đặt `@Public()` và tự kiểm phiên của chính kết nối ở đầu handler (`ChatSocketSessions.check`: phiên còn hiệu lực, vai trò không đổi). Dữ liệu vào không qua ValidationPipe: gói được đọc bằng `parseSendPayload` (chặn trường lạ), luật nội dung do lõi gửi kiểm.
- Kết nối giữ lâu qua nginx (3600 giây) chiếm một kết nối mở mỗi tab. Giới hạn 5 kết nối mỗi tài khoản chặn trường hợp mở quá nhiều.

## Xác minh

Ở P4:
- **Unit:** xác thực bắt tay và sổ kết nối.
- **E2e trên `AppModule` thật** bằng `socket.io-client`: SOC-01 (ba vai trò nối được; thiếu token, token sai, token hết hạn, phiên đã thu hồi, Quản trị viên bị từ chối kèm mã), SOC-02 (token ở query bị bỏ qua, log không chứa token), SOC-03, SOC-04 (sáu lần bắt tay đồng thời thì đúng năm lần qua), SOC-11 (token hết hạn thì máy chủ ngắt). REST trên cùng cổng không đổi.
- **Đột biến 19** (nhận token ở query) bị SOC-02 bắt.
- **SOC-16 chạy tay:** ảnh `prod` của API và `apps/web` trên mạng Docker tạm, API trỏ DB test `clinix_test`, không đụng DB `clinix`.
  - Qua nginx: nâng cấp **101**; socket.io-client tới được gateway (bị từ chối đúng mã).
  - Đối chứng: `nginx.conf` của `main` trả **400**.
  - Qua Vite proxy: cũng **101**.
  - REST `/api/` không đổi ở cả hai đường.
- **Chưa đo ở P4:** giữ kết nối rảnh 5 phút (X1 M10), 200 kết nối và đẩy tin (X1 M9, B5).
