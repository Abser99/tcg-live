import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.entity';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(email: string, username: string, password: string): Promise<User> {
    const exists = await this.usersRepo.findOne({
      where: [{ email }, { username }],
    });
    if (exists) throw new ConflictException('Email or username already taken');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.usersRepo.create({ email, username, passwordHash });
    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.usersRepo.update(id, { role });
  }

  async updateShipping(id: string, dto: UpdateShippingDto): Promise<User> {
    await this.usersRepo.update(id, {
      ...(dto.shippingNote !== undefined && { shippingNote: dto.shippingNote }),
      ...(dto.shippingInsurance !== undefined && { shippingInsurance: dto.shippingInsurance }),
    });
    return this.findById(id);
  }

  async getPublicProfile(id: string): Promise<Partial<User> & { averageRating: number | null }> {
    const user = await this.findById(id);
    const { passwordHash, email, balance, zipCode, street, colonia, city, state, ...pub } = user as any;
    const averageRating = user.totalRatings
      ? Math.round((user.totalRatingPoints / user.totalRatings) * 10) / 10
      : null;
    return { ...pub, averageRating };
  }

  async recordRating(id: string, rating: number): Promise<void> {
    await this.usersRepo.increment({ id }, 'totalRatings', 1);
    await this.usersRepo.increment({ id }, 'totalRatingPoints', rating);
    if (rating >= 4) {
      await this.usersRepo.increment({ id }, 'reputationScore', 1);
    }
  }

  async getAverageRating(id: string): Promise<number | null> {
    const user = await this.findById(id);
    if (!user.totalRatings) return null;
    return Math.round((user.totalRatingPoints / user.totalRatings) * 10) / 10;
  }

  async updateAddress(id: string, dto: UpdateAddressDto): Promise<User> {
    await this.usersRepo.update(id, {
      ...(dto.zipCode    !== undefined && { zipCode:  dto.zipCode }),
      ...(dto.street     !== undefined && { street:   dto.street }),
      ...(dto.colonia    !== undefined && { colonia:  dto.colonia }),
      ...(dto.city       !== undefined && { city:     dto.city }),
      ...(dto.state      !== undefined && { state:    dto.state }),
    });
    return this.findById(id);
  }
}
