import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Reporting for the admin console.
 *
 * Written as aggregate SQL rather than loading rows and summing in JS: these run over
 * every order, bid and minute on the platform, and the numbers are only useful if the
 * page still answers once there's real volume.
 *
 * A note on the joins: some id columns are uuid and others varchar (orders and
 * attendance store ids as text), so every join across those casts explicitly. Without
 * the cast Postgres refuses with "operator does not exist: uuid = character varying".
 */
@Injectable()
export class AdminService {
  /** Platform commission taken from each paid order — mirrors OrdersService. */
  private static readonly COMMISSION = 0.08;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Headline numbers for the whole platform. */
  async overview() {
    const [users, auctions, orders, bids, minutes, raffles] = await Promise.all([
      this.db.query(`
        SELECT
          count(*)::int                                              AS total,
          count(*) FILTER (WHERE role = 'seller')::int                AS sellers,
          count(*) FILTER (WHERE role = 'buyer')::int                 AS buyers,
          count(*) FILTER (WHERE "isSuspended")::int                  AS suspended,
          count(*) FILTER (WHERE "createdAt" > now() - interval '7 days')::int AS new_week
        FROM users`),
      this.db.query(`
        SELECT
          count(*)::int                                        AS total,
          count(*) FILTER (WHERE status = 'live')::int          AS live,
          count(*) FILTER (WHERE status = 'scheduled')::int     AS scheduled,
          count(*) FILTER (WHERE status = 'ended')::int         AS ended,
          COALESCE(SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt")))
                   FILTER (WHERE "endedAt" IS NOT NULL), 0)::int AS streamed_sec
        FROM auctions`),
      this.db.query(`
        SELECT
          count(*)::int                                                       AS total,
          count(*) FILTER (WHERE "paymentStatus" = 'paid')::int               AS paid,
          count(*) FILTER (WHERE "paymentStatus" <> 'paid')::int              AS unpaid,
          count(*) FILTER (WHERE "isGiveaway")::int                           AS giveaways,
          COALESCE(SUM("totalCents") FILTER (WHERE "paymentStatus" = 'paid'), 0)::bigint AS revenue_cents,
          COALESCE(SUM("totalCents"), 0)::bigint                              AS gmv_cents
        FROM orders`),
      this.db.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE auto)::int AS automatic,
               count(DISTINCT "bidderId")::int   AS bidders
        FROM bids`),
      this.db.query(`
        SELECT COALESCE(SUM("watchedSec"), 0)::bigint AS watched_sec,
               count(DISTINCT "userId")::int          AS viewers
        FROM live_attendance`),
      this.db.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = 'drawn')::int AS drawn
        FROM raffles`),
    ]);

    const revenueCents = Number(orders[0].revenue_cents);
    return {
      users: users[0],
      auctions: { ...auctions[0], streamedMinutes: Math.round(auctions[0].streamed_sec / 60) },
      orders: {
        ...orders[0],
        revenueCents,
        gmvCents: Number(orders[0].gmv_cents),
        commissionCents: Math.round(revenueCents * AdminService.COMMISSION),
      },
      bids: bids[0],
      watch: { watchedMinutes: Math.round(Number(minutes[0].watched_sec) / 60), viewers: minutes[0].viewers },
      raffles: raffles[0],
    };
  }

  /** One row per seller: what they streamed, sold and earned. */
  async sellers(limit = 50) {
    return this.db.query(
      `
      SELECT
        u.username,
        u.id::text                                                       AS "userId",
        u."isVerified"                                                   AS verified,
        COALESCE(a.lives, 0)::int                                        AS lives,
        COALESCE(a.streamed_min, 0)::int                                 AS "streamedMinutes",
        COALESCE(o.orders, 0)::int                                       AS orders,
        COALESCE(o.revenue, 0)::bigint                                   AS "revenueCents",
        COALESCE(b.bids, 0)::int                                         AS "bidsReceived",
        COALESCE(w.watched_min, 0)::int                                  AS "audienceMinutes",
        COALESCE(w.viewers, 0)::int                                      AS viewers
      FROM users u
      LEFT JOIN (
        SELECT "sellerId",
               count(*) AS lives,
               COALESCE(SUM(EXTRACT(EPOCH FROM ("endedAt" - "startedAt"))) / 60, 0) AS streamed_min
        FROM auctions GROUP BY "sellerId"
      ) a ON a."sellerId" = u.id
      LEFT JOIN (
        SELECT "sellerId",
               count(*) AS orders,
               SUM("totalCents") FILTER (WHERE "paymentStatus" = 'paid') AS revenue
        FROM orders GROUP BY "sellerId"
      ) o ON o."sellerId" = u.id::text
      LEFT JOIN (
        SELECT au."sellerId", count(*) AS bids
        FROM bids bd
        JOIN auction_items ai ON ai.id = bd."auctionItemId"
        JOIN auctions au ON au.id = ai."auctionId"
        GROUP BY au."sellerId"
      ) b ON b."sellerId" = u.id
      LEFT JOIN (
        SELECT au."sellerId",
               SUM(la."watchedSec") / 60 AS watched_min,
               count(DISTINCT la."userId") AS viewers
        FROM live_attendance la
        JOIN auctions au ON au.id::text = la."auctionId"
        GROUP BY au."sellerId"
      ) w ON w."sellerId" = u.id
      WHERE u.role IN ('seller', 'admin')
      ORDER BY COALESCE(o.revenue, 0) DESC, COALESCE(a.lives, 0) DESC
      LIMIT $1`,
      [limit],
    );
  }

  /** One row per buyer: what they watched, bid and bought. */
  async buyers(limit = 50) {
    return this.db.query(
      `
      SELECT
        u.username,
        u.id::text                          AS "userId",
        COALESCE(o.orders, 0)::int          AS orders,
        COALESCE(o.spent, 0)::bigint        AS "spentCents",
        COALESCE(o.giveaways, 0)::int       AS giveaways,
        COALESCE(b.bids, 0)::int            AS bids,
        COALESCE(w.watched_min, 0)::int     AS "watchedMinutes",
        COALESCE(w.lives, 0)::int           AS "livesAttended"
      FROM users u
      LEFT JOIN (
        SELECT "buyerId",
               count(*) AS orders,
               SUM("totalCents") FILTER (WHERE "paymentStatus" = 'paid') AS spent,
               count(*) FILTER (WHERE "isGiveaway") AS giveaways
        FROM orders GROUP BY "buyerId"
      ) o ON o."buyerId" = u.id::text
      LEFT JOIN (
        SELECT "bidderId", count(*) AS bids FROM bids GROUP BY "bidderId"
      ) b ON b."bidderId" = u.id
      LEFT JOIN (
        SELECT "userId", SUM("watchedSec") / 60 AS watched_min, count(*) AS lives
        FROM live_attendance GROUP BY "userId"
      ) w ON w."userId" = u.id::text
      WHERE COALESCE(o.orders, 0) > 0 OR COALESCE(b.bids, 0) > 0 OR COALESCE(w.watched_min, 0) > 0
      ORDER BY COALESCE(o.spent, 0) DESC, COALESCE(b.bids, 0) DESC
      LIMIT $1`,
      [limit],
    );
  }
}
