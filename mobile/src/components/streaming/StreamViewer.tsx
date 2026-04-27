import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Room, RoomEvent, Track, RemoteVideoTrack } from 'livekit-client';
import { VideoView, AudioSession } from '@livekit/react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../theme';

interface Props {
  wsUrl: string;
  token: string;
}

export default function StreamViewer({ wsUrl, token }: Props) {
  const roomRef = useRef<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [videoTrack, setVideoTrack] = useState<RemoteVideoTrack | undefined>();

  useEffect(() => {
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        setVideoTrack(track as RemoteVideoTrack);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) {
        setVideoTrack(undefined);
      }
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

  if (connecting) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!videoTrack) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="videocam-off-outline" size={32} color={colors.textMuted} />
        <Text style={styles.offlineText}>Stream no iniciado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView videoTrack={videoTrack} style={styles.video} objectFit="cover" />
      <View style={styles.liveBadge}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>EN VIVO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: colors.surface },
  video: { width: '100%', height: '100%' },
  placeholder: { aspectRatio: 16 / 9, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm },
  offlineText: { color: colors.textMuted, fontSize: font.sm },
  liveBadge: {
    position: 'absolute', top: spacing.sm, left: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.error, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: font.sm, fontWeight: '800' },
});
