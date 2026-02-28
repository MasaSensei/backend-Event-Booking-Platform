import { IsUUID, IsInt, Min, Max } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  slotId: string;

  @IsInt()
  @Min(1, { message: 'Booking minimal 1 spot' })
  @Max(5, { message: 'Booking maksimal 5 spot per transaksi' })
  spots: number;
}
