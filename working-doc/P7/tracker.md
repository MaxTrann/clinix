# P7 — Tracker triển khai Cloudinary

Overall: done (backend local + live Cloudinary verified); B1/F2 UI acceptance pending  
Updated: 2026-10-28

Người dùng đã duyệt phương án tổng hợp, thông số kỹ thuật và yêu cầu triển khai. P7 backend hoàn tất local; B1/F2/Cloudinary thật/UI acceptance và PR/CI được theo dõi riêng, không suy ra từ local pass.

## Tasks

| ID | Outcome | Status | Evidence/result |
|---|---|---|---|
| T1 | Chốt thiết kế/nháp issue và thông số | done | plan.md mục 3a–3f; ADR Accepted; chưa đăng issue GitHub |
| T2 | Processor/adapter/config/dependency | done locally | Sharp 0.35.5, cloudinary 2.11.0; input10 MB/25 MP, output2 MB, quality85/80, resize khi cần, EXIF/metadata/alpha; native Windows/Linux pass |
| T3 | Ledger/FK/migration và assign/cleanup | done locally | migration1793188800000, ba file schema, MySQL7/7; 24 giờ/dọn mỗi giờ/50 ảnh, lease5 phút/5 lỗi, không network trong transaction |
| T4 | Endpoint và quyền | done locally | JWT/role guard thật + scope DB ToanHeThong trước multipart; HTTP multipart/413/403/503/capacity tests; C1 chung chưa triển khai, không dùng stub |
| T5 | Tài liệu/review/kiểm chứng | done locally | DEV_SETUP, TECH_DEBT, env mẫu, Admin PLAN/TRACKING và nháp issue; lint/type/build/Docker/unit/int pass |
| T6a | Cloudinary thật — upload/delivery/ledger/cleanup | VERIFIED | Live smoke mới nhất pass; 3 mẫu, đọc lại cloud sau xóa, ledger0, không còn asset test |
| T6b | B1/F2 và manual acceptance trên UI | pending | Chưa kiểm browser/độ nét UI; F2 timeout60 giây chỉ là handoff |
| T7 | AI_USAGE_LOG/commit/push/PR/7 CI check | pending, thành viên thực hiện | Không sửa AI_USAGE_LOG.md khi chưa được phép; không thực hiện thao tác Git xuất bản |

## Verification log (2026-10-28)

| Command/check | Result |
|---|---|
| npm test (apps/api) | 47 file, 863/863 pass; EXIF1–8, PNG text metadata riêng tư, alpha, ảnh lớn thực đi nhánh resize, WebP động, provider deadline/fake, HTTP/auth/capacity và cleanup |
| npm run test:p7 (TEST_DB_PORT=33307) | 7/7 pass trên MySQL8.4 mới; CREATE DB timestamp và DB tham chiếu riêng, không reset DB hiện có. Kiểm scope DB, assign/rollback/concurrency, retry5, FK/CHECK, SHOW CREATE TABLE. Regression gỡ URL legacy bằng null pass |
| npm exec -- tsc --noEmit | Pass, gồm test types; đã sửa overload SDK thiếu agent/timeout trong declaration bằng options typed phù hợp, không dùng any |
| npm run lint | Pass, 0 warning/chẩn đoán |
| npm run build / Docker prod build | Pass; Docker Node22 Alpine cài npm ci/Sharp native đúng nền tảng |
| Docker Sharp smoke | Pass: Linux Node22, PNG80x40 giữ alpha, output228 byte; không credential/network provider |
| jscpd Linux với config CI | 131 file, 0,91% trùng (<3%), không clone trong module upload. Windows trả0 nhưng không phân tích file nên không dùng làm evidence |
| Gitleaks8.30.1 source API và test | Pass, không leak. Scan rộng báo2 finding chỉ ở .env local có sẵn; report đã redact100%, chỉ đọc metadata finding; không in/đổi secret. Không ghi scan này thành CI pass |
| git diff --check / scope review | Pass; không stage/commit/push, không sửa source web, không áp dụng migration DB dev/chia sẻ |

