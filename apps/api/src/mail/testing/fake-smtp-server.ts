import net from 'node:net';

// Máy chủ SMTP giả viết bằng node:net (không thêm gói nào) để kiểm nodemailer THẬT qua TCP: hạ cấp STARTTLS, timeout, đăng nhập bị từ chối.
// Chỉ nghe ở 127.0.0.1, cổng ngẫu nhiên. Không nói TLS, nên với cấu hình thật (requireTLS) nodemailer sẽ dừng ở bước STARTTLS.
export interface FakeSmtpServerOptions {
  /** false = nhận kết nối nhưng không gửi lời chào 220 (kiểm greetingTimeout). */
  greet?: boolean;
  /** true = EHLO quảng cáo STARTTLS (rồi từ chối bằng 454). */
  advertiseStartTls?: boolean;
  /** Im lặng (không trả lời) sau khi nhận lệnh này (kiểm socketTimeout). */
  silentAfter?: string;
  /** Trả 535 cho AUTH. */
  rejectAuth?: boolean;
}

export interface FakeSmtpServer {
  readonly port: number;
  /** Các lệnh khách đã gửi; dòng AUTH được che phần dữ liệu. Nội dung thư không được ghi. */
  readonly commands: string[];
  /** Tên lệnh (EHLO, STARTTLS, AUTH, MAIL, RCPT, DATA…) theo thứ tự. */
  verbs(): string[];
  close(): Promise<void>;
}

export async function startFakeSmtpServer(
  options: FakeSmtpServerOptions = {},
): Promise<FakeSmtpServer> {
  const {
    greet = true,
    advertiseStartTls = false,
    rejectAuth = false,
  } = options;
  const commands: string[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    socket.setEncoding('utf8');
    if (greet) socket.write('220 fake ESMTP\r\n');

    let buffer = '';
    let inData = false;
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        const end = buffer.indexOf('\r\n');
        if (end === -1) return;
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            socket.write('250 queued\r\n');
          }
          continue;
        }
        commands.push(line.replace(/^(AUTH \w+ ).+$/i, '$1<…>'));
        const verb = line.split(' ')[0]?.toUpperCase() ?? '';
        if (options.silentAfter?.toUpperCase() === verb) return;
        switch (verb) {
          case 'EHLO':
            socket.write(
              `250-fake\r\n${advertiseStartTls ? '250-STARTTLS\r\n' : ''}250 AUTH PLAIN LOGIN\r\n`,
            );
            break;
          case 'STARTTLS':
            socket.write('454 TLS not available\r\n');
            break;
          case 'AUTH':
            socket.write(
              rejectAuth
                ? '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 Learn more\r\n'
                : '235 ok\r\n',
            );
            break;
          case 'DATA':
            inData = true;
            socket.write('354 go\r\n');
            break;
          case 'QUIT':
            socket.end('221 bye\r\n');
            break;
          default:
            socket.write('250 ok\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Không lấy được cổng của máy chủ SMTP giả');
  }

  return {
    port: address.port,
    commands,
    verbs: () =>
      commands.map((line) => line.split(' ')[0]?.toUpperCase() ?? ''),
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => {
          resolve();
        });
      }),
  };
}
