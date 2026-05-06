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
  const scale        = useRef(new Animated.Value(isFocused ? 1.15 : 1)).current;
  const glowOpacity  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelOpacity = useRef(new Animated.Value(isFocused ? 1 : 0.45)).current;
  const pokeOpacity  = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const labelScale   = useRef(new Animated.Value(isFocused ? 1 : 0.85)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: isFocused ? 1.2 : 1, useNativeDriver: true, friction: 5, tension: 180 }),
      Animated.timing(glowOpacity,  { toValue: isFocused ? 1 : 0,    duration: 200, useNativeDriver: true }),
      Animated.timing(labelOpacity, { toValue: isFocused ? 1 : 0.4,  duration: 160, useNativeDriver: true }),
      Animated.timing(pokeOpacity,  { toValue: isFocused ? 1 : 0,    duration: 220, useNativeDriver: true }),
      Animated.spring(labelScale,   { toValue: isFocused ? 1 : 0.88, useNativeDriver: true, friction: 8 }),
    ]).start();
  }, [isFocused]);

  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        {/* Diffuse glow background */}
        <Animated.View style={[styles.glowOuter, { opacity: Animated.multiply(glowOpacity, 0.5) }]} />
        {/* Inner glow */}
        <Animated.View style={[styles.glowInner, { opacity: glowOpacity }]} />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons
            name={isFocused ? iconName.active : iconName.inactive}
            size={24}
            color={isFocused ? colors.gold : colors.textMuted}
          />
        </Animated.View>
      </View>
      <Animated.Text
        style={[styles.label, isFocused && styles.labelActive, { opacity: labelOpacity, transform: [{ scale: labelScale }] }]}
      >
        {TAB_LABELS[routeName] ?? label}
      </Animated.Text>
      <Animated.View style={{ opacity: pokeOpacity }}>
        <Pokeball size={12} topColor={colors.error} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Top accent border: brighter center, fades to edges */}
      <View style={styles.topBorder} />

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
  topBorder: {
    height: 1.5,
    backgroundColor: colors.border,
    marginHorizontal: 0,
  },
  innerBar: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingBottom: 2,
  },
  iconContainer: {
    width: 52,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOuter: {
    position: 'absolute',
    width: 52,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: colors.gold + '18',
  },
  glowInner: {
    position: 'absolute',
    width: 38,
    height: 30,
    borderRadius: radius.md,
    backgroundColor: colors.gold + '28',
  },
  label: {
    fontSize: font.xs,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.gold,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
});
