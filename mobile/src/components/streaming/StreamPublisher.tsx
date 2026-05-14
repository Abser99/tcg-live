import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Room, RoomEvent, Track, LocalVideoTrack } from 'livekit-client';
import { VideoView, AudioSession } from '@livekit/react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, font } from '../../theme';

interface Props {
  wsUrl: string;
  token: string;
  onStop: () => void;
  /** Called when user taps "Reintentar" — parent should re-fetch the token and pass new props. */
  onRetry?: () => void;
}

export default function StreamPublisher({ wsUrl, token, onStop, onRetry }: Props) {
  const roomRef = useRef<Room | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectError, setConnectError] = useState(false);
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | undefined>();
  const [micMuted, setMicMuted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConnecting(true);
    setConnectError(false);
    setVideoTrack(undefined);

    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.LocalTrackPublished, (pub) => {
      if (pub.source === Track.Source.Camera && pub.videoTrack) {
        setVideoTrack(pub.videoTrack as LocalVideoTrack);
      }
    });

    const start = async () => {
      try {
        await AudioSession.startAudioSession();
        await room.connect(wsUrl, token);
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch {
        if (!cancelled) setConnectError(true);
      } finally {
        if (!cancelled) setConnecting(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      room.disconnect();
      AudioSession.stopAudioSession();
    };
  }, [wsUrl, token]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micMuted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMicMuted(next);
  };

  const handleStop = async () => {
    roomRef.current?.disconnect();
    await AudioSession.stopAudioSession();
    onStop();
  };

  if (connecting) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.placeholderText}>Conectando stream...</Text>
      </View>
    );
  }

  if (connectError) {
    return (
      <View style={styles.placeholder}>
        <Ionicons name="cloud-offline-outline" size={32} color={colors.error + '88'} />
        <Text style={styles.placeholderText}>Stream no disponible — intenta de nuevo</Text>
        <View style={styles.errorActions}>
          {onRetry && (
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
              <Ionicons name="refresh-outline" size={16} color={colors.white} />
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.backBtn} onPress={onStop}>
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoTrack ? (
        <VideoView videoTrack={videoTrack} style={styles.video} mirror objectFit="cover" />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.placeholderText}>Iniciando cámara...</Text>
        </View>
      )}

      <View style={styles.controls}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>EN VIVO</Text>
        </View>

        <View style={styles.rightControls}>
          <TouchableOpacity style={styles.iconBtn} onPress={toggleMic}>
            <Ionicons
              name={micMuted ? 'mic-off-outline' : 'mic-outline'}
              size={22}
              color={micMuted ? colors.error : colors.white}
            />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, styles.stopBtn]} onPress={handleStop}>
            <Ionicons name="stop-circle-outline" size={22} color={colors.white} />
            <Text style={styles.stopText}>Terminar stream</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surface, aspectRatio: 16 / 9 },
  video: { width: '100%', height: '100%' },
  placeholder: { aspectRatio: 16 / 9, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.sm },
  placeholderText: { color: colors.textMuted, fontSize: font.sm },
  errorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: radius.md,
  },
  retryText: { color: colors.white, fontSize: font.sm, fontWeight: '700' },
  backBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.textMuted, fontSize: font.sm, fontWeight: '600' },
  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.sm, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.error, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  liveText: { color: colors.white, fontSize: font.sm, fontWeight: '800' },
  rightControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { padding: 6 },
  stopBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: spacing.sm, borderRadius: radius.full },
  stopText: { color: colors.white, fontSize: font.sm, fontWeight: '600' },
});
