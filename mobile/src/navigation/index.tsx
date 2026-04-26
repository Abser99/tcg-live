import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/auth.store';
import { colors } from '../theme';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import AuctionListScreen from '../screens/auctions/AuctionListScreen';
import AuctionDetailScreen from '../screens/auctions/AuctionDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ApplySellerScreen from '../screens/profile/ApplySellerScreen';
import AdminApplicationsScreen from '../screens/profile/AdminApplicationsScreen';

import { AuthStackParamList, AppStackParamList, ProfileStackParamList, TabParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function AuctionsStack() {
  return (
    <AppStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: colors.bg } }}>
      <AppStack.Screen name="AuctionList" component={AuctionListScreen} options={{ title: 'Subastas' }} />
      <AppStack.Screen name="AuctionDetail" component={AuctionDetailScreen} options={{ title: 'Detalle' }} />
    </AppStack.Navigator>
  );
}

function ProfileNavigator() {
  const screenOptions = { headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, headerTitleStyle: { fontWeight: '700' as const }, contentStyle: { backgroundColor: colors.bg } };
  return (
    <ProfileStack.Navigator screenOptions={screenOptions}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'Perfil' }} />
      <ProfileStack.Screen name="ApplySeller" component={ApplySellerScreen} options={{ title: 'Ser vendedor' }} />
      <ProfileStack.Screen name="AdminApplications" component={AdminApplicationsScreen} options={{ title: 'Solicitudes' }} />
    </ProfileStack.Navigator>
  );
}

function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primaryLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
            Auctions: { active: 'storefront', inactive: 'storefront-outline' },
            Profile: { active: 'person', inactive: 'person-outline' },
          };
          const icon = icons[route.name];
          return <Ionicons name={focused ? icon.active : icon.inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Auctions" component={AuctionsStack} options={{ title: 'Subastas' }} />
      <Tab.Screen name="Profile" component={ProfileNavigator} options={{ title: 'Perfil', headerShown: false }} />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { token, isInitialized, initialize } = useAuthStore();

  useEffect(() => { initialize(); }, []);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {token ? (
        <AppTabs />
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
