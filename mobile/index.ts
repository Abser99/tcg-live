// Must be first — manually polyfills DOMException before livekit-client loads
import './polyfills';
import '@livekit/react-native';

import { registerRootComponent } from 'expo';
import App from './App';

try {
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
} catch (e) {
  console.warn('LiveKit registerGlobals failed:', e);
}

registerRootComponent(App);
