import type { CapacitorConfig } from '@capacitor/cli'

const origin = process.env.CALENDARX_ANDROID_ORIGIN || 'https://calendarx.xeroneon.dev'

const config: CapacitorConfig = {
  appId: 'dev.calendarx.app',
  appName: 'CalendarX',
  webDir: '../../apps/web/dist/client',
  android: { allowMixedContent: false },
  server: {
    androidScheme: 'https',
    // Hybrid wrapper: the native shell loads the deployed web app over HTTPS.
    // Injected from CALENDARX_ANDROID_ORIGIN in CI; defaults to the production origin so a
    // local 'cap sync' also bakes a live URL (never a dead placeholder).
    url: origin,
  },
}

export default config