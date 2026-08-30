import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident, IncidentKind, IncidentStatus } from './entities/incident.entity';
import { Auction } from '../auctions/entities/auction.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How much of the recording before the report is worth reviewing. */
const LOOKBACK_SEC = 60;

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    @InjectRepository(Incident) private readonly repo: Repository<Incident>,
    @InjectRepository(Auction) private readonly auctionsRepo: Repository<Auction>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * File a report.
   *
   * When it comes from inside a live, the moment is marked against the recording's own
   * clock — the live is already being recorded, so there's no need to hold video in
   * memory waiting for someone to complain. The admin gets a window (the minute before
   * the report through the report itself) to open in the existing recording.
   */
  async create(
    reporterId: string,
    dto: {
      kind: IncidentKind;
      description: string;
      auctionId?: string;
      orderId?: string;
      reportedUsername?: string;
    },
  ): Promise<Incident> {
    const reporter = await this.usersService.findById(reporterId);

    let atOffsetSec: number | null = null;
    let fromOffsetSec: number | null = null;
    let toOffsetSec: number | null = null;

    if (dto.auctionId) {
      const auction = await this.auctionsRepo.findOne({ where: { id: dto.auctionId } });
      const zero = auction?.recordingStartedAt ?? auction?.startedAt ?? null;
      if (zero) {
        atOffsetSec = Math.max(0, Math.round((Date.now() - zero.getTime()) / 1000));
        fromOffsetSec = Math.max(0, atOffsetSec - LOOKBACK_SEC);
        toOffsetSec = atOffsetSec;
      }
    }

    let reportedUserId: string | null = null;
    let reportedUsername: string | null = null;
    if (dto.reportedUsername) {
      const target = await this.usersService.findByUsername(dto.reportedUsername).catch(() => null);
      if (target) { reportedUserId = target.id; reportedUsername = target.username; }
    }

    const incident = await this.repo.save(this.repo.create({
      kind: dto.kind,
      reporterId,
      reporterUsername: reporter.username,
      auctionId: dto.auctionId ?? null,
      orderId: dto.orderId ?? null,
      reportedUserId,
      reportedUsername,
      description: dto.description.trim().slice(0, 2000),
      atOffsetSec, fromOffsetSec, toOffsetSec,
      status: IncidentStatus.OPEN,
    }));

    this.logger.log(
      `Incident ${incident.id} (${dto.kind}) by ${reporter.username}` +
      (atOffsetSec !== null ? ` at ${atOffsetSec}s of the recording` : ''),
    );
    return incident;
  }

  /** What this person has reported. */
  async mine(reporterId: string): Promise<Incident[]> {
    return this.repo.find({ where: { reporterId }, order: { createdAt: 'DESC' } });
  }

  /** Admin queue, oldest open first — those have been waiting longest. */
  async list(status?: IncidentStatus): Promise<Incident[]> {
    return this.repo.find({
      where: status ? { status } : {},
      order: { status: 'ASC', createdAt: 'ASC' },
      take: 200,
    });
  }

  async countOpen(): Promise<number> {
    return this.repo.count({ where: { status: IncidentStatus.OPEN } });
  }

  /** Admin moves a report along and tells the reporter what happened. */
  async resolve(id: string, status: IncidentStatus, adminNote?: string): Promise<Incident> {
    const incident = await this.repo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Reporte no encontrado');
    incident.status = status;
    if (adminNote !== undefined) incident.adminNote = adminNote.trim().slice(0, 2000) || null;
    incident.resolvedAt =
      status === IncidentStatus.RESOLVED || status === IncidentStatus.DISMISSED ? new Date() : null;
    const saved = await this.repo.save(incident);

    // Silence is the main complaint people have about support, so close the loop.
    if (incident.resolvedAt) {
      this.notificationsService.sendToUser(incident.reporterId, {
        title: status === IncidentStatus.RESOLVED ? '✅ Tu reporte fue atendido' : 'Tu reporte fue revisado',
        body: adminNote?.trim() || 'Un administrador revisó tu reporte.',
        data: { type: 'incident_update' },
      }).catch(() => {});
    }
    return saved;
  }

  async findOne(id: string, requesterId: string, isAdmin: boolean): Promise<Incident> {
    const incident = await this.repo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Reporte no encontrado');
    if (!isAdmin && incident.reporterId !== requesterId) {
      throw new ForbiddenException('Ese reporte no es tuyo');
    }
    return incident;
  }
}
