import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { setupNotificationListeners } from '../services/pushNotifications';

import { useAuthStore } from '../store/auth.store';
import { colors } from '../theme';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import AuctionListScreen from '../screens/auctions/AuctionListScreen';
import AuctionDetailScreen from '../screens/auctions/AuctionDetailScreen';
import SellerProfileScreen from '../screens/profile/SellerProfileScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ApplySellerScreen from '../screens/profile/ApplySellerScreen';
import AdminApplicationsScreen from '../screens/profile/AdminApplicationsScreen';
import SellerDashboardScreen from '../screens/seller/SellerDashboardScreen';
import CreateAuctionScreen from '../screens/seller/CreateAuctionScreen';
import ManageAuctionScreen from '../screens/seller/ManageAuctionScreen';
import MyOrdersScreen from '../screens/profile/MyOrdersScreen';
import MyBidsScreen from '../screens/profile/MyBidsScreen';
import AddressSettingsScreen from '../screens/profile/AddressSettingsScreen';
import PaymentMethodsScreen from '../screens/profile/PaymentMethodsScreen';
import AuctionOrdersScreen from '../screens/seller/AuctionOrdersScreen';
import ShippingSettingsScreen from '../screens/seller/ShippingSettingsScreen';
import MessageThreadScreen from '../screens/profile/MessageThreadScreen';

import { AuthStackParamList, AppStackParamList, ProfileStackParamList, TabParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.bg },
};

function AuctionsStack() {
  return (
    <AppStack.Navigator screenOptions={stackScreenOptions}>
      <AppStack.Screen name="AuctionList" component={AuctionListScreen} options={{ title: 'Subastas' }} />
      <AppStack.Screen name="AuctionDetail" component={AuctionDetailScreen} options={{ title: 'Detalle' }} />
      <AppStack.Screen name="SellerProfile" component={SellerProfileScreen} options={({ route }) => ({ title: 'Vendedor' })} />
    </AppStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={stackScreenOptions}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'Perfil' }} />
      <ProfileStack.Screen name="ApplySeller" component={ApplySellerScreen} options={{ title: 'Ser vendedor' }} />
      <ProfileStack.Screen name="AdminApplications" component={AdminApplicationsScreen} options={{ title: 'Solicitudes' }} />
      <ProfileStack.Screen name="SellerDashboard" component={SellerDashboardScreen} options={{ title: 'Mis Subastas' }} />
      <ProfileStack.Screen name="CreateAuction" component={CreateAuctionScreen} options={{ title: 'Nueva Subasta' }} />
      <ProfileStack.Screen name="ManageAuction" component={ManageAuctionScreen} options={{ title: 'Gestionar Subasta' }} />
      <ProfileStack.Screen name="MyOrders" component={MyOrdersScreen} options={{ title: 'Mis Compras' }} />
      <ProfileStack.Screen name="MyBids" component={MyBidsScreen} options={{ title: 'Mis Pujas' }} />
      <ProfileStack.Screen name="AuctionOrders" component={AuctionOrdersScreen} options={({ route }) => ({ title: route.params.title })} />
      <ProfileStack.Screen name="ShippingSettings" component={ShippingSettingsScreen} options={{ title: 'Configurar Envíos' }} />
      <ProfileStack.Screen name="AddressSettings" component={AddressSettingsScreen} options={{ title: 'Mi Dirección' }} />
      <ProfileStack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ title: 'Formas de Pago' }} />
      <ProfileStack.Screen name="OrderMessages" component={MessageThreadScreen} options={{ title: 'Mensajes' }} />
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
  const navRef = useNavigationContainerRef();

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    if (!isInitialized || !token) return;
    return setupNotificationListeners(navRef);
  }, [isInitialized, token]);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
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
