import { Socket } from 'socket.io';

export function extractWsToken(client: Socket): string | null {
  return (
    client.handshake.auth?.token ??
    client.handshake.headers?.authorization?.replace('Bearer ', '') ??
    null
  );
}
