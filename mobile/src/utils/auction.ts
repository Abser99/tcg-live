import { colors } from '../theme';
import { Auction } from '../types';

export function auctionStatusBadge(status: Auction['status']): { label: string; bg: string } {
  switch (status) {
    case 'live':      return { label: 'EN VIVO',  bg: colors.error };
    case 'scheduled': return { label: 'PRÓXIMO',  bg: colors.warning };
    case 'ended':     return { label: 'TERMINADA', bg: colors.textMuted };
    default:          return { label: status.toUpperCase(), bg: colors.textMuted };
  }
}
