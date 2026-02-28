/* eslint-disable prettier/prettier */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt'; // Pastikan install bcrypt untuk password

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Cleaning database...');
  // Urutan delete penting: Booking dulu baru Slot/User
  await prisma.notification.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.slot.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();

  const hashedPassword = await bcrypt.hash('password123', 10);

  console.log('👥 Creating 305 users...');
  const users: Array<{
    id: string;
    email: string;
    password: string;
    timezone: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  // Gunakan loop biasa agar tidak timeout jika koneksi DB lambat
  for (let i = 0; i < 305; i++) {
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email: `user${i}@example.com`,
        password: hashedPassword, // Wajib ada sesuai schema
        timezone: 'Asia/Jakarta',
      },
    });
    users.push(user);
  }

  const admin = users[0];
  const busyUser = users[1];

  // --- SKENARIO 1: THE FULL SLOT ---
  console.log('🎭 Scenario 1: The Full Slot...');
  const event1 = await prisma.event.create({
    data: {
      title: 'Workshop Modern Tech',
      description: 'Event dengan slot penuh dan waitlist',
      location: 'Jakarta Tech Center',
      creatorId: admin.id,
      slots: {
        create: [
          {
            startTime: new Date('2026-05-01T10:00:00Z'),
            endTime: new Date('2026-05-01T12:00:00Z'),
            capacity: 5,
          },
          {
            startTime: new Date('2026-05-01T14:00:00Z'),
            endTime: new Date('2026-05-01T16:00:00Z'),
            capacity: 5,
          },
        ],
      },
    },
    include: { slots: true },
  });

  // Slot 0: 5 Confirmed, 3 Waitlist
  for (let i = 2; i < 7; i++) {
    await prisma.booking.create({
      data: {
        userId: users[i].id,
        slotId: event1.slots[0].id,
        spots: 1,
        status: 'CONFIRMED',
      },
    });
  }
  for (let i = 7; i < 10; i++) {
    await prisma.booking.create({
      data: {
        userId: users[i].id,
        slotId: event1.slots[0].id,
        spots: 1,
        status: 'WAITLIST',
      },
    });
  }
  // Slot 1: 3 Confirmed (Sisa 2)
  for (let i = 10; i < 13; i++) {
    await prisma.booking.create({
      data: {
        userId: users[i].id,
        slotId: event1.slots[1].id,
        spots: 1,
        status: 'CONFIRMED',
      },
    });
  }

  // --- SKENARIO 2: THE BUSY USER ---
  console.log('🏃 Scenario 2: The Busy User...');
  const pastEvent = await prisma.event.create({
    data: {
      title: 'Past Conference 2025',
      description: 'Event masa lalu',
      location: 'Online',
      creatorId: admin.id,
      slots: {
        create: [
          {
            startTime: new Date('2025-01-01T10:00:00Z'),
            endTime: new Date('2025-01-01T12:00:00Z'),
            capacity: 10,
          },
        ],
      },
    },
    include: { slots: true },
  });
  await prisma.booking.create({
    data: {
      userId: busyUser.id,
      slotId: pastEvent.slots[0].id,
      spots: 1,
      status: 'CONFIRMED',
    },
  });

  const upcomingEvent = await prisma.event.create({
    data: {
      title: 'Upcoming Concert',
      description: 'Event mendatang',
      location: 'Stadium',
      creatorId: admin.id,
      slots: {
        create: [
          {
            startTime: new Date('2026-06-01T19:00:00Z'),
            endTime: new Date('2026-06-01T21:00:00Z'),
            capacity: 10,
          },
        ],
      },
    },
    include: { slots: true },
  });
  await prisma.booking.create({
    data: {
      userId: busyUser.id,
      slotId: upcomingEvent.slots[0].id,
      spots: 1,
      status: 'CONFIRMED',
    },
  });
  await prisma.booking.create({
    data: {
      userId: busyUser.id,
      slotId: event1.slots[0].id,
      spots: 1,
      status: 'WAITLIST',
    },
  });

  // --- SKENARIO 3: THE MULTI-SLOT EVENT ---
  console.log('📊 Scenario 3: The Multi-Slot Event...');
  const event3 = await prisma.event.create({
    data: {
      title: 'Training Series',
      description: 'Tiga kondisi slot berbeda',
      location: 'Hybrid',
      creatorId: admin.id,
      slots: {
        create: [
          {
            startTime: new Date('2026-07-01T08:00:00Z'),
            endTime: new Date('2026-07-01T10:00:00Z'),
            capacity: 10,
          },
          {
            startTime: new Date('2026-07-02T08:00:00Z'),
            endTime: new Date('2026-07-02T10:00:00Z'),
            capacity: 2,
          },
          {
            startTime: new Date('2026-07-03T08:00:00Z'),
            endTime: new Date('2026-07-03T10:00:00Z'),
            capacity: 5,
          },
        ],
      },
    },
    include: { slots: true },
  });
  await prisma.booking.createMany({
    data: [
      {
        userId: users[20].id,
        slotId: event3.slots[1].id,
        spots: 1,
        status: 'CONFIRMED',
      },
      {
        userId: users[21].id,
        slotId: event3.slots[1].id,
        spots: 1,
        status: 'CONFIRMED',
      },
    ],
  });
  for (let i = 22; i < 26; i++) {
    await prisma.booking.create({
      data: {
        userId: users[i].id,
        slotId: event3.slots[2].id,
        spots: 1,
        status: 'CONFIRMED',
      },
    });
  }

  // --- SKENARIO 4: THE CANCELLATION CHAIN ---
  console.log('🔗 Scenario 4: The Cancellation Chain...');
  const event4 = await prisma.event.create({
    data: {
      title: 'Exclusive Seminar',
      description: 'Simulasi auto-promotion',
      location: 'VIP Room',
      creatorId: admin.id,
      slots: {
        create: [
          {
            startTime: new Date('2026-08-01T10:00:00Z'),
            endTime: new Date('2026-08-01T12:00:00Z'),
            capacity: 1,
          },
        ],
      },
    },
    include: { slots: true },
  });
  await prisma.booking.create({
    data: {
      userId: users[30].id,
      slotId: event4.slots[0].id,
      spots: 1,
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });
  await prisma.booking.create({
    data: {
      userId: users[31].id,
      slotId: event4.slots[0].id,
      spots: 1,
      status: 'CONFIRMED',
    },
  });

  // --- SKENARIO 5: THE CONFLICT ---
  console.log('⚔️ Scenario 5: The Conflict...');
  const tStart = new Date('2026-09-01T10:00:00Z');
  const tEnd = new Date('2026-09-01T12:00:00Z');
  const eventA = await prisma.event.create({
    data: {
      title: 'Conflict Event A',
      description: 'Overlap A',
      location: 'Room 1',
      creatorId: admin.id,
      slots: { create: [{ startTime: tStart, endTime: tEnd, capacity: 10 }] },
    },
    include: { slots: true },
  });
  const eventB = await prisma.event.create({
    data: {
      title: 'Conflict Event B',
      description: 'Overlap B',
      location: 'Room 2',
      creatorId: admin.id,
      slots: { create: [{ startTime: tStart, endTime: tEnd, capacity: 10 }] },
    },
    include: { slots: true },
  });
  await prisma.booking.create({
    data: {
      userId: users[40].id,
      slotId: eventA.slots[0].id,
      status: 'CONFIRMED',
    },
  });
  await prisma.booking.create({
    data: {
      userId: users[40].id,
      slotId: eventB.slots[0].id,
      status: 'CONFIRMED',
    },
  });

  // --- MASS SEEDING (Sisa 100 event) ---
  console.log('📦 Seeding to reach 100 events...');
  const remainingCount = 100 - 6; // Sudah buat 6 event di atas
  for (let i = 0; i < remainingCount; i++) {
    const isPast = i < 30;
    await prisma.event.create({
      data: {
        title: `Generic ${isPast ? 'Past' : 'Future'} Event ${i}`,
        description: 'Random description',
        location: 'Jakarta',
        creatorId: admin.id,
        slots: {
          create: [
            {
              startTime: new Date(
                isPast ? '2024-01-01T10:00:00Z' : '2026-12-01T10:00:00Z',
              ),
              endTime: new Date(
                isPast ? '2024-01-01T12:00:00Z' : '2026-12-01T12:00:00Z',
              ),
              capacity: 20,
            },
          ],
        },
      },
    });
  }

  console.log('✅ Success! 305 Users & 100 Events created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
