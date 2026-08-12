import { getInstallFlavor, tryFlatpakUpdate } from '@/shared/api/tauri/desktop';
import { getVersion } from '@tauri-apps/api/app';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';

const RELEASES_LATEST = 'https://github.com/tasansal/tracelens/releases/latest';
const RELEASES_API = 'https://api.github.com/repos/tasansal/tracelens/releases/latest';

function normalizeTag(tag: string): string {
  return tag.startsWith('v') ? tag.slice(1) : tag;
}

async function latestReleaseVersion(): Promise<string | null> {
  const res = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { tag_name?: string };
  return data.tag_name ? normalizeTag(data.tag_name) : null;
}

async function checkTauriUpdater(): Promise<void> {
  const update: Update | null = await check();
  if (!update) return;

  const shouldInstall = await ask(
    `TraceLens ${update.version} is available. Download and restart to update now?`,
    { title: 'Update available', kind: 'info', okLabel: 'Update', cancelLabel: 'Later' }
  );
  if (!shouldInstall) return;

  await update.downloadAndInstall();
  await relaunch();
}

async function checkSidecarUpdate(flavor: 'flatpak' | 'deb-or-other'): Promise<void> {
  const current = await getVersion();
  const latest = await latestReleaseVersion();
  if (!latest || latest === current) return;

  if (flavor === 'flatpak') {
    const should = await ask(`TraceLens ${latest} is available. Update via Flatpak now?`, {
      title: 'Update available',
      kind: 'info',
      okLabel: 'Update',
      cancelLabel: 'Later',
    });
    if (!should) return;
    try {
      await tryFlatpakUpdate();
      await message('Update applied. Please restart TraceLens.', {
        title: 'Update installed',
        kind: 'info',
      });
    } catch (error) {
      console.error('Flatpak update failed:', error);
      const open = await ask(
        'Could not run Flatpak update from the app. Open the Releases page instead?',
        {
          title: 'Update available',
          kind: 'warning',
          okLabel: 'Open Releases',
          cancelLabel: 'Cancel',
        }
      );
      if (open) await openUrl(RELEASES_LATEST);
    }
    return;
  }

  const should = await ask(`TraceLens ${latest} is available. Open the download page?`, {
    title: 'Update available',
    kind: 'info',
    okLabel: 'Open Releases',
    cancelLabel: 'Later',
  });
  if (should) await openUrl(RELEASES_LATEST);
}

/**
 * Checks for updates using the backend appropriate to the current install.
 * Best-effort: failures are logged and swallowed so startup is never blocked.
 */
export async function checkForUpdates(): Promise<void> {
  try {
    const flavor = await getInstallFlavor();
    if (flavor === 'tauri-updater') {
      await checkTauriUpdater();
    } else {
      await checkSidecarUpdate(flavor);
    }
  } catch (error) {
    console.error('Update check failed:', error);
  }
}
