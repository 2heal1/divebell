export type CliUpdateAction =
  | "already_current"
  | "update_available"
  | "updated"
  | "skipped";

export interface CliUpdateNotice {
  fromVersion: string;
  toVersion: string;
  completedAtMs: number;
}

export interface CliUpdateResult {
  action: CliUpdateAction;
  automatic: boolean;
  currentVersion: string;
  latestVersion: string | null;
  installedVersion: string;
  updaterId: string;
  message: string;
}

export interface DivebellCliUpdater {
  id: string;
  displayName: string;
  currentVersion: string;
  installationId: string;
  automaticUpdateIntervalMs?: number;
  disableAutomaticUpdateEnvironmentVariable?: string;
  canScheduleAutomaticUpdate(env: NodeJS.ProcessEnv): boolean;
  isManagedInstallation(env: NodeJS.ProcessEnv): Promise<boolean>;
  getLatestVersion(env: NodeJS.ProcessEnv): Promise<string>;
  installVersion(version: string, env: NodeJS.ProcessEnv): Promise<void>;
  formatUpdatedNotice?(notice: CliUpdateNotice): string;
}
