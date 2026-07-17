export interface AuthProfileBundle {
  version: 1;
  kind: "auth";
  createdAt: string;
  storageState: unknown;
}

export interface ProfileExportResult {
  kind: "auth";
  path?: string;
  content?: string;
}

export interface ProfileImportResult {
  kind: "auth";
  profileDirectory: string;
}

export interface ProfileListResult {
  kind: "auth";
  profileDirectory: string;
  authStatePath: string;
  imported: boolean;
  sites: Array<{
    site: string;
    cookies: number;
    origins: string[];
  }>;
}

export interface ProfileClearResult {
  kind: "auth";
  profileDirectory: string;
  removed: boolean;
  url?: string;
  removedCookies?: number;
  removedOrigins?: string[];
}

export type AuthStateApplier = (profileDirectory: string, storageState: unknown) => Promise<void>;

export interface NormalizedProfileUrl {
  href: string;
  origin: string;
  host: string;
}

