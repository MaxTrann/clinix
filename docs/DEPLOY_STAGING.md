# Triển khai môi trường staging

Dựng lần đầu ngày 26/11/2026. Địa chỉ: `https://clinix-staging.duckdns.org`. Chỉ chứa **dữ liệu mẫu**.
Tài liệu này **không** ghi mật khẩu, khoá hay địa chỉ IP: các giá trị đó chỉ nằm trên máy chủ, trong GitHub Secrets và ở ghi chú riêng của nhóm.

## 1. Kiến trúc

```
Triển khai:  merge Pull Request vào main
             → workflow CD (GitHub Actions) build image api và web
             → đẩy lên GHCR, gắn thẻ 12 ký tự đầu của commit và "latest"
             → SSH vào máy chủ: chép file cấu hình, docker compose pull, up -d
             → gọi /api/health để xác nhận

Người dùng:  trình duyệt → https://<tên miền> → caddy (HTTPS)
             → web (nginx: file tĩnh, proxy /api) → api (NestJS) → db (MySQL 8.4)
```

| Thành phần | Giá trị đang dùng |
|---|---|
| Máy chủ | Azure for Students, Southeast Asia, Ubuntu Server 24.04 x64, `Standard_B2als_v2` (2 vCPU, 4 GB), thêm 2 GB swap |
| Cổng mở từ Internet | 22 (SSH bằng khoá), 80, 443. Cổng của API và MySQL không mở |
| Tên miền | DuckDNS `clinix-staging.duckdns.org` trỏ về IP công khai cố định của máy chủ |
| HTTPS | Caddy tự xin và tự gia hạn chứng chỉ Let's Encrypt |
| Thư mục trên máy chủ | `/home/clinix/clinix` |

## 2. File trên máy chủ

| File | Nguồn | Ghi chú |
|---|---|---|
| `docker-compose.yml` | CD chép từ `docker-compose.staging.yml` | Đừng sửa trên máy chủ: lần triển khai sau ghi đè |
| `docker-compose.override.yml`, `Caddyfile`, `00-realip.conf` | CD chép từ `deploy/staging/` | Như trên |
| `.env` | **Viết tay trên máy chủ**, quyền `600` | Không nằm trong Git. CD chỉ ghi lại hai dòng `TAG` và `GHCR_OWNER` |

Vì sao cần `00-realip.conf`: API đứng sau hai lớp proxy (caddy rồi nginx) và chỉ tin một lớp (`trust proxy = 1`). Không có file này thì API thấy mọi người dùng chung IP của caddy, làm giới hạn OTP và khoá đăng nhập theo IP chặn nhầm.

## 3. Dựng máy chủ lần đầu

1. **Tạo máy ảo** với người dùng `clinix`, đăng nhập bằng khoá SSH, cho phép cổng 22, 80, 443. Gói Azure for Students giới hạn vùng: xem Policy → Assignments → *Allowed resource deployment regions*.
2. **Swap và Docker** (chạy trên máy chủ):

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker clinix        # đăng xuất rồi đăng nhập lại
   docker compose version                # cần 2.24.4 trở lên
   ```

3. **Tên miền:** tạo tên ở DuckDNS, đặt IP của máy chủ. Token DuckDNS là bí mật. Dùng tên khác thì đặt `STAGING_DOMAIN=<tên miền>` trong `.env` và sửa `WEB_ORIGIN`, địa chỉ VNPAY, biến `STAGING_API_URL`.
4. **Thư mục và `.env`:** `mkdir -p ~/clinix`, viết `.env` theo mục 4, `chmod 600 .env`.
5. **Khoá triển khai:** tạo một cặp khoá riêng cho GitHub Actions, **không đặt passphrase**, thêm khoá công khai vào `~/.ssh/authorized_keys` của máy chủ. Thu hồi bằng cách xoá đúng dòng đó.
6. **Cấu hình GitHub** (mục 5), rồi chạy workflow CD lần đầu: Actions → CD → *Run workflow*, nhánh `main`, ô `tag` để trống.

## 4. Biến trong `.env` của máy chủ

Danh sách đầy đủ và chú thích ở `.env.example`. Giá trị khác máy dev:

| Biến | Giá trị trên staging |
|---|---|
| `NODE_ENV` | `staging` |
| `TZ`, `DB_TIMEZONE` | `Asia/Ho_Chi_Minh`, `+07:00` |
| `DB_HOST`, `DB_PORT` | `db`, `3306` |
| `DB_MIGRATIONS_RUN` | `true` (API tự chạy migration khi khởi động) |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | sinh ngẫu nhiên trên máy chủ (`openssl rand -hex 24`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_HMAC_SECRET`, `JWT_RESET_SECRET` | mỗi biến một giá trị khác nhau (`openssl rand -hex 32`) |
| `COOKIE_SECURE`, `WEB_ORIGIN` | `true`, `https://<tên miền>` (không có dấu `/` ở cuối) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | **bắt buộc**; Gmail với mật khẩu ứng dụng riêng cho staging, viết liền 16 ký tự |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | **bắt buộc** |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAY_URL`, `VNPAY_RETURN_URL` | đủ cả bốn thì cổng nạp ví mới hiện (mục 7) |
| `GHCR_OWNER`, `TAG` | CD tự ghi |

`CHAT_FILES_DIR` không cần điền: file compose đặt sẵn.

**Thêm biến bắt buộc mới trong mã:** báo người giữ máy chủ **trước khi merge** để thêm vào `.env`; thiếu biến thì API không khởi động. Sửa `.env` xong chạy `docker compose up -d`.

## 5. Cấu hình GitHub

| Loại | Tên | Nơi đặt | Nội dung |
|---|---|---|---|
| Secret | `STAGING_SSH_KEY` | environment `staging` | khoá riêng của cặp khoá triển khai |
| Variable | `STAGING_HOST` | repository | IP hoặc tên máy chủ |
| Variable | `STAGING_USER` | repository | `clinix` |
| Variable | `STAGING_PATH` | repository | `/home/clinix/clinix` |
| Variable | `STAGING_API_URL` | repository | `https://<tên miền>/api` |

