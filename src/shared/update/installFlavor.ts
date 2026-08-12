export type InstallFlavor = 'tauri-updater' | 'flatpak' | 'deb-or-other';

/** Pure helper for tests and for documenting detection order. */
export function flavorFromEnv(env: {
  appImage?: string;
  flatpakId?: string;
  flatpakInfoExists: boolean;
}): InstallFlavor {
  if (env.flatpakId || env.flatpakInfoExists) return 'flatpak';
  if (env.appImage) return 'tauri-updater';
  return 'deb-or-other';
}
