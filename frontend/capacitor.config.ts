import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.igorculafic.commandcenter',
  appName: 'Command Center',
  webDir: 'dist',
  // Load the UI from the server instead of the bundled copy, so frontend updates
  // go live on next launch with NO reinstall (run scripts/deploy-frontend.ps1 to
  // publish a new UI). Reinstall the APK only for native-shell changes.
  // `webDir` is still required by the CLI but is unused while `server.url` is set.
  server: {
    url: 'https://igorc-1.tailac7b3.ts.net',
  },
}

export default config