## Giới hạn và handoff

- Cloudinary thật/chất lượng ảnh qua F2 chưa nghiệm thu; mẫu kỹ thuật không thay cho đánh giá ảnh thật ở UI. Có thể trả lỗi422 nếu không đạt output2 MB trong policy hoặc hết15 giây xử lý; không tự hạ chất lượng dưới80.
- Upload kết quả chưa rõ được giữ ledger chưa xác nhận/ma_loi_cuoi=UPLOAD_CAN_KIEM_TRA, không cho gắn/không tự retry. Xóa lỗi5 lần giữ để kiểm tra thủ công; ghi TECH_DEBT.
- B1 gọi assignSpecialty bằng cùng manager giao dịch và kiểm quyền của B1; bỏ trường=giữ/null=gỡ/UUID=gắn, JOIN URL mới/fallback cũ. Chưa thêm controller chuyên khoa hay UI F2.
- Chưa chạy standard test:int/test:e2e trên DB người dùng vì setup reset. MySQL test là container mới clinix-p7-mysql-20261028, không dùng volume cũ; dừng container test sau khi kiểm chứng. DB dev/chia sẻ không thay đổi.
- Local Node24.13 có cảnh báo engine từ Nest tooling đã có sẵn; build/type/tests vẫn pass. Docker Node22.23.4 build/native pass; không tự nâng dependency ngoài scope.
- Lần cài đầu bị chạy nhầm ở workspace cha; ba artifact mới đã được kiểm nội dung/thời điểm và chuyển nguyên vẹn sang C:/Users/Admin/AppData/Local/Temp/codex-p7-misplaced-install-20261028-1532, không xóa/ghi đè tệp có sẵn. Cài đúng trong apps/api đã hoàn tất.
- Tên migration mới lớn hơn registry hiện tại. Down chặn khi ledger có dữ liệu; không tự drop/backfill tài nguyên thật.


## Live smoke sau khi người dùng cấu hình .env (28/10/2026)

- Người dùng đồng ý rõ việc áp dụng migration P7 trên DB dev qua câu trả lời trong chat. API được rebuild/recreate để nhận credential/dependency mới; khi khởi động đã áp dụng P7. Kiểm độc lập chỉ còn zero pending và FK anh_tai_len_id nullable; không reset/xóa dữ liệu dev hoặc chạy migration khác.
- /health trên API dev trả status=ok. Container nhận đủ ba biến Cloudinary (chỉ kiểm boolean, không in giá trị). Không sửa .env của người dùng.
- Harness AppModule/guard JWT-role-scope thật với DB mới trong container test riêng: không token401, Admin Chi nhánh403, Bệnh nhân403, nội dung giả400, quá10 MB413, các request bị từ chối không tạo ledger — pass. Chỉ dùng tài khoản/ảnh tự tạo trong DB test riêng, không ghi tài khoản/phiên test lên DB dev.
- Upload thật đầu tiên trả503 LOI_HE_THONG; SDK ping độc lập xác nhận HTTP401, thông báo đã làm sạch: cloud_name mismatch. Chưa có upload xác nhận thành công; không tuyên bố Cloudinary/live acceptance pass. Cần người dùng lấy lại bộ Cloud Name/API Key/API Secret từ cùng product environment và cập nhật .env.
- Report test chỉ chứa trạng thái/kích thước/mã lỗi; token/credential không in ra. Không có tài nguyên test được xác nhận tạo trên cloud trong lượt lỗi cấu hình này.


## Retest sau khi người dùng sửa credential — PASS (28/10/2026)

