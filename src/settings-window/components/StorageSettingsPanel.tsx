/**
 * Storage configuration panel for settings window.
 * Pure credential storage - no file URLs.
 *
 * Typography (Task 4.2 / 4.2-mono + 4.3 final sweep): All help text, explanations, section intros, and OptionTile
 * descriptions use proportional `text-[length:var(--text-xs,10px)] text-text-dim` (or base Label `text-sm font-medium` for
 * field labels). No .text-eyebrow or mono on prose/sentences. Matches design-language.md rules and
 * AppearanceSettings pattern. Inline technical identifiers (s3://, az://, JSON keys, etc.) retain
 * `font-mono` spans inside the proportional wrappers. Form Labels no longer force dim mono uppercase.
 * Custom provider tabs Triggers use justified local `text-xs font-semibold normal-case tracking-[0.08em]`
 * (part of Task 3.4 custom segmented surface; see inline comment + design doc Typography exceptions).
 * See design-language.md §Typography for rationale and before/after. 4.3 sweep confirmed mono-prose fixes
 * + overall consistency (no new leaks; tabs exception now explicitly recorded). No regressions.
 */
import type { StorageConfig } from '@/shared/api/tauri/storage';
import { Button } from '@/shared/ui/button';
import { cardClassName, softCardClassName } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { NativeSelect } from '@/shared/ui/native-select';
import { OptionTile } from '@/shared/ui/option-tile';
import { PasswordInput } from '@/shared/ui/password-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import { cn } from '@/shared/utils/cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const tabItems = [
  { value: 'performance', title: 'Performance', caption: 'I/O geometry' },
  { value: 's3', title: 'AWS S3', caption: 'Keys + region' },
  { value: 'gcs', title: 'Google Cloud', caption: 'Auth modes' },
  { value: 'azure', title: 'Azure Blob', caption: 'SAS, key, or identity' },
  { value: 'http', title: 'HTTP', caption: 'Timeouts' },
] as const;

const clampChunkSize = (value: number) => Math.min(Math.max(value, 2), 32);
const clampReadCache = (value: number) => Math.min(Math.max(value, 16), 512);
type GcsAuthMode =
  | 'adc'
  | 'serviceAccountPath'
  | 'serviceAccountJson'
  | 'applicationCredentials'
  | 'anonymous';

const detectGcsAuthMode = (gcs: StorageConfig['gcpGcs'] | undefined): GcsAuthMode => {
  if (!gcs) {
    return 'adc';
  }

  if (gcs.skipSignature) {
    return 'anonymous';
  }

  // Keep UI mode stable even when the selected field is currently empty.
  // Empty strings are normalized away in Rust before auth options are built.
  if (gcs.serviceAccountKey !== undefined) {
    return 'serviceAccountJson';
  }

  if (gcs.serviceAccountKeyPath !== undefined) {
    return 'serviceAccountPath';
  }

  if (gcs.applicationCredentialsPath !== undefined) {
    return 'applicationCredentials';
  }

  return 'adc';
};

type AzureAuthMode = 'auto' | 'sas' | 'accessKey';

const azureAuthOptions: Array<{
  mode: AzureAuthMode;
  title: string;
  description: string;
}> = [
  {
    mode: 'auto',
    title: 'Automatic',
    description: 'Use URL SAS if present, otherwise identity/env credentials.',
  },
  {
    mode: 'sas',
    title: 'SAS Token',
    description: 'Short-lived delegated access token.',
  },
  {
    mode: 'accessKey',
    title: 'Access Key',
    description: 'Account-level key for legacy or controlled environments.',
  },
];

/**
 * Storage settings panel component.
 *
 * @returns Tabbed storage configuration UI for cloud credentials and limits.
 */
