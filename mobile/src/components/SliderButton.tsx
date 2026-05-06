import React, { useRef, useEffect } from 'react';
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
  color?: string;
}

const THUMB = 56;

export default function SliderButton({ label, onSlide, disabled, loading, color }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-40)).current;
  const trackWidth = useRef(0);
  const disabledRef = useRef(disabled);
  const loadingRef = useRef(loading);
  const onSlideRef = useRef(onSlide);
  const shimmerAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { onSlideRef.current = onSlide; }, [onSlide]);

  // Shimmer animation — runs only when not disabled or loading
  useEffect(() => {
    if (disabled || loading) {
      shimmerAnim.current?.stop();
      shimmerX.setValue(-40);
      return;
    }

    shimmerAnim.current = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: trackWidth.current + 40,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(shimmerX, {
          toValue: -40,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    shimmerAnim.current.start();

    return () => {
      shimmerAnim.current?.stop();
    };
  }, [disabled, loading, shimmerX]);

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
    // Restart shimmer with correct width once we know the track size
    if (!disabledRef.current && !loadingRef.current) {
      shimmerAnim.current?.stop();
      shimmerAnim.current = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerX, {
            toValue: trackWidth.current + 40,
            duration: 2000,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerX, {
            toValue: -40,
            duration: 0,
            useNativeDriver: false,
          }),
        ]),
      );
      shimmerAnim.current.start();
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !loadingRef.current,
      onStartShouldSetPanResponderCapture: () => !disabledRef.current && !loadingRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current && !loadingRef.current,
      onMoveShouldSetPanResponderCapture: () => !disabledRef.current && !loadingRef.current,
      onPanResponderMove: (_, g) => {
        const max = trackWidth.current - THUMB - 4;
        translateX.setValue(Math.max(0, Math.min(g.dx, max)));
      },
      onPanResponderRelease: (_, g) => {
        const max = trackWidth.current - THUMB - 4;
        if (max > 0 && g.dx >= max * 0.8) {
          Animated.spring(translateX, { toValue: max, useNativeDriver: true }).start(() => {
            onSlideRef.current();
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const accentColor = color ?? colors.primary;

  return (
    <View
      style={[
        styles.track,
        { borderColor: accentColor, backgroundColor: accentColor + '18' },
        (disabled || loading) && styles.disabled,
      ]}
      onLayout={onLayout}
    >
      {/* Shimmer band */}
      <Animated.View
        style={[styles.shimmer, { left: shimmerX }]}
        pointerEvents="none"
      />

      <Text style={styles.label}>{label}</Text>

      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: accentColor,
            transform: [{ translateX }],
            shadowColor: accentColor,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.5,
            shadowRadius: 6,
            elevation: 6,
          },
        ]}
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
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.25, borderColor: colors.border },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.md,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.65)',
  },
  thumb: {
    position: 'absolute',
    left: 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