- Dev API đã recreate nhận .env mới, /health OK, P7 migration đã áp dụng (không chạy migration khác hoặc reset DB dev).
- Harness full AppModule với JWT/session/role/scope thật, MySQL test mới riêng, dùng Cloudinary thật: toàn bộ check pass. Request không token401, Admin Chi nhánh/Bệnh nhân403, nội dung giả400, quá10 MB413; request bị từ chối không tạo ledger.
- Ảnh nhỏ alpha: 321 byte →321 byte, PNG96×64, giữ nguyên byte/alpha. Ảnh EXIF6: JPEG993 byte →342 byte, đúng chiều64×96, bỏ metadata. Ảnh chụp nhiễu tự tạo: 6.794.268 byte →2.004.184 byte, WebP1870×1870, giữ tỷ lệ/sàn cạnh dài, đạt trần2 MiB; không ép xuống700–800 KB.
- Đọc URL Cloudinary trả200, ledger xác nhận ChuaGan. Gắn ảnh trong DB test: cleanup giữ asset đang dùng; ảnh chưa gắn hết hạn bị xóa. Gỡ ảnh rồi cleanup: cả3 resource đọc lại404 và ledger0. Dọn dự phòng kiểm độc lập remainingAssetCount=0; không đụng tài nguyên có sẵn.
- Lượt live đầu phát hiện regression: DATETIME làm tròn .900 lên giây sau, nên thu_xoa_lai_luc ở tương lai khiến cleanup ngay sau gỡ bỏ qua. Đã tái hiện bằng MySQL regression đỏ trước sửa, dùng common/time.toSecond trước ghi các mốc của upload repository; regression xanh sau sửa. Không đổi schema hoặc business rule.
- Kiểm sau sửa: npm run test:p7 8/8; npm test -- src/common/upload 42/42; npm run build và lint pass. Bộ toàn API863/863 là evidence lần trước; không tự báo đã rerun toàn bộ sau fix.
- Không dùng tài khoản/phiên thật của người dùng để test; fixture chỉ trong container MySQL mới clinix-p7-live-mysql-20261028/cổng33307. Container test dừng sau kiểm chứng; DB dev chỉ có migration đã được cho phép, không ghi fixture/live ledger lên DB dev.
- Không in credential/token, không sửa .env, commit/push/PR. B1/F2/browser acceptance vẫn pending; live backend smoke không thay nghiệm thu giao diện.


## Tách test khỏi runtime theo yêu cầu người dùng (28/10/2026)

- Chuyển7 test file sang common/upload/test/, giữ testing/ cho setup/helper. vitest.config.p7.ts trỏ test/upload.int-spec.ts; đã kiểm đủ28 import tương đối .js→source.ts.
- Sau move: unit/HTTP42/42 và tsc --noEmit pass. Build, lint và MySQL integration được kiểm riêng bên dưới; không dùng live Cloudinary để xác minh đổi đường dẫn.

- Kết quả sau chuyển thư mục: MySQL integration8/8 pass qua config mới trên container test riêng; build/lint/typecheck pass; kiểm dist không chứa spec.js. git diff --check pass. Container test riêng đã dừng; không gọi Cloudinary thật hoặc sửa DB dev trong lần đổi bố cục này.


## AI_USAGE_LOG đã được cho phép cập nhật (28/10/2026)

- Người dùng đồng ý trong chat; đã thêm dòng23 cho P7 (Codex, không đoán model) và AI-BUG-008 cho lỗi DATETIME/cleanup, ghi rõ reproduction đỏ trước sửa/xanh sau sửa.
- Nhật ký phân biệt kiểm module42/42/MySQL8/8/live Cloudinary với evidence toàn API863/863 lượt trước; B1/F2/UI và commit/PR vẫn pending.
- Kiểm diff: chỉ thêm2 dòng, giữ nguyên mọi dòng nhật ký cũ; git diff --check pass. Chưa stage/commit/push. Các ghi chú trước đây về AI_USAGE_LOG chưa được phép là lịch sử trước lần đồng ý này.
