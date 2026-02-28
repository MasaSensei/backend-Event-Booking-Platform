/* eslint-disable @typescript-eslint/restrict-template-expressions */
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt'; // Import JwtService

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000'],
    credentials: true,
  },
  transports: ['polling', 'websocket'],
})
export class NotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {} // Inject JwtService

  async handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;

    // 1. SEMUA yang connect otomatis masuk ke room global
    await client.join('global_updates');
    console.log(`🌍 Client joined global_updates`);

    if (userId && userId !== 'undefined') {
      const room = `user_${userId}`;
      await client.join(room);
      console.log(`✅ User ${userId} masuk ke room ${room}`);
    }
  }

  updateGlobalAvailability(slotId: string, remaining: number) {
    // 2. Kirim ke room global alih-alih broadcast murni
    console.log(
      `📡 Broadcasting to global_updates: slot ${slotId} -> ${remaining}`,
    );
    this.server
      .to('global_updates')
      .emit('availability_updated', { slotId, remaining });
  }

  sendNotification(userId: string, message: string) {
    const room = `user_${userId}`;
    console.log(`📡 Mengirim notifikasi ke room: ${room}`);

    this.server.to(room).emit('notification', {
      message,
      createdAt: new Date(),
    });
  }
}
