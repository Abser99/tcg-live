import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './user.entity';
import { UpdateShippingDto } from './dto/update-shipping.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(
    email: string,
    username: string,
    password: string,
    ageConfirmed = false,
  ): Promise<User> {
    const exists = await this.usersRepo.findOne({
      where: [{ email }, { username }],
    });
    if (exists) throw new ConflictException('Email or username already taken');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.usersRepo.create({
      email,
      username,
      passwordHash,
      ageConfirmedAt: ageConfirmed ? new Date() : null,
    });
    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  /** Full user by username. getPublicProfileByUsername strips fields we need internally. */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateRole(id: string, role: UserRole): Promise<void> {
    await this.usersRepo.update(id, { role });
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    if (dto.username) {
      const exists = await this.usersRepo.findOne({ where: { username: dto.username } });
      if (exists && exists.id !== id) throw new ConflictException('Nombre de usuario ya en uso');
    }
    await this.usersRepo.update(id, {
      ...(dto.username    !== undefined && { username:    dto.username    }),
      ...(dto.displayName !== undefined && { displayName: dto.displayName }),
      ...(dto.avatarUrl   !== undefined && { avatarUrl:   dto.avatarUrl   }),
    });
    return this.findById(id);
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.usersRepo.update(id, { passwordHash: hash });
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
    return this.buildPublicProfile(user);
  }

  async getPublicProfileByUsername(username: string): Promise<Partial<User> & { averageRating: number | null }> {
    const user = await this.usersRepo.findOne({ where: { username } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.buildPublicProfile(user);
  }

  private buildPublicProfile(user: User): Partial<User> & { averageRating: number | null } {
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

  async setPasswordHash(id: string, hash: string): Promise<void> {
    await this.usersRepo.update(id, { passwordHash: hash });
  }

  async setVerified(id: string, isVerified: boolean): Promise<void> {
    await this.usersRepo.update(id, { isVerified });
  }

  async suspendUser(id: string, reason: string): Promise<User> {
    const user = await this.usersRepo.findOneOrFail({ where: { id } });
    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspendReason = reason;
    return this.usersRepo.save(user);
  }

  async unsuspendUser(id: string): Promise<User> {
    const user = await this.usersRepo.findOneOrFail({ where: { id } });
    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspendReason = null;
    return this.usersRepo.save(user);
  }

  async findAllUsers(page = 1, limit = 20): Promise<{ data: Partial<User>[]; total: number; page: number; limit: number }> {
    const [data, total] = await this.usersRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      select: ['id', 'username', 'email', 'isSuspended', 'suspendedAt', 'suspendReason', 'isVerified', 'createdAt', 'role'],
    });
    return { data, total, page, limit };
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

  async updatePayoutInfo(userId: string, dto: { clabe?: string; mpPayoutEmail?: string }): Promise<User> {
    const user = await this.findById(userId);
    if (dto.clabe !== undefined) user.clabe = dto.clabe || null;
    if (dto.mpPayoutEmail !== undefined) user.mpPayoutEmail = dto.mpPayoutEmail || null;
    return this.usersRepo.save(user);
  }
}
