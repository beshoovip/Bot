// ربط Socket.IO بـ GameServer. الاتصال لا يُقبل بدون جلسة صالحة (رمز في handshake.auth.token).
// كل رسالة تمر عبر game.handle: تحقق من المخطط + تحديد معدل + قواعد اللعبة.

import { Server } from 'socket.io';
import { C2S } from '../../../shared/protocol.js';
import { RATE_LIMITS } from '../../../shared/protocol.js';
import { ConnectionLimiter } from '../security/rateLimiter.js';

const MAX_CONNECTIONS_PER_IP = 8;

export function attachSocketServer(httpServer, { game, auth, config, log }) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins.length ? config.corsOrigins : !config.isProd, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 10_000,
    pingInterval: 10_000,
    pingTimeout: 10_000,
    connectionStateRecovery: undefined, // الاستعادة تتم بالانضمام من جديد (join) داخل فترة السماح
  });
  const perIp = new Map();

  io.use(async (socket, next) => {
    try {
      const ip = socket.handshake.address;
      if ((perIp.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) return next(new Error('RATE_LIMIT'));
      const user = await auth.authenticate(socket.handshake.auth?.token);
      if (!user) return next(new Error('UNAUTHORIZED'));
      socket.data.userId = user.userId;
      return next();
    } catch (e) {
      log.error('socket auth failed', e);
      return next(new Error('SERVER_ERROR'));
    }
  });

  io.on('connection', (socket) => {
    const ip = socket.handshake.address;
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const conn = {
      id: socket.id,
      userId: socket.data.userId,
      player: null,
      limiter: new ConnectionLimiter(RATE_LIMITS),
      emit: (event, payload) => socket.emit(event, payload),
      close: () => socket.disconnect(true),
    };
    for (const ev of Object.values(C2S)) {
      socket.on(ev, (payload, ack) => {
        game.handle(conn, ev, payload, typeof ack === 'function' ? ack : undefined);
      });
    }
    socket.on('disconnect', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
      game.disconnect(conn);
    });
    socket.on('error', (e) => log.warn('socket error', { err: e?.message }));
  });
  return io;
}