`STAGING_HOST` đặt ở cấp repository vì điều kiện chạy của job triển khai đọc nó trước khi vào environment. Chưa có biến này thì job bị bỏ qua; có rồi thì **mỗi lần merge vào `main` đều triển khai**.

## 6. Vận hành

- **Triển khai tự động:** khoảng 4 đến 5 phút từ lúc merge (lần đầu ngày 26/11/2026: build 2 phút 11 giây, triển khai 2 phút 01 giây). Trong lúc khởi động lại web gián đoạn ngắn: tránh merge khi đang cho người dùng thử.
- **Migration:** chạy tự động trên dữ liệu staging. Migration xoá hay đổi kiểu dữ liệu phải nêu rõ trong Pull Request.
- **Quay lại bản cũ (rollback):** Actions → CD → *Run workflow*, nhập `tag` = 12 ký tự đầu của commit muốn quay lại. Rollback **chỉ đổi image**: migration đã chạy không tự hoàn tác, và file cấu hình lấy từ `main` hiện tại.
- **Kiểm tra trên máy chủ:**

  ```bash
  cd ~/clinix
  docker compose ps                    # db, api, web: healthy; caddy: Up
  docker compose logs api --tail 50    # log đã che bí mật; vẫn che email trước khi gửi đi
  curl -fsS https://<tên miền>/api/health
  df -h /
  ```

- **Đĩa và log:** CD dọn image không dùng cũ hơn 7 ngày sau mỗi lần triển khai; log mỗi container tối đa 3 tệp 10 MB.
- **Quản trị viên đầu tiên** (chỉ chạy được khi chưa có Quản trị viên toàn hệ thống):

  ```bash
  read -rp "Email: " AE; read -rp "Ho ten: " AN; read -rp "So dien thoai: " AP; read -rsp "Mat khau: " APW; echo
  docker compose exec -T -e SEED_ADMIN_EMAIL="$AE" -e SEED_ADMIN_FULL_NAME="$AN" -e SEED_ADMIN_PHONE="$AP" \
    -e SEED_ADMIN_PASSWORD="$APW" api node dist/database/seeds/seed.js first-admin </dev/null
  ```

  Chạy từng dòng. Dán cả khối một lần thì `read` nuốt các dòng sau: khi đó ghi thành một file `.sh` rồi chạy.

- **Dữ liệu mẫu** (chỉ thêm, không xoá; `DEV_SETUP.md` mục seed): chạy theo thứ tự `catalog`, `config-dev`, `dev-accounts`, `search-demo`, `doctor-demo`, `payment-demo` bằng `docker compose exec -T -e SEED_DEV_PASSWORD="$P" api node dist/database/seeds/seed.js <tên> </dev/null`. Tài khoản demo dùng chung một mật khẩu và có cả Quản trị viên toàn hệ thống, web lại công khai: **đặt mật khẩu mạnh**.

## 7. Cổng nạp ví VNPAY (sandbox)

1. Đăng ký **một mã website riêng cho staging** tại `https://sandbox.vnpayment.vn/devreg/`: tên, địa chỉ website, email, **IPN URL** = `https://<tên miền>/api/payment/ipn/vnpay` (có `/api` vì đi qua nginx; máy dev dùng tunnel thì không có).
2. Trong `.env`: `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET` lấy từ thư; `VNPAY_PAY_URL` = đúng URL TEST ghi trong thư (mã đăng ký từ 11/2026: `https://sandbox.vnpaytest.vn/paymentv2/vpcpay.html`); `VNPAY_RETURN_URL` = `https://<tên miền>/benh-nhan/vi-cua-toi/ket-qua-nap`.
3. Web chỉ chuyển trang tới host trong `ALLOWED_REDIRECT_HOSTS` (`apps/web/src/features/payment/topup/topup-form.ts`).
4. Ví chỉ được cộng khi API nhận IPN; trang kết quả không tự cộng.

MoMo để trống (phần tùy chọn).

## 8. Sự cố thường gặp

| Hiện tượng | Kiểm gì |
|---|---|
| Job triển khai bị bỏ qua | biến `STAGING_HOST` ở cấp repository |
| Bước SSH lỗi | secret `STAGING_SSH_KEY` (khoá không passphrase, xuống dòng LF), `authorized_keys`, máy chủ có đang bật |
| Health check thất bại | `docker compose ps`, `docker compose logs api`: thường thiếu biến trong `.env` hoặc migration lỗi |
| Không có HTTPS | `docker compose logs caddy`; tên miền có trỏ đúng IP; cổng 80 và 443 có mở |
| Không thấy thư OTP | kiểm thư rác |
| Không thấy cổng nạp ví | đủ bốn biến `VNPAY_*`, đã `docker compose up -d` |

## 9. Chi phí và giới hạn đã biết

- Chi phí tính theo giờ máy bật, không theo số lần triển khai: máy, đĩa và IP ước khoảng 40 USD một tháng, trừ vào tín dụng sinh viên. Hết việc thì **Stop (deallocate)** máy hoặc xoá cả resource group (mất toàn bộ dữ liệu).
- GitHub Actions miễn phí với repo công khai; GHCR theo tài liệu GitHub hiện chưa tính phí.
- Một máy duy nhất; **chưa sao lưu** volume `db-data` và `chat-files`; chưa giám sát; tên miền miễn phí; cổng SSH mở cho mọi địa chỉ, chỉ vào được bằng khoá.
