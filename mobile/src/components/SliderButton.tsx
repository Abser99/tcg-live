import React, { useRef } from 'react';
import {
  View, Text, Animated, PanResponder, StyleSheet, LayoutChangeEvent, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, font } from '../theme';

interface Props {
  label: string;
  onSlide: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const THUMB = 52;

export default function SliderButton({ label, onSlide, disabled, loading }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const trackWidth = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled && !loading,
      onMoveShouldSetPanResponder: () => !disabled && !loading,
      onPanResponderMove: (_, g) => {
        const max = trackWidth.current - THUMB - 4;
        translateX.setValue(Math.max(0, Math.min(g.dx, max)));
      },
      onPanResponderRelease: (_, g) => {
        const max = trackWidth.current - THUMB - 4;
        if (max > 0 && g.dx >= max * 0.8) {
          Animated.spring(translateX, { toValue: max, useNativeDriver: true }).start(() => {
            onSlide();
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <View
      style={[styles.track, (disabled || loading) && styles.disabled]}
      onLayout={onLayout}
    >
      <Text style={styles.label}>{label}</Text>
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        {loading
          ? <ActivityIndicator size="small" color={colors.white} />
          : <Ionicons name="chevron-forward-outline" size={22} color={colors.white} />
        }
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.35, borderColor: colors.border },
  label: {
    flex: 1,
    textAlign: 'center',
    color: colors.primaryLight,
    fontSize: font.md,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  thumb: {
    position: 'absolute',
    left: 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
