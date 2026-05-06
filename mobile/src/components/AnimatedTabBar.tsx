import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, spacing } from '../theme';
import Pokeball from './Pokeball';

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Auctions: { active: 'storefront', inactive: 'storefront-outline' },
  Shop:     { active: 'cart',       inactive: 'cart-outline' },
  Profile:  { active: 'person',     inactive: 'person-outline' },
};

const TAB_LABELS: Record<string, string> = {
  Auctions: 'Subastas',
  Shop:     'Tienda',
  Profile:  'Perfil',
};

// Per-tab accent colors for the active pill
const TAB_COLORS: Record<string, string> = {
  Auctions: colors.primary,
  Shop:     colors.accent,
  Profile:  colors.gold,
};

function TabItem({
  routeName,
  label,
  iconName,
  isFocused,
  onPress,
}: {
  routeName: string;
  label: string;
  iconName: { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap };
  isFocused: boolean;
  onPress: () => void;
}) {
  const accentColor = TAB_COLORS[routeName] ?? colors.primary;

  const scale        = useRef(new Animated.Value(isFocused ? 1 : 1)).current;
  const pillWidth    = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const pillOpacity  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const glowOpacity  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelOpacity = useRef(new Animated.Value(isFocused ? 1 : 0.45)).current;
  const labelScale   = useRef(new Animated.Value(isFocused ? 1 : 0.88)).current;
  const iconY        = useRef(new Animated.Value(isFocused ? -2 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: isFocused ? 1.12 : 1,
        useNativeDriver: true,
        friction: 5,
        tension: 200,
      }),
      Animated.spring(pillWidth, {
        toValue: isFocused ? 1 : 0,
        useNativeDriver: true,
        friction: 6,
        tension: 160,
      }),
      Animated.timing(pillOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: isFocused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(labelOpacity, {
        toValue: isFocused ? 1 : 0.4,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.spring(labelScale, {
        toValue: isFocused ? 1 : 0.88,
        useNativeDriver: true,
        friction: 8,
      }),
      Animated.spring(iconY, {
        toValue: isFocused ? -2 : 0,
        useNativeDriver: true,
        friction: 7,
        tension: 160,
      }),
    ]).start();
  }, [isFocused]);

  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.iconContainer}>
        {/* Outer diffuse glow */}
        <Animated.View
          style={[
            styles.glowOuter,
            { opacity: Animated.multiply(glowOpacity, 0.45), backgroundColor: accentColor + '22' },
          ]}
        />
        {/* Active pill background */}
        <Animated.View
          style={[
            styles.activePill,
            {
              opacity: pillOpacity,
              backgroundColor: accentColor + '20',
              borderColor: accentColor + '44',
              transform: [{ scaleX: pillWidth }],
            },
          ]}
        />
        {/* Icon */}
        <Animated.View style={{ transform: [{ scale }, { translateY: iconY }] }}>
          <Ionicons
            name={isFocused ? iconName.active : iconName.inactive}
            size={24}
            color={isFocused ? accentColor : colors.textMuted}
          />
        </Animated.View>
        {/* Pokeball indicator dot — replaces the floating one below */}
        {isFocused && (
          <View style={[styles.activeIndicatorDot, { backgroundColor: accentColor }]} />
        )}
      </View>

      <Animated.Text
        style={[
          styles.label,
          isFocused && [styles.labelActive, { color: accentColor }],
          { opacity: labelOpacity, transform: [{ scale: labelScale }] },
        ]}
      >
        {TAB_LABELS[routeName] ?? label}
      </Animated.Text>
    </TouchableOpacity>
  );
}

export default function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Gradient-style top border: purple → transparent → purple */}
      <View style={styles.topBorderWrap}>
        <View style={[styles.topBorderSegment, { backgroundColor: colors.border }]} />
        <View style={[styles.topBorderCenter, { backgroundColor: colors.primary + '66' }]} />
        <View style={[styles.topBorderSegment, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.innerBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label = (options.title ?? route.name) as string;
          const icon = TAB_ICONS[route.name];

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              label={label}
              iconName={icon}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface + 'F8',
    borderTopWidth: 0,
  },
  topBorderWrap: {
    flexDirection: 'row',
    height: 1.5,
  },
  topBorderSegment: {
    flex: 1,
  },
  topBorderCenter: {
    flex: 1,
  },
  innerBar: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  iconContainer: {
    width: 56,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: 56,
    height: 40,
    borderRadius: radius.lg,
  },
  activePill: {
    position: 'absolute',
    width: 52,
    height: 34,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  activeIndicatorDot: {
    position: 'absolute',
    bottom: 1,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: font.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
