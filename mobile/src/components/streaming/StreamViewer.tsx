import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Room, RoomEvent, Track, RemoteVideoTrack, ConnectionState } from 'livekit-client';
import { VideoView, AudioSession } from '@livekit/react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../theme';

interface Props {
  wsUrl: string;
  token: string;
  fill?: boolean;
}

export default function StreamViewer({ wsUrl, token, fill }: Props) {
  const roomRef = useRef<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [videoTrack, setVideoTrack] = useState<RemoteVideoTrack | undefined>();

  useEffect(() => {
    const room = new Room({
      reconnectPolicy: { maxRetries: 5, minReconnectWait: 1000, maxReconnectWait: 10000 },
    });
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) setVideoTrack(track as RemoteVideoTrack);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) setVideoTrack(undefined);
    });
    room.on(RoomEvent.Reconnecting, () => setReconnecting(true));
    room.on(RoomEvent.Reconnected,  () => setReconnecting(false));
    room.on(RoomEvent.Disconnected, () => {
      setReconnecting(false);
      setVideoTrack(undefined);
    });

    const start = async () => {
      try {
        await AudioSession.startAudioSession();
        await room.connect(wsUrl, token);
      } finally {
        setConnecting(false);
      }
    };
    start();

    return () => {
      room.disconnect();
      AudioSession.stopAudioSession();
    };
  }, [wsUrl, token]);

  const containerStyle = fill
    ? [styles.container, styles.containerFill]
    : styles.container;

  const placeholderStyle = fill
    ? [styles.placeholder, styles.containerFill]
    : styles.placeholder;

  if (connecting) {
    return <View style={placeholderStyle}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!videoTrack) {
    return (
      <View style={placeholderStyle}>
        <Ionicons name="videocam-off-outline" size={32} color={colors.textMuted} />
        <Text style={styles.offlineText}>Stream no iniciado</Text>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <VideoView videoTrack={videoTrack} style={styles.video} objectFit={fill ? 'contain' : 'cover'} />
      {reconnecting ? (
        <View style={[styles.liveBadge, styles.reconnectingBadge]}>
          <ActivityIndicator size="small" color={colors.white} style={{ transform: [{ scale: 0.65 }] }} />
          <Text style={styles.liveText}>Reconectando...</Text>
        </View>
      ) : (
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>EN VIVO</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
  },
  containerFill: {
    aspectRatio: undefined,
    flex: 1,
    borderRadius: 0,
  },
  video: { width: '100%', height: '100%' },
  placeholder: {
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  offlineText: { color: colors.textMuted, fontSize: font.sm },
  liveBadge: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full,
  },
  reconnectingBadge: { backgroundColor: colors.warning },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: font.sm, fontWeight: '800' },
});
