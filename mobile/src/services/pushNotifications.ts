import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';
import { api } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // push tokens don't work on simulators

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

export async function sendTokenToBackend(token: string): Promise<void> {
  try {
    await api.post('/notifications/push-token', { token });
  } catch {
    // Non-critical — push token registration failure shouldn't break the app
  }
}

/**
 * Set up a listener so tapping a push notification navigates to the right screen.
 * Returns a cleanup function — call it in a useEffect return.
 */
export function setupNotificationListeners(
  navRef: NavigationContainerRef<any>,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    if (!navRef.isReady()) return;
    switch (data?.type) {
      case 'auction_win':
      case 'order_confirmed':
      case 'order_shipped':
        navRef.navigate('Profile' as never, { screen: 'MyOrders' } as never);
        break;
      case 'new_order':
        navRef.navigate('Profile' as never, { screen: 'SellerDashboard' } as never);
        break;
      case 'order_delivered':
        navRef.navigate('Profile' as never, { screen: 'SellerDashboard' } as never);
        break;
    }
  });
  return () => sub.remove();
}
