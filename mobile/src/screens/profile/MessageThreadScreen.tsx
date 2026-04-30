import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { io, Socket } from 'socket.io-client';
import { messagesApi } from '../../api/messages';
import { WS_URL } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import { Message } from '../../types';
import { ProfileStackParamList } from '../../navigation/types';
import { colors, spacing, radius, font } from '../../theme';

type Props = NativeStackScreenProps<ProfileStackParamList, 'OrderMessages'>;

export default function MessageThreadScreen({ route, navigation }: Props) {
  const { orderId, otherUsername } = route.params;
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    navigation.setOptions({ title: `@${otherUsername}` });
  }, [otherUsername]);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await messagesApi.list(orderId);
      setMessages(data);
    } catch {
      // silent — socket will still work
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${WS_URL}/messages`, { auth: { token }, transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('messages:join', orderId);
    });

    socket.on('messages:new', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.emit('messages:leave', orderId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, orderId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = () => {
    const body = input.trim().slice(0, 500);
    if (!body || !socketRef.current?.connected || sending) return;
    setSending(true);
    socketRef.current.emit('messages:send', { orderId, body });
    setInput('');
    setSending(false);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={m => m.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Ningún mensaje aún. Di hola!</Text>
          </View>
        }
        renderItem={({ item: msg }) => {
          const isMine = msg.senderId === user?.id;
          return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
              {!isMine && (
                <Text style={styles.senderName}>@{msg.senderUsername}</Text>
              )}
              <Text style={[styles.msgBody, isMine ? styles.msgBodyMine : styles.msgBodyTheirs]}>
                {msg.body}
              </Text>
              <Text style={[styles.msgTime, isMine ? styles.msgTimeMine : styles.msgTimeTheirs]}>
                {new Date(msg.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Escribe un mensaje..."
          placeholderTextColor={colors.textMuted}
          maxLength={500}
          multiline
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || sending}
        >
          <Text style={styles.sendBtnText}>Enviar</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  listContent: { padding: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  empty: { flex: 1, alignItems: 'center', paddingTop: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: font.md },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: spacing.sm },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  senderName: { color: colors.primaryLight, fontSize: font.xs, fontWeight: '700', marginBottom: 2 },
  msgBody: { fontSize: font.md, lineHeight: 20 },
  msgBodyMine: { color: '#fff' },
  msgBodyTheirs: { color: colors.text },
  msgTime: { fontSize: font.xs, marginTop: 4, alignSelf: 'flex-end' },
  msgTimeMine: { color: 'rgba(255,255,255,0.6)' },
  msgTimeTheirs: { color: colors.textMuted },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    color: colors.text, fontSize: font.md, maxHeight: 100,
  },
  sendBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  sendBtnDisabled: { backgroundColor: colors.textMuted },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: font.sm },
});
