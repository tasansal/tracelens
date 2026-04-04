/**
 * Storage configuration panel for settings window.
 * Pure credential storage - no file URLs.
 */
import type { StorageConfig } from '@/shared/api/tauri/storage';
import { Checkbox } from '@/shared/ui/checkbox';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { cn } from '@/shared/utils/cn';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';

const tabItems = [
  { value: 'performance', title: 'Performance', caption: 'I/O geometry' },
  { value: 's3', title: 'AWS S3', caption: 'Keys + region' },
  { value: 'gcs', title: 'Google Cloud', caption: 'Auth modes' },
  { value: 'azure', title: 'Azure Blob', caption: 'SAS, key, or identity' },
  { value: 'http', title: 'HTTP', caption: 'Timeouts' },
] as const;

const labelClassName = 'text-xs font-mono uppercase tracking-[0.2em] text-text-dim';
const inputClassName =
  'h-11 rounded-[12px] border border-border bg-panel-strong px-3 py-2 text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel';
const cardClassName =
  'rounded-[20px] border border-border bg-panel-strong p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const softCardClassName = 'rounded-[16px] border border-border bg-panel-muted p-4';

const clampChunkSize = (value: number) => Math.min(Math.max(value, 2), 32);
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
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  if (!storageConfig) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-text-muted">
        Loading storage settings...
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

  const togglePasswordVisibility = (field: string) => {
    setShowPassword(prev => ({ ...prev, [field]: !prev[field] }));
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
      <div className="rounded-[16px] border border-border bg-panel-muted p-4">
        <p className="text-xs text-text-dim">
          <strong className="text-text">Ephemeral Configuration:</strong> Credentials are
          session-only and used when opening cloud files. If empty, defaults to provider chains (env
          vars, IAM roles, ADC, etc.)
        </p>
      </div>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="inline-flex w-full flex-wrap gap-2 rounded-[18px] border border-border bg-panel-muted p-2">
          {tabItems.map(item => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="flex-1 min-w-[140px] flex flex-col items-start gap-1 rounded-[14px] border border-transparent px-3 py-2 text-left text-xs font-semibold normal-case tracking-[0.08em] text-text-muted transition duration-200 hover:border-border hover:bg-panel-strong data-[state=active]:border-[rgba(255,255,255,0.08)] data-[state=active]:bg-panel data-[state=active]:text-text data-[state=active]:shadow-[0_10px_30px_-18px_var(--accent-glow)]"
            >
              <span className="text-xs font-semibold">{item.title}</span>
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-dim">
                {item.caption}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold">I/O Geometry</h3>
                <p className="text-xs text-text-dim">
                  Tune remote reads for latency versus throughput.
                </p>
              </div>
              <div className="grid gap-4">
                <div className={softCardClassName}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <Label htmlFor="chunkSize" className={labelClassName}>
                      Chunk Size
                    </Label>
                    <span className="text-xs font-mono text-text">
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
                    className="range-slider mt-3 h-1 w-full accent-accent"
                  />
                  <p className="text-xs text-text-dim mt-3">
                    Remote reads split into 2-32 MB slices.
                  </p>
                </div>

                <div className={softCardClassName}>
                  <Label htmlFor="sparseThreshold" className={labelClassName}>
                    Sparse Threshold
                  </Label>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Input
                      id="sparseThreshold"
                      type="number"
                      min={1}
                      value={storageConfig.performance.sparseThreshold}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const nextValue = Math.max(1, parseInt(e.target.value, 10) || 64);
                        updatePerformance({ sparseThreshold: nextValue });
                      }}
                      className={cn(inputClassName, 'w-24 text-right font-mono')}
                    />
                    <p className="text-xs text-text-dim">
                      Switch to chunked access after this trace count.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </TabsContent>

          {/* AWS S3 Tab */}
          <TabsContent value="s3" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold">AWS S3 Credentials</h3>
                <p className="text-xs text-text-dim">
                  Used when opening s3:// files. Leave empty to use env vars or IAM roles.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="s3Region" className={labelClassName}>
                    Region
                  </Label>
                  <Input
                    id="s3Region"
                    placeholder="us-east-1"
                    value={storageConfig.awsS3?.region || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateS3Config({ region: e.target.value });
                    }}
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3AccessKey" className={labelClassName}>
                    Access Key ID
                  </Label>
                  <div className="relative">
                    <Input
                      id="s3AccessKey"
                      type={showPassword.s3AccessKey ? 'text' : 'password'}
                      placeholder="AKIA..."
                      value={storageConfig.awsS3?.accessKeyId || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateS3Config({ accessKeyId: e.target.value || undefined });
                      }}
                      className={inputClassName}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('s3AccessKey')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
                    >
                      {showPassword.s3AccessKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s3SecretKey" className={labelClassName}>
                    Secret Access Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="s3SecretKey"
                      type={showPassword.s3SecretKey ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={storageConfig.awsS3?.secretAccessKey || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateS3Config({ secretAccessKey: e.target.value || undefined });
                      }}
                      className={inputClassName}
                    />
                    <button
                      type="button"
                      onClick={() => togglePasswordVisibility('s3SecretKey')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
                    >
                      {showPassword.s3SecretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Anonymous Access Checkbox - Auto-computed */}
              <div className={cn(softCardClassName, 'mt-4')}>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="s3SkipSignature"
                    checked={storageConfig.awsS3?.skipSignature ?? false}
                    onCheckedChange={checked => {
                      updateS3Config({ skipSignature: checked === true });
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label htmlFor="s3SkipSignature" className="text-sm font-medium text-text">
                      Anonymous Access (Public Buckets)
                    </Label>
                    <p className="text-xs text-text-dim mt-1">
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
              <button
                type="button"
                onClick={() => toggleSection('s3-advanced')}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold">Advanced Options</h3>
                  <p className="text-xs text-text-dim">
                    Session tokens and custom endpoints for S3-compatible services.
                  </p>
                </div>
                {expandedSections['s3-advanced'] ? (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-muted" />
                )}
              </button>

              {expandedSections['s3-advanced'] && (
                <div className="mt-4 grid gap-4 md:grid-cols-2 animate-[rise-in_0.2s_ease-out]">
                  <div className="space-y-2">
                    <Label htmlFor="s3SessionToken" className={labelClassName}>
                      Session Token
                    </Label>
                    <div className="relative">
                      <Input
                        id="s3SessionToken"
                        type={showPassword.s3SessionToken ? 'text' : 'password'}
                        placeholder="Temporary credentials"
                        value={storageConfig.awsS3?.sessionToken || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          updateS3Config({ sessionToken: e.target.value || undefined });
                        }}
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility('s3SessionToken')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
                      >
                        {showPassword.s3SessionToken ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s3Endpoint" className={labelClassName}>
                      Custom Endpoint
                    </Label>
                    <Input
                      id="s3Endpoint"
                      placeholder="https://s3.example.com (MinIO, etc.)"
                      value={storageConfig.awsS3?.endpoint || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        updateS3Config({ endpoint: e.target.value || undefined });
                      }}
                      className={inputClassName}
                    />
                  </div>
                </div>
              )}
            </section>
          </TabsContent>

          {/* GCS Tab */}
          <TabsContent value="gcs" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Google Cloud Storage Credentials</h3>
                <p className="text-xs text-text-dim">
                  Used when opening `gs://` files. Choose one auth mode; defaults to ADC.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gcsAuthMode" className={labelClassName}>
                    Auth Mode
                  </Label>
                  <select
                    id="gcsAuthMode"
                    value={gcsAuthMode}
                    onChange={e => setGcsAuthMode(e.target.value as GcsAuthMode)}
                    className={cn(inputClassName, 'pr-10')}
                  >
                    <option value="adc">Application Default Credentials (ADC)</option>
                    <option value="serviceAccountPath">Service Account JSON Path</option>
                    <option value="serviceAccountJson">Inline Service Account JSON</option>
                    <option value="applicationCredentials">Explicit ADC File Path</option>
                    <option value="anonymous">Anonymous (Public Buckets)</option>
                  </select>
                </div>

                {gcsAuthMode === 'adc' && (
                  <div className={softCardClassName}>
                    <p className="text-xs text-text-dim">
                      Uses the ambient Google ADC chain (`GOOGLE_APPLICATION_CREDENTIALS`, gcloud
                      local auth, or workload identity metadata).
                    </p>
                  </div>
                )}

                {gcsAuthMode === 'serviceAccountPath' && (
                  <div className="space-y-2">
                    <Label htmlFor="gcsServiceAccountPath" className={labelClassName}>
                      Service Account JSON Path
                    </Label>
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
                      className={inputClassName}
                    />
                  </div>
                )}

                {gcsAuthMode === 'serviceAccountJson' && (
                  <div className="space-y-2">
                    <Label htmlFor="gcsServiceAccountJson" className={labelClassName}>
                      Inline Service Account JSON
                    </Label>
                    <textarea
                      id="gcsServiceAccountJson"
                      placeholder='{"type":"service_account","project_id":"..."}'
                      value={storageConfig.gcpGcs?.serviceAccountKey || ''}
                      onChange={e => {
                        updateGcsConfig({
                          serviceAccountKey: e.target.value,
                          skipSignature: false,
                        });
                      }}
                      className="min-h-[132px] w-full rounded-[12px] border border-border bg-panel-strong px-3 py-2 text-sm text-text placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
                      spellCheck={false}
                    />
                  </div>
                )}

                {gcsAuthMode === 'applicationCredentials' && (
                  <div className="space-y-2">
                    <Label htmlFor="gcsApplicationCredentialsPath" className={labelClassName}>
                      ADC File Path
                    </Label>
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
                      className={inputClassName}
                    />
                  </div>
                )}

                {gcsAuthMode === 'anonymous' && (
                  <div className={softCardClassName}>
                    <p className="text-xs text-text-dim">
                      Skips request signing. Use this only for public buckets that reject signed
                      requests.
                    </p>
                  </div>
                )}

                <div className={softCardClassName}>
                  <p className="text-xs text-text-dim">
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
              <div className="mb-4">
                <h3 className="text-sm font-semibold">Azure Blob Storage Credentials</h3>
                <p className="text-xs text-text-dim">
                  Used for <span className="font-mono">az://</span> and Azure Blob HTTPS URLs. Keep
                  credentials empty to use managed identity / environment-based auth.
                </p>
              </div>
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="azureAccount" className={labelClassName}>
                    Account Name
                  </Label>
                  <Input
                    id="azureAccount"
                    placeholder="mystorageaccount"
                    value={storageConfig.azureBlob?.accountName || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateAzureConfig({ accountName: e.target.value });
                    }}
                    className={inputClassName}
                  />
                  <p className="text-xs text-text-dim">
                    Optional for{' '}
                    <span className="font-mono">
                      https://&lt;account&gt;.blob.core.windows.net/...
                    </span>
                    URLs (auto-detected from URL host).
                  </p>
                </div>

                <div className={softCardClassName}>
                  <Label htmlFor="azureAuthMode" className={labelClassName}>
                    Authentication Mode
                  </Label>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {azureAuthOptions.map(option => {
                      const isActive = azureAuthMode === option.mode;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          onClick={() => setAzureAuthMode(option.mode)}
                          className={cn(
                            'rounded-[12px] border px-3 py-3 text-left transition-colors',
                            isActive
                              ? 'border-accent bg-panel text-text shadow-[0_10px_30px_-18px_var(--accent-glow)]'
                              : 'border-border bg-panel-strong text-text-muted hover:bg-panel'
                          )}
                        >
                          <div className="text-sm font-semibold">{option.title}</div>
                          <div className="mt-1 text-xs text-text-dim">{option.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {azureAuthMode === 'auto' && (
                  <div className={softCardClassName}>
                    <p className="text-xs text-text-dim">
                      Auto mode keeps auth simple: explicit credentials are disabled, so Azure auth
                      comes from URL SAS, environment variables, or managed identity.
                    </p>
                  </div>
                )}

                {azureAuthMode === 'sas' && (
                  <div className="space-y-2">
                    <Label htmlFor="azureSasToken" className={labelClassName}>
                      SAS Token
                    </Label>
                    <div className="relative">
                      <Input
                        id="azureSasToken"
                        type={showPassword.azureSasToken ? 'text' : 'password'}
                        placeholder="sv=2024-...&sig=..."
                        value={storageConfig.azureBlob?.sasToken || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          updateAzureConfig({
                            sasToken: normalizeAzureSasToken(e.target.value),
                          });
                        }}
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility('azureSasToken')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
                      >
                        {showPassword.azureSasToken ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-text-dim">
                      Paste token with or without leading <span className="font-mono">?</span>.
                    </p>
                  </div>
                )}

                {azureAuthMode === 'accessKey' && (
                  <div className="space-y-2">
                    <Label htmlFor="azureAccessKey" className={labelClassName}>
                      Account Access Key
                    </Label>
                    <div className="relative">
                      <Input
                        id="azureAccessKey"
                        type={showPassword.azureAccessKey ? 'text' : 'password'}
                        placeholder="Base64-encoded account key"
                        value={storageConfig.azureBlob?.accessKey || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          updateAzureConfig({
                            accessKey: e.target.value,
                          });
                        }}
                        className={inputClassName}
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility('azureAccessKey')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-text-dim transition-colors hover:bg-panel-muted hover:text-text"
                      >
                        {showPassword.azureAccessKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-text-dim">
                      Broadly scoped credential. Prefer SAS where possible for least privilege.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className={cardClassName}>
              <button
                type="button"
                onClick={() => toggleSection('azure-advanced')}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold">Advanced Options</h3>
                  <p className="text-xs text-text-dim">
                    Custom endpoint for Azurite or private Azure cloud endpoints.
                  </p>
                </div>
                {expandedSections['azure-advanced'] ? (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-text-muted" />
                )}
              </button>

              {expandedSections['azure-advanced'] && (
                <div className="mt-4 space-y-2 animate-[rise-in_0.2s_ease-out]">
                  <Label htmlFor="azureEndpoint" className={labelClassName}>
                    Custom Endpoint
                  </Label>
                  <Input
                    id="azureEndpoint"
                    placeholder="https://account.blob.core.windows.net"
                    value={storageConfig.azureBlob?.endpoint || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      updateAzureConfig({ endpoint: e.target.value || undefined });
                    }}
                    className={inputClassName}
                  />
                </div>
              )}
            </section>

            <section className={softCardClassName}>
              <p className="text-xs text-text-dim">
                Azure credential priority: explicit SAS token, then explicit access key, then SAS
                from URL query, then ambient Azure credentials.
              </p>
            </section>
          </TabsContent>

          {/* HTTP Tab */}
          <TabsContent value="http" className="space-y-6">
            <section className={cardClassName}>
              <div className="mb-4">
                <h3 className="text-sm font-semibold">HTTP Access</h3>
                <p className="text-xs text-text-dim">
                  Request timeouts and custom headers for HTTP and HTTPS object stores.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="httpTimeout" className={labelClassName}>
                  Timeout (seconds)
                </Label>
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
                  className={inputClassName}
                />
              </div>
            </section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
