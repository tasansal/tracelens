/**
 * Checks GitHub Releases for a newer TraceLens build and, with the user's
 * consent, downloads, installs, and relaunches into it. Best-effort: any
 * failure (offline, signature mismatch, etc.) is logged and swallowed so a
 * failed update check never disrupts app startup.
 */
import { ask } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

export async function checkForUpdates(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    const shouldInstall = await ask(
      `TraceLens ${update.version} is available. Download and restart to update now?`,
      { title: 'Update available', kind: 'info', okLabel: 'Update', cancelLabel: 'Later' }
    );
    if (!shouldInstall) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.error('Update check failed:', error);
  }
}
