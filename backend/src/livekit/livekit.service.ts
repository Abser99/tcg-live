import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  readonly wsUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = config.getOrThrow('LIVEKIT_API_KEY');
    this.apiSecret = config.getOrThrow('LIVEKIT_API_SECRET');
    this.wsUrl = config.getOrThrow('LIVEKIT_WS_URL');
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
