import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  readonly wsUrl: string;
  private readonly egress: EgressClient | null;
  /** Egress writes the file somewhere; without a bucket there is nowhere to put it. */
  private readonly s3: { bucket: string; region: string; accessKey: string; secret: string } | null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.getOrThrow('LIVEKIT_API_KEY');
    this.apiSecret = config.getOrThrow('LIVEKIT_API_SECRET');
    this.wsUrl = config.getOrThrow('LIVEKIT_WS_URL');

    const bucket = config.get<string>('RECORDINGS_S3_BUCKET');
    const accessKey = config.get<string>('RECORDINGS_S3_ACCESS_KEY');
    const secret = config.get<string>('RECORDINGS_S3_SECRET');
    this.s3 = bucket && accessKey && secret
      ? { bucket, accessKey, secret, region: config.get<string>('RECORDINGS_S3_REGION') ?? 'us-east-1' }
      : null;

    // The HTTP API lives on the same host as the socket, over https.
    const httpUrl = this.wsUrl.replace(/^ws/, 'http');
    this.egress = new EgressClient(httpUrl, this.apiKey, this.apiSecret);

    if (!this.s3) {
      this.logger.warn(
        'RECORDINGS_S3_* not set — live video will not be recorded. Bid timelines are ' +
        'still captured, so replay markers work as soon as a bucket is configured.',
      );
    }
  }

  /* Whether the video service will actually accept a join right now. The browser can't
     tell us: a WebSocket handshake that fails hides its HTTP status, so the client only
     ever sees "ServerUnreachable" — the same thing it reports for a dead wifi. The
     server can ask directly, so it does, and caches the answer for a minute. */
  private availability: { ok: boolean; issue?: string; checkedAt: number } | null = null;
  private static readonly AVAILABILITY_TTL_MS = 60_000;

  async videoAvailability(): Promise<{ ok: boolean; issue?: string }> {
    const cached = this.availability;
    if (cached && Date.now() - cached.checkedAt < LivekitService.AVAILABILITY_TTL_MS) {
      return { ok: cached.ok, issue: cached.issue };
    }
    let result: { ok: boolean; issue?: string } = { ok: true };
    try {
      const probe = new AccessToken(this.apiKey, this.apiSecret, { identity: '__probe__', ttl: 60 });
      probe.addGrant({ roomJoin: true, room: '__availability_probe__' });
      const token = await probe.toJwt();
      const httpUrl = this.wsUrl.replace(/^ws/, 'http');
      const res = await fetch(`${httpUrl}/rtc/validate?access_token=${token}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        result = { ok: false, issue: res.status === 429 ? 'quota' : 'unavailable' };
        this.logger.warn(`LiveKit refused a join probe: ${res.status} ${body}`);
      }
    } catch (err) {
      // A probe that can't run is not proof the service is down; don't cry wolf.
      this.logger.warn(`Could not probe LiveKit availability: ${String(err)}`);
    }
    this.availability = { ...result, checkedAt: Date.now() };
    return result;
  }

  /** True when a recording can actually be written somewhere. */
  get canRecord(): boolean {
    return !!this.s3;
  }

  /**
   * Start recording a live. Returns the egress id to stop it later, or null when no
   * storage is configured — the caller still timestamps the session so the bid
   * timeline stays correct and only the video is missing.
   */
  async startRecording(auctionId: string): Promise<string | null> {
    if (!this.s3 || !this.egress) return null;
    try {
      const output = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: `auctions/${auctionId}/{time}.mp4`,
        output: {
          case: 's3',
          value: new S3Upload({
            accessKey: this.s3.accessKey,
            secret: this.s3.secret,
            bucket: this.s3.bucket,
            region: this.s3.region,
          }),
        },
      });
      const info = await this.egress.startRoomCompositeEgress(`auction-${auctionId}`, { file: output });
      this.logger.log(`Recording started for auction ${auctionId} (egress ${info.egressId})`);
      return info.egressId;
    } catch (err) {
      // A live that can't be recorded must still go on air.
      this.logger.error(`Could not start recording for auction ${auctionId}: ${err}`);
      return null;
    }
  }

  /** Stop a recording. Returns the resulting file URL when egress reports one. */
  async stopRecording(egressId: string): Promise<string | null> {
    if (!this.egress) return null;
    try {
      const info = await this.egress.stopEgress(egressId);
      const file = info.fileResults?.[0];
      return file?.location ?? file?.filename ?? null;
    } catch (err) {
      this.logger.error(`Could not stop egress ${egressId}: ${err}`);
      return null;
    }
  }

  async generateToken(
    userId: string,
    username: string,
    auctionId: string,
    canPublish: boolean,
  ): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      name: username,
      ttl: '4h',
    });
    at.addGrant({
      roomJoin: true,
      room: `auction-${auctionId}`,
      canPublish,          // media (camera/mic) — sellers only
      canPublishData: true, // chat + reactions — everyone, so all users see each other's emojis
      canSubscribe: true,
    });
    return at.toJwt();
  }
}