export const StorageSettingsPanel = () => {
  const { storageConfig, setStorageConfig } = useSettingsStore();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  if (!storageConfig) {
    return (
      <div className="flex items-center justify-center py-12 text-[length:var(--text-sm,12px)] text-text-muted">
        Loading storage settings…
      </div>
    );
  }

  const updateConfig = (updater: (current: StorageConfig) => StorageConfig) => {
    setStorageConfig(updater(storageConfig));
  };

  const updatePerformance = (patch: Partial<StorageConfig['performance']>) => {
    updateConfig(prev => ({
      ...prev,
      performance: {
        ...prev.performance,
        ...patch,
      },
    }));
  };

  // Helper to check if S3 credentials are empty (after trimming whitespace)
  const hasS3Credentials = (config: typeof storageConfig.awsS3): boolean => {
    if (!config) return false;
    const hasAccessKey = config.accessKeyId?.trim() !== '' && config.accessKeyId !== undefined;
    const hasSecretKey =
      config.secretAccessKey?.trim() !== '' && config.secretAccessKey !== undefined;
    return hasAccessKey || hasSecretKey;
  };

  // Helper to update S3 config
  const updateS3Config = (updates: Partial<NonNullable<typeof storageConfig.awsS3>>) => {
    const current = storageConfig.awsS3 ?? { region: '', skipSignature: false };
    const newConfig = { ...current, ...updates };

    updateConfig(prev => ({
      ...prev,
      awsS3: newConfig,
    }));
  };

  const normalizeAzureSasToken = (value: string): string => value.trim().replace(/^\?+/, '');

  const updateAzureConfig = (updates: Partial<NonNullable<StorageConfig['azureBlob']>>) => {
    const current = storageConfig.azureBlob ?? { accountName: '' };
    updateConfig(prev => ({
      ...prev,
      azureBlob: {
        ...current,
        ...updates,
      },
    }));
  };

  const getAzureAuthMode = (): AzureAuthMode => {
    // Keep mode stable while fields are empty: presence of the field indicates user intent.
    if (storageConfig.azureBlob?.sasToken !== undefined) return 'sas';
    if (storageConfig.azureBlob?.accessKey !== undefined) return 'accessKey';
    return 'auto';
  };

  const setAzureAuthMode = (mode: AzureAuthMode) => {
    if (mode === 'auto') {
      updateAzureConfig({ sasToken: undefined, accessKey: undefined });
      return;
    }
    if (mode === 'sas') {
      updateAzureConfig({
        accessKey: undefined,
        sasToken: storageConfig.azureBlob?.sasToken ?? '',
      });
      return;
    }
    updateAzureConfig({
      sasToken: undefined,
      accessKey: storageConfig.azureBlob?.accessKey ?? '',
    });
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const gcsAuthMode = detectGcsAuthMode(storageConfig.gcpGcs);
  const azureAuthMode = getAzureAuthMode();

  const updateGcsConfig = (updates: Partial<NonNullable<StorageConfig['gcpGcs']>>) => {
    const current = storageConfig.gcpGcs ?? {};
    updateConfig(prev => ({
      ...prev,
      gcpGcs: {
        ...current,
        ...updates,
      },
    }));
  };

  const setGcsAuthMode = (mode: GcsAuthMode) => {
    const current = storageConfig.gcpGcs ?? {};
    const clearedAuth: NonNullable<StorageConfig['gcpGcs']> = {
      ...current,
      serviceAccountKeyPath: undefined,
      serviceAccountKey: undefined,
      applicationCredentialsPath: undefined,
      skipSignature: false,
    };

    if (mode === 'anonymous') {
      updateGcsConfig({ ...clearedAuth, skipSignature: true });
      return;
    }

    if (mode === 'serviceAccountPath') {
      updateGcsConfig({
        ...clearedAuth,
        serviceAccountKeyPath: current.serviceAccountKeyPath ?? '',
      });
      return;
    }

    if (mode === 'serviceAccountJson') {
      updateGcsConfig({ ...clearedAuth, serviceAccountKey: current.serviceAccountKey ?? '' });
      return;
    }

    if (mode === 'applicationCredentials') {
      updateGcsConfig({
        ...clearedAuth,
        applicationCredentialsPath: current.applicationCredentialsPath ?? '',
      });
      return;
    }

    updateGcsConfig(clearedAuth);
  };

  return (
    <div className="space-y-6 animate-[rise-in_0.35s_ease-out] motion-reduce:animate-none">
      <div className={softCardClassName}>
        <p className="text-[length:var(--text-xs,10px)] text-text-dim">
          <strong className="text-text">Ephemeral Configuration:</strong> Credentials are
          session-only and used when opening cloud files. If empty, defaults to provider chains (env
          vars, IAM roles, ADC, etc.)
        </p>
      </div>

      <Tabs defaultValue="performance" className="w-full">
        {/* Storage provider tabs use a customized treatment vs. the default compact pill/gradient style
           from `@/shared/ui/tabs` (see SegyHeaderPanel for default usage in viz chrome).
           - Wider, wrap-capable (5 items), larger targets suitable for settings form context.
           - Flat panel active (bg-panel + subtle border/shadow) instead of accent gradient pill.
           - Uses --radius-lg for blockier segmented feel.
           Typography note (4.3 sweep): Trigger uses text-xs font-semibold normal-case tracking-[0.08em]
           (mild spacing + weight for tab labels in this wide settings segmented; normal-case prevents
           uppercase). This is part of the intentional, justified custom surface (not a general leak or
           prose misuse). See design-language.md §Typography "Documented Typography Exceptions" and
           §Controls for the provider switcher treatment (Task 3.4). No other one-off tracking/sizes in file. */}
        <TabsList className="w-full gap-[var(--space-2)] p-[var(--space-2)] rounded-[var(--radius-lg)]">
          {tabItems.map(item => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="flex-1 min-w-[100px] rounded-[var(--radius-lg)] border border-transparent px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--text-xs,10px)] font-semibold normal-case tracking-[0.08em] text-text-muted transition duration-200 hover:border-border hover:bg-panel-strong data-[state=active]:border-[rgba(15,23,42,0.06)] data-[state=active]:bg-panel data-[state=active]:text-text data-[state=active]:shadow-[0_10px_30px_-18px_var(--accent-glow)]"
            >
              {item.title}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-[var(--space-4)]">
          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-[var(--space-4)]">
                <h3 className="text-[length:var(--text-sm,12px)] font-semibold">I/O Geometry</h3>
                <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                  Tune remote reads for latency versus throughput.
                </p>
              </div>
              <div className="grid gap-[var(--space-4)]">
                <div className={softCardClassName}>
                  <div className="flex items-center justify-between gap-[var(--space-3)] mb-[var(--space-2)]">
                    <Label htmlFor="chunkSize">Chunk Size</Label>
                    <span className="text-[length:var(--text-xs,10px)] font-mono text-text">
                      {storageConfig.performance.chunkSizeMb} MB
                    </span>
                  </div>
                  <input
                    id="chunkSize"
                    type="range"
                    min={2}
                    max={32}
                    value={storageConfig.performance.chunkSizeMb}
                    onChange={e => {
                      const nextValue = clampChunkSize(parseInt(e.target.value, 10) || 8);
                      updatePerformance({ chunkSizeMb: nextValue });
                    }}
                    className="range-slider mt-[var(--space-3)] w-full accent-accent"
                  />
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-3)]">
                    Remote reads split into 2-32 MB slices.
                  </p>
                </div>
                <div className={softCardClassName}>
                  <div className="flex items-center justify-between gap-[var(--space-3)] mb-[var(--space-2)]">
                    <Label htmlFor="readCache">Read Cache</Label>
                    <span className="text-[length:var(--text-xs,10px)] font-mono text-text">
                      {storageConfig.performance.readCacheMb} MB
                    </span>
                  </div>
                  <input
                    id="readCache"
                    type="range"
                    min={16}
                    max={512}
                    step={16}
                    value={storageConfig.performance.readCacheMb}
                    onChange={e => {
                      const nextValue = clampReadCache(parseInt(e.target.value, 10) || 32);
                      updatePerformance({ readCacheMb: nextValue });
                    }}
                    className="range-slider mt-[var(--space-3)] w-full accent-accent"
                  />
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-3)]">
                    Raw-byte chunks kept resident (~
                    {Math.max(
                      1,
                      Math.floor(
                        storageConfig.performance.readCacheMb /
                          Math.max(1, storageConfig.performance.chunkSizeMb)
                      )
                    )}{' '}
                    chunks). Larger keeps wide views hot across pan/zoom & AGC.
                  </p>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* AWS S3 Tab */}
          <TabsContent value="s3" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-[var(--space-4)]">
                <h3 className="text-[length:var(--text-sm,12px)] font-semibold">
                  AWS S3 Credentials
                </h3>
                <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                  Used when opening s3:// files. Leave empty to use env vars or IAM roles.
                </p>
              </div>
              <div className="grid gap-[var(--space-4)] md:grid-cols-2">
                <div className="space-y-[var(--space-2)]">
                  <Label htmlFor="s3Region">Region</Label>
                  <Input
                    id="s3Region"
                    placeholder="us-east-1"
                    value={storageConfig.awsS3?.region || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateS3Config({ region: e.target.value });
                    }}
                  />
                </div>
                <div className="space-y-[var(--space-2)]">
                  <Label htmlFor="s3AccessKey">Access Key ID</Label>
                  <PasswordInput
                    id="s3AccessKey"
                    placeholder="AKIA..."
                    value={storageConfig.awsS3?.accessKeyId || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateS3Config({ accessKeyId: e.target.value || undefined });
                    }}
                  />
                </div>
                <div className="space-y-[var(--space-2)]">
                  <Label htmlFor="s3SecretKey">Secret Access Key</Label>
                  <PasswordInput
                    id="s3SecretKey"
                    placeholder="••••••••••••••••"
                    value={storageConfig.awsS3?.secretAccessKey || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateS3Config({ secretAccessKey: e.target.value || undefined });
                    }}
                  />
                </div>
              </div>

              {/* Anonymous Access Checkbox - Auto-computed */}
              <div className={cn(softCardClassName, 'mt-[var(--space-4)]')}>
                <div className="flex items-start gap-[var(--space-3)]">
                  <Checkbox
                    id="s3SkipSignature"
                    checked={storageConfig.awsS3?.skipSignature ?? false}
                    onCheckedChange={checked => {
                      updateS3Config({ skipSignature: checked === true });
                    }}
                    className="mt-[var(--space-1)]"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="s3SkipSignature"
                      className="text-[length:var(--text-sm,12px)] font-medium text-text"
                    >
                      Anonymous Access (Public Buckets)
                    </Label>
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim mt-[var(--space-1)]">
                      {storageConfig.awsS3?.skipSignature
                        ? 'Requests are unsigned. Use this for public buckets and open data.'
                        : hasS3Credentials(storageConfig.awsS3)
                          ? 'Using explicit keys from this panel.'
                          : 'Using default AWS credential chain (env vars, IAM role, web identity, ECS/EKS metadata).'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Advanced S3 section */}
            <section className={cardClassName}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => toggleSection('s3-advanced')}
                className="flex w-full items-center justify-between text-left p-0 h-auto focus-ring"
              >
                <div>
                  <h3 className="text-[length:var(--text-sm,12px)] font-semibold">
                    Advanced Options
                  </h3>
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                    Session tokens and custom endpoints for S3-compatible services.
                  </p>
                </div>
                {expandedSections['s3-advanced'] ? (
                  <ChevronDown className="size-4 text-text-muted" />
                ) : (
                  <ChevronRight className="size-4 text-text-muted" />
                )}
              </Button>

              {expandedSections['s3-advanced'] && (
                <div className="mt-[var(--space-4)] grid gap-[var(--space-4)] md:grid-cols-2 animate-[rise-in_0.2s_ease-out]">
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="s3SessionToken">Session Token</Label>
                    <PasswordInput
                      id="s3SessionToken"
                      placeholder="Temporary credentials"
                      value={storageConfig.awsS3?.sessionToken || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateS3Config({ sessionToken: e.target.value || undefined });
                      }}
                    />
                  </div>
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="s3Endpoint">Custom Endpoint</Label>
                    <Input
                      id="s3Endpoint"
                      placeholder="https://s3.example.com (MinIO, etc.)"
                      value={storageConfig.awsS3?.endpoint || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateS3Config({ endpoint: e.target.value || undefined });
                      }}
                    />
                  </div>
                </div>
              )}
            </section>
          </TabsContent>

          {/* GCS Tab */}
          <TabsContent value="gcs" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-[var(--space-4)]">
                <h3 className="text-[length:var(--text-sm,12px)] font-semibold">
                  Google Cloud Storage Credentials
                </h3>
                <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                  Used when opening `gs://` files. Choose one auth mode; defaults to ADC.
                </p>
              </div>
              <div className="grid gap-[var(--space-4)]">
                <div className="space-y-[var(--space-2)]">
                  <Label htmlFor="gcsAuthMode">Auth Mode</Label>
                  <NativeSelect
                    id="gcsAuthMode"
                    value={gcsAuthMode}
                    onChange={e => setGcsAuthMode(e.target.value as GcsAuthMode)}
                    className="w-full"
                  >
                    <option value="adc">Application Default Credentials (ADC)</option>
                    <option value="serviceAccountPath">Service Account JSON Path</option>
                    <option value="serviceAccountJson">Inline Service Account JSON</option>
                    <option value="applicationCredentials">Explicit ADC File Path</option>
                    <option value="anonymous">Anonymous (Public Buckets)</option>
                  </NativeSelect>
                </div>

                {gcsAuthMode === 'adc' && (
                  <div className={softCardClassName}>
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                      Uses the ambient Google ADC chain (`GOOGLE_APPLICATION_CREDENTIALS`, gcloud
                      local auth, or workload identity metadata).
                    </p>
                  </div>
                )}

                {gcsAuthMode === 'serviceAccountPath' && (
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="gcsServiceAccountPath">Service Account JSON Path</Label>
                    <Input
                      id="gcsServiceAccountPath"
                      placeholder="/path/to/service-account.json"
                      value={storageConfig.gcpGcs?.serviceAccountKeyPath || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateGcsConfig({
                          serviceAccountKeyPath: e.target.value,
                          skipSignature: false,
                        });
                      }}
                    />
                  </div>
                )}

                {gcsAuthMode === 'serviceAccountJson' && (
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="gcsServiceAccountJson">Inline Service Account JSON</Label>
                    <Textarea
                      id="gcsServiceAccountJson"
                      placeholder='{"type":"service_account","project_id":"..."}'
                      value={storageConfig.gcpGcs?.serviceAccountKey || ''}
                      onChange={e => {
                        updateGcsConfig({
                          serviceAccountKey: e.target.value,
                          skipSignature: false,
                        });
                      }}
                      className="min-h-[132px]"
                      spellCheck={false}
                    />
                  </div>
                )}

                {gcsAuthMode === 'applicationCredentials' && (
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="gcsApplicationCredentialsPath">ADC File Path</Label>
                    <Input
                      id="gcsApplicationCredentialsPath"
                      placeholder="/path/to/application_default_credentials.json"
                      value={storageConfig.gcpGcs?.applicationCredentialsPath || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateGcsConfig({
                          applicationCredentialsPath: e.target.value,
                          skipSignature: false,
                        });
                      }}
                    />
                  </div>
                )}

                {gcsAuthMode === 'anonymous' && (
                  <div className={softCardClassName}>
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                      Skips request signing. Use this only for public buckets that reject signed
                      requests.
                    </p>
                  </div>
                )}

                <div className={softCardClassName}>
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                    Resolution order: <span className="font-mono">inline JSON</span> then{' '}
                    <span className="font-mono">service account path</span> then{' '}
                    <span className="font-mono">ADC file path</span>, otherwise ambient ADC.
                  </p>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* Azure Tab */}
          <TabsContent value="azure" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-[var(--space-4)]">
                <h3 className="text-[length:var(--text-sm,12px)] font-semibold">
                  Azure Blob Storage Credentials
                </h3>
                <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                  Used for <span className="font-mono">az://</span> and Azure Blob HTTPS URLs. Keep
                  credentials empty to use managed identity / environment-based auth.
                </p>
              </div>
              <div className="grid gap-[var(--space-4)]">
                <div className="space-y-[var(--space-2)]">
                  <Label htmlFor="azureAccount">Account Name</Label>
                  <Input
                    id="azureAccount"
                    placeholder="mystorageaccount"
                    value={storageConfig.azureBlob?.accountName || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateAzureConfig({ accountName: e.target.value });
                    }}
                  />
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                    Optional for{' '}
                    <span className="font-mono">
                      https://&lt;account&gt;.blob.core.windows.net/...
                    </span>
                    URLs (auto-detected from URL host).
                  </p>
                </div>

                <div className={softCardClassName}>
                  <Label htmlFor="azureAuthMode">Authentication Mode</Label>
                  <div className="mt-[var(--space-3)] grid gap-[var(--space-2)] md:grid-cols-3">
                    {azureAuthOptions.map(option => (
                      <OptionTile
                        key={option.mode}
                        selected={azureAuthMode === option.mode}
                        onClick={() => setAzureAuthMode(option.mode)}
                      >
                        <div className="text-[length:var(--text-sm,12px)] font-semibold">
                          {option.title}
                        </div>
                        <div className="mt-[var(--space-1)] text-[length:var(--text-xs,10px)] text-text-dim">
                          {option.description}
                        </div>
                      </OptionTile>
                    ))}
                  </div>
                </div>

                {azureAuthMode === 'auto' && (
                  <div className={softCardClassName}>
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                      Auto mode keeps auth simple: explicit credentials are disabled, so Azure auth
                      comes from URL SAS, environment variables, or managed identity.
                    </p>
                  </div>
                )}

                {azureAuthMode === 'sas' && (
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="azureSasToken">SAS Token</Label>
                    <PasswordInput
                      id="azureSasToken"
                      placeholder="sv=2024-...&sig=..."
                      value={storageConfig.azureBlob?.sasToken || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateAzureConfig({
                          sasToken: normalizeAzureSasToken(e.target.value),
                        });
                      }}
                    />
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                      Paste token with or without leading <span className="font-mono">?</span>.
                    </p>
                  </div>
                )}

                {azureAuthMode === 'accessKey' && (
                  <div className="space-y-[var(--space-2)]">
                    <Label htmlFor="azureAccessKey">Account Access Key</Label>
                    <PasswordInput
                      id="azureAccessKey"
                      placeholder="Base64-encoded account key"
                      value={storageConfig.azureBlob?.accessKey || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateAzureConfig({
                          accessKey: e.target.value,
                        });
                      }}
                    />
                    <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                      Broadly scoped credential. Prefer SAS where possible for least privilege.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className={cardClassName}>
              <Button
                variant="ghost"
                type="button"
                onClick={() => toggleSection('azure-advanced')}
                className="flex w-full items-center justify-between text-left p-0 h-auto focus-ring"
              >
                <div>
                  <h3 className="text-[length:var(--text-sm,12px)] font-semibold">
                    Advanced Options
                  </h3>
                  <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                    Custom endpoint for Azurite or private Azure cloud endpoints.
                  </p>
                </div>
                {expandedSections['azure-advanced'] ? (
                  <ChevronDown className="size-4 text-text-muted" />
                ) : (
                  <ChevronRight className="size-4 text-text-muted" />
                )}
              </Button>

              {expandedSections['azure-advanced'] && (
                <div className="mt-[var(--space-4)] space-y-[var(--space-2)] animate-[rise-in_0.2s_ease-out]">
                  <Label htmlFor="azureEndpoint">Custom Endpoint</Label>
                  <Input
                    id="azureEndpoint"
                    placeholder="https://account.blob.core.windows.net"
                    value={storageConfig.azureBlob?.endpoint || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateAzureConfig({ endpoint: e.target.value || undefined });
                    }}
                  />
                </div>
              )}
            </section>

            <section className={softCardClassName}>
              <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                Azure credential priority: explicit SAS token, then explicit access key, then SAS
                from URL query, then ambient Azure credentials.
              </p>
            </section>
          </TabsContent>

          {/* HTTP Tab */}
          <TabsContent value="http" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-[var(--space-4)]">
                <h3 className="text-[length:var(--text-sm,12px)] font-semibold">HTTP Access</h3>
                <p className="text-[length:var(--text-xs,10px)] text-text-dim">
                  Request timeouts and custom headers for HTTP and HTTPS object stores.
                </p>
              </div>
              <div className="space-y-[var(--space-2)]">
                <Label htmlFor="httpTimeout">Timeout (seconds)</Label>
                <Input
                  id="httpTimeout"
                  type="number"
                  value={storageConfig.http?.timeoutSecs || 30}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const current = storageConfig.http ?? { headers: {}, timeoutSecs: 30 };
                    updateConfig(prev => ({
                      ...prev,
                      http: { ...current, timeoutSecs: parseInt(e.target.value, 10) || 30 },
                    }));
                  }}
                />
              </div>
            </section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
