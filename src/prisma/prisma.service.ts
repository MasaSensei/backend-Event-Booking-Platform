/* eslint-disable @typescript-eslint/no-unsafe-call */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    // Memastikan koneksi ke database berhasil saat aplikasi nyala
    await this.$connect();
  }

  async onModuleDestroy() {
    // Memutus koneksi saat aplikasi mati (biar gak bocor memory)
    await this.$disconnect();
  }
}
