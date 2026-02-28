import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async create(@Body() dto: CreateBookingDto, @GetUser('id') userId: string) {
    return this.bookingsService.create(dto.slotId, userId, dto.spots);
  }

  @Get('my')
  getMyBookings(@GetUser('id') userId: string) {
    return this.bookingsService.getMyBookings(userId);
  }

  @Patch(':id/cancel')
  cancelBooking(
    @Param('id') bookingId: string,
    @GetUser('id') userId: string,
    @Body('cancelCount') cancelCount?: number,
  ) {
    return this.bookingsService.cancelBooking(
      bookingId,
      userId,
      Number(cancelCount),
    );
  }

  @Post(':id/undo')
  async undo(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.bookingsService.undoCancellation(id, userId);
  }
}
