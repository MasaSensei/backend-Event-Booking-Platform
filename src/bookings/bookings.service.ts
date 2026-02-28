/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
// src/bookings/bookings.service.ts
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private notificationsGateway: NotificationsGateway,
  ) {}

  async create(slotId: string, userId: string, spots: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. LOCK BARIS SLOT (PENTING!)
      // Menggunakan queryRaw karena Prisma findUnique tidak mendukung "FOR UPDATE" secara native
      // Ini memaksa transaksi lain menunggu sampai transaksi ini selesai.
      const slots = await tx.$queryRaw<any[]>`
      SELECT id, capacity FROM "Slot" WHERE id = ${slotId} FOR UPDATE
    `;

      if (!slots || slots.length === 0)
        throw new NotFoundException('Slot tidak ditemukan');
      const targetSlot = slots[0];

      // 2. Cek Bentrok Jadwal (Logika kamu sudah benar, tetap dipertahankan)
      // Ambil detail jam dari database (karena queryRaw tadi hanya ambil kolom terbatas)
      const slotDetail = await tx.slot.findUnique({ where: { id: slotId } });

      const conflictingBooking = await tx.booking.findFirst({
        where: {
          userId,
          status: 'CONFIRMED',
          slot: {
            AND: [
              { startTime: { lt: slotDetail?.endTime } },
              { endTime: { gt: slotDetail?.startTime } },
            ],
          },
        },
        include: { slot: { include: { event: true } } },
      });

      if (conflictingBooking) {
        throw new ConflictException(
          `Jadwal bentrok dengan event "${conflictingBooking.slot.event.title}"`,
        );
      }

      // 3. Cek apakah sudah pernah booking di slot ini
      const existing = await tx.booking.findFirst({
        where: { userId, slotId, status: { in: ['CONFIRMED', 'WAITLIST'] } },
      });
      if (existing)
        throw new ForbiddenException('Anda sudah terdaftar di slot ini');

      // 4. Hitung okupansi terbaru di dalam transaksi yang ter-lock
      const aggregate = await tx.booking.aggregate({
        where: { slotId, status: 'CONFIRMED' },
        _sum: { spots: true },
      });

      const occupied = aggregate._sum.spots || 0;
      const remaining = targetSlot.capacity - occupied;

      // 5. Tentukan status
      const status = spots <= remaining ? 'CONFIRMED' : 'WAITLIST';

      // 6. Eksekusi Booking
      const booking = await tx.booking.create({
        data: { userId, slotId, spots, status },
      });

      // 7. Hitung sisa kuota akhir untuk broadcast
      const finalOccupied =
        status === 'CONFIRMED' ? occupied + spots : occupied;
      const finalRemaining = targetSlot.capacity - finalOccupied;

      // Broadcast (Sebaiknya diletakkan tepat sebelum return agar trigger setelah commit)
      this.notificationsGateway.updateGlobalAvailability(
        slotId,
        finalRemaining,
      );

      return {
        ...booking,
        message:
          status === 'WAITLIST'
            ? 'Slot penuh, Anda masuk dalam daftar tunggu (Waitlist)'
            : 'Booking berhasil dikonfirmasi',
      };
    });
  }

  async getMyBookings(userId: string) {
    const now = new Date();

    const allBookings = await this.prisma.booking.findMany({
      where: { userId },
      include: {
        slot: { include: { event: true } },
      },
      orderBy: { slot: { startTime: 'asc' } },
    });

    // 1. Belum Mulai
    const upcoming = allBookings.filter(
      (b) => new Date(b.slot.startTime) > now,
    );

    // 2. Sedang Berlangsung (Sudah mulai tapi belum berakhir)
    const ongoing = allBookings.filter(
      (b) =>
        new Date(b.slot.startTime) <= now && new Date(b.slot.endTime) >= now,
    );

    // 3. Sudah Lewat (Sudah berakhir)
    const past = allBookings.filter((b) => new Date(b.slot.endTime) < now);

    return { upcoming, ongoing, past };
  }

  async promoteWaitlist(tx: any, slotId: string, availableSpots: number) {
    const waitlist = await tx.booking.findMany({
      where: { slotId, status: 'WAITLIST' },
      orderBy: { createdAt: 'asc' },
    });

    let remainingNewSpots = availableSpots;

    for (const entry of waitlist) {
      if (remainingNewSpots <= 0) break;

      if (entry.spots <= remainingNewSpots) {
        await tx.booking.update({
          where: { id: entry.id },
          data: { status: 'CONFIRMED' },
        });

        const msg = `Kabar baik! Antreanmu untuk sesi ini telah dipromosikan menjadi tiket aktif.`;

        // 1. Simpan ke Database (History)
        await tx.notification.create({
          data: { userId: entry.userId, message: msg },
        });

        // 2. Kirim Real-time via WebSocket
        this.notificationsGateway.sendNotification(entry.userId, msg);

        remainingNewSpots -= entry.spots;
      }
    }
  }
  async cancelBooking(bookingId: string, userId: string, cancelCount?: number) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Cari data booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { slot: true },
      });

      if (!booking || booking.userId !== userId) {
        throw new NotFoundException(
          'Booking tidak ditemukan atau bukan milik Anda',
        );
      }

      // 2. Safety Check: Cek waktu
      // Tidak bisa cancel jika event sudah mulai/lewat
      if (new Date(booking.slot.startTime) < new Date()) {
        throw new BadRequestException(
          'Event sudah dimulai atau sudah selesai.',
        );
      }

      // 3. Tentukan jumlah yang akan dibatalkan
      // Jika cancelCount tidak dikirim, maka Full Cancel (batal semua)
      const amountToCancel = cancelCount ?? booking.spots;

      // Validasi: tidak boleh cancel lebih dari yang dipesan
      if (amountToCancel <= 0 || amountToCancel > booking.spots) {
        throw new BadRequestException('Jumlah pembatalan tidak valid');
      }

      if (amountToCancel === booking.spots) {
        await tx.booking.delete({ where: { id: bookingId } });
      } else {
        await tx.booking.update({
          where: { id: bookingId },
          data: { spots: { decrement: amountToCancel } },
        });
      }

      // TRIGGER AUTO-PROMOTION (Poin 2.3)
      // Berikan jumlah spot yang baru saja kosong ke fungsi promosi
      await this.promoteWaitlist(tx, booking.slotId, amountToCancel);

      const finalSlotState = await tx.slot.findUnique({
        where: { id: booking.slotId },
        include: { bookings: { where: { status: 'CONFIRMED' } } },
      });

      const finalOccupied = finalSlotState?.bookings.reduce(
        (sum, b) => sum + b.spots,
        0,
      );

      this.notificationsGateway.server.emit('availability_updated', {
        slotId: booking.slotId,
        remaining: (finalSlotState?.capacity ?? 0) - (finalOccupied ?? 0),
      });

      return { message: 'Pembatalan berhasil dan antrean telah diperbarui.' };
    });
  }

  async undoCancellation(bookingId: string, userId: string) {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Ambil data booking yang dibatalkan
      const booking = await tx.booking.findUnique({
        where: { id: bookingId, userId },
        include: { slot: true },
      });

      if (!booking || booking.status !== 'CANCELLED') {
        throw new BadRequestException(
          'Booking tidak ditemukan atau tidak dalam status CANCELLED',
        );
      }

      // 2. Cek batas waktu Undo (Contoh: Max 30 menit setelah cancel)
      const LIMIT_MINUTES = 30;
      const now = new Date();
      const diff =
        (now.getTime() - new Date(booking.cancelledAt!).getTime()) / 60000;

      if (diff > LIMIT_MINUTES) {
        throw new BadRequestException(
          'Batas waktu undo (30 menit) telah berakhir',
        );
      }

      // 3. LOCK Slot untuk cek sisa kuota saat ini
      const slots = await tx.$queryRaw<any[]>`
      SELECT capacity FROM "Slot" WHERE id = ${booking.slotId} FOR UPDATE
    `;
      const slotCapacity = slots[0].capacity;

      // 4. Hitung okupansi CONFIRMED saat ini
      const aggregate = await tx.booking.aggregate({
        where: { slotId: booking.slotId, status: 'CONFIRMED' },
        _sum: { spots: true },
      });
      const currentOccupied = aggregate._sum.spots || 0;
      const remaining = slotCapacity - currentOccupied;

      // 5. Validasi Graceful: Apakah spot masih cukup?
      if (booking.spots > remaining) {
        throw new ConflictException(
          'Maaf, spot Anda sudah diisi oleh orang lain (Waitlist Promotion). Undo gagal.',
        );
      }

      // 6. Pulihkan status
      const restoredBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          cancelledAt: null,
        },
      });

      // 7. Broadcast update sisa kuota ke semua orang
      this.notificationsGateway.updateGlobalAvailability(
        booking.slotId,
        remaining - booking.spots,
      );

      return {
        ...restoredBooking,
        message: 'Booking berhasil dipulihkan!',
      };
    });
  }
}
