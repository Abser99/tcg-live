import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

interface PokeballProps {
  size?: number;
  spinning?: boolean;
  topColor?: string;
}

export default function Pokeball({ size = 40, spinning = false, topColor = '#EF4444' }: PokeballProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const borderW = Math.max(1.5, Math.round(size / 24));
  const btnR = Math.round(size / 8);
  const lineH = Math.max(2, Math.round(size / 18));

  useEffect(() => {
    if (!spinning) { spin.setValue(0); return; }
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [spinning]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[{ width: size, height: size }, spinning && { transform: [{ rotate }] }]}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        overflow: 'hidden', borderWidth: borderW, borderColor: '#1A1A1A',
      }}>
        <View style={{ width: size, height: size / 2, backgroundColor: topColor }} />
        <View style={{ width: size, height: size / 2, backgroundColor: '#F5F5F5' }} />
      </View>
      {/* Belt */}
      <View style={{
        position: 'absolute',
        top: size / 2 - lineH / 2,
        left: 0, right: 0,
        height: lineH,
        backgroundColor: '#1A1A1A',
      }} />
      {/* Center button */}
      <View style={{
        position: 'absolute',
        top: size / 2 - btnR,
        left: size / 2 - btnR,
        width: btnR * 2, height: btnR * 2,
        borderRadius: btnR,
        backgroundColor: '#F5F5F5',
        borderWidth: borderW,
        borderColor: '#1A1A1A',
      }} />
    </Animated.View>
  );
}
