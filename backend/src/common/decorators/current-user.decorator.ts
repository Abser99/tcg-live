import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../users/user.entity';

/**
 * Resolve what @CurrentUser hands a controller. Exported so the rule can be tested
 * directly — Nest hides the decorator's own factory behind metadata.
 */
export function resolveCurrentUser<K extends keyof User>(
  user: User | undefined,
  field?: K,
): User | User[K] | undefined {
  if (!user) return undefined;
  return field ? user[field] : user;
}

/**
 * The authenticated user, or one of its fields.
 *
 *   @CurrentUser() user: User        → the whole user
 *   @CurrentUser('id') id: string    → just that field
 *
 * The field form must be honoured: several controllers ask for 'id' and store the
 * result as a foreign key, so returning the whole object silently writes a serialized
 * user into an id column.
 */
export const CurrentUser = createParamDecorator(
  <K extends keyof User>(field: K | undefined, ctx: ExecutionContext) =>
    resolveCurrentUser<K>(ctx.switchToHttp().getRequest().user, field),
);
