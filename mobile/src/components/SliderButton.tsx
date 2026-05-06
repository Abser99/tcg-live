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

const THUMB = 58;
const PADDING = 3;

export default function SliderButton({ label, onSlide, disabled, loading, color }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-60)).current;
  const labelOpacity = useRef(new Animated.Value(1)).current;
  const trackWidth = useRef(0);
  const disabledRef = useRef(disabled);
  const loadingRef = useRef(loading);
  const onSlideRef = useRef(onSlide);
  const shimmerAnim = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { onSlideRef.current = onSlide; }, [onSlide]);

  // Shimmer animation
  useEffect(() => {
    if (disabled || loading) {
      shimmerAnim.current?.stop();
      shimmerX.setValue(-60);
      return;
    }

    const startShimmer = () => {
      shimmerAnim.current = Animated.loop(
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(shimmerX, {
            toValue: trackWidth.current + 60,
            duration: 1600,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerX, {
            toValue: -60,
            duration: 0,
            useNativeDriver: false,
          }),
        ]),
      );
      shimmerAnim.current.start();
    };

    startShimmer();
    return () => { shimmerAnim.current?.stop(); };
  }, [disabled, loading, shimmerX]);

  const onLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
    if (!disabledRef.current && !loadingRef.current) {
      shimmerAnim.current?.stop();
      shimmerAnim.current = Animated.loop(
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(shimmerX, {
            toValue: trackWidth.current + 60,
            duration: 1600,
            useNativeDriver: false,
          }),
          Animated.timing(shimmerX, { toValue: -60, duration: 0, useNativeDriver: false }),
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
      onPanResponderGrant: () => {
        // Fade label slightly as thumb moves
        Animated.timing(labelOpacity, { toValue: 0.5, duration: 150, useNativeDriver: true }).start();
      },
      onPanResponderMove: (_, g) => {
        const max = trackWidth.current - THUMB - PADDING * 2;
        translateX.setValue(Math.max(0, Math.min(g.dx, max)));
      },
      onPanResponderRelease: (_, g) => {
        Animated.timing(labelOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        const max = trackWidth.current - THUMB - PADDING * 2;
        if (max > 0 && g.dx >= max * 0.78) {
          Animated.spring(translateX, { toValue: max, useNativeDriver: true, tension: 180, friction: 8 }).start(() => {
            onSlideRef.current();
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 100, friction: 7 }).start();
          });
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 120, friction: 6 }).start();
        }
      },
    }),
  ).current;

  const accentColor = color ?? colors.primary;
  const isActive = !disabled && !loading;

  return (
    <View
      style={[
        styles.track,
        { borderColor: accentColor + (isActive ? 'AA' : '44'), backgroundColor: accentColor + '14' },
        !isActive && styles.disabled,
      ]}
      onLayout={onLayout}
    >
      {/* Shimmer sweep */}
      <Animated.View
        style={[styles.shimmer, { left: shimmerX }]}
        pointerEvents="none"
      />

      {/* Label */}
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]}>
        {label}
      </Animated.Text>

      {/* Thumb */}
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: accentColor,
            transform: [{ translateX }],
            shadowColor: accentColor,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.6,
            shadowRadius: 8,
            elevation: 8,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <View style={styles.thumbIconRow}>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            <Ionicons name="chevron-forward" size={18} color={colors.white} style={{ marginLeft: -10 }} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + PADDING * 2,
    borderRadius: radius.full,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.28 },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    // Angled shimmer effect via skew is not natively available, so we use a wider band
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.md,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.7)',
    paddingLeft: THUMB,  // offset so text sits to the right of thumb start
  },
  thumb: {
    position: 'absolute',
    left: PADDING,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
