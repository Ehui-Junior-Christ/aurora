import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aurora.app',
  appName: 'aurora',
  webDir: 'out',
  server: {
    // Serve the bundled app over https://localhost and forbid cleartext HTTP.
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
