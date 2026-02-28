/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { paginate } from '../common/utils/pagination.util';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PaginatedResult } from 'src/common/interfaces/pagination.interface';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  // CREATE EVENT (Hanya untuk User Login)
  async create(dto: CreateEventDto, userId: string) {
    return this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        location: dto.location,
        creatorId: userId,
        slots: {
          create: dto.slots.map((slot) => ({
            startTime: new Date(slot.startTime),
            endTime: new Date(slot.endTime),
            capacity: slot.capacity,
          })),
        },
      },
      include: { slots: true },
    });
  }

  // GET ALL EVENTS (Public)
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<any>> {
    const { page, limit, search } = query;
    const skip = ((page || 1) - 1) * (limit || 10);

    const where = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // 1. Ambil data event beserta slots dan semua booking yang CONFIRMED
    const [events, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        include: {
          slots: {
            include: {
              // Kita ambil data bookings untuk menjumlahkan spots secara manual
              bookings: {
                where: { status: 'CONFIRMED' },
                select: { spots: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.event.count({ where }),
    ]);

    // 2. Transformasi data untuk menghitung total spots (remainingSpots)
    const formattedEvents = events.map((event) => ({
      ...event,
      slots: event.slots.map((slot) => {
        // Hitung total spot yang terjual
        const totalBookedSpots = slot.bookings.reduce(
          (sum, b) => sum + b.spots,
          0,
        );

        // Hapus array bookings dari response agar tidak berat di network
        const { bookings, ...slotData } = slot;

        return {
          ...slotData,
          bookedSpots: totalBookedSpots,
          remainingSpots: slot.capacity - totalBookedSpots,
        };
      }),
    }));

    return paginate(formattedEvents, total, page || 1, limit || 10);
  }

  // GET ONE EVENT (Dengan Perhitungan Sisa Spot)
  async findOne(id: string, userId?: string) {
    // Tambahkan parameter userId
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        slots: {
          include: {
            bookings: { where: { status: 'CONFIRMED' } },
          },
        },
      },
    });

    if (!event) throw new NotFoundException('Event tidak ditemukan');

    // Cek apakah user ini sudah pernah booking di slot manapun pada event ini
    let hasBooked = false;
    if (userId) {
      const userBooking = await this.prisma.booking.findFirst({
        where: {
          userId: userId,
          slot: { eventId: id }, // Cek booking yang terhubung ke event ini
        },
      });
      hasBooked = !!userBooking;
    }

    const slotsWithRemaining = event.slots.map((slot) => {
      const occupied = slot.bookings.reduce((sum, b) => sum + b.spots, 0);
      return {
        id: slot.id,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        remainingSpots: slot.capacity - occupied,
      };
    });

    // Tambahkan property hasBooked ke object response
    return {
      ...event,
      slots: slotsWithRemaining,
      hasBooked,
    };
  }

  async update(id: string, dto: UpdateEventDto, userId: string) {
    // 1. Cari event-nya dulu & pastikan pemiliknya
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { slots: true }, // Sertakan slots untuk mendapatkan ID slot-nya
    });

    if (!event) throw new NotFoundException('Event tidak ditemukan');
    if (event.creatorId !== userId) {
      throw new ForbiddenException('Hanya pembuat event yang bisa mengedit!');
    }

    const { slots, ...eventData } = dto;

    return this.prisma.event.update({
      where: { id },
      data: {
        ...eventData,
        // LOGIKA UPDATE SLOTS
        slots: slots
          ? {
              // 1. Update slot yang sudah ada (berdasarkan ID)
              update: slots
                .filter((s) => s.id) // Hanya yang punya ID (data lama)
                .map((slot) => ({
                  where: { id: String(slot.id) },
                  data: {
                    startTime: new Date(slot.startTime),
                    endTime: new Date(slot.endTime),
                    capacity: slot.capacity,
                  },
                })),

              // 2. Tambah slot baru (yang tidak punya ID)
              create: slots
                .filter((s) => !s.id)
                .map((slot) => ({
                  startTime: new Date(slot.startTime),
                  endTime: new Date(slot.endTime),
                  capacity: slot.capacity,
                })),

              // 3. Hapus slot yang tidak ada lagi di kiriman DTO (Hati-hati!)
              deleteMany: {
                id: {
                  notIn: slots.filter((s) => s.id).map((s) => String(s.id)),
                },
              },
            }
          : undefined,
      },
      include: { slots: true },
    });
  }

  // DELETE EVENT (Hanya oleh Pembuatnya)
  async remove(id: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });

    if (!event) throw new NotFoundException('Event tidak ditemukan');
    if (event.creatorId !== userId) {
      throw new ForbiddenException('Anda bukan pemilik event ini!');
    }

    return this.prisma.event.delete({ where: { id } });
  }
}
