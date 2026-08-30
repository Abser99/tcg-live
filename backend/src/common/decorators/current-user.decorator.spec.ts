/**
 * Regression: the decorator used to ignore its argument, so `@CurrentUser('id')`
 * handed controllers the entire User. The value is typed loosely, so nothing
 * complained — it was written straight into id columns (followed_sellers.userId,
 * auction_templates.sellerId), corrupting them with a serialized user object.
 */
import { User } from '../../users/user.entity';
import { resolveCurrentUser } from './current-user.decorator';

const user = { id: 'user-123', username: 'ana_collector', email: 'ana@tcg.mx' } as User;

describe('resolveCurrentUser — what @CurrentUser hands a controller', () => {
  it('returns just the id when asked for "id"', () => {
    expect(resolveCurrentUser(user, 'id')).toBe('user-123');
  });

  it('never returns the whole user for a field request', () => {
    expect(resolveCurrentUser(user, 'id')).not.toEqual(user);
    expect(typeof resolveCurrentUser(user, 'id')).toBe('string');
    expect(typeof resolveCurrentUser(user, 'username')).toBe('string');
  });

  it('returns the requested field, not merely the first one', () => {
    expect(resolveCurrentUser(user, 'username')).toBe('ana_collector');
    expect(resolveCurrentUser(user, 'email')).toBe('ana@tcg.mx');
  });

  it('returns the whole user when no field is given', () => {
    expect(resolveCurrentUser(user)).toEqual(user);
  });

  it('is undefined when the request is unauthenticated', () => {
    expect(resolveCurrentUser(undefined, 'id')).toBeUndefined();
    expect(resolveCurrentUser(undefined)).toBeUndefined();
  });
});
