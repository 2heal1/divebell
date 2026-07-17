export interface AuthConnectorExportOptions {
  requestedUrl: string;
  outputPath?: string;
  timeout?: number;
  extensionDirectory?: string;
  extensionInstallUrl?: string;
  extensionIconPath?: string;
  browserOpener?: AuthConnectorBrowserOpener;
}

export interface AuthConnectorExtensionOptions {
  iconPath?: string;
}

export type AuthConnectorBrowserOpener = (url: string) => Promise<void>;

export interface AuthConnectorCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "no_restriction" | "lax" | "strict" | "unspecified";
  session?: boolean;
  expirationDate?: number;
  partitionKey?: {
    topLevelSite?: string;
  } | string | null;
}

export interface AuthConnectorStorageEntry {
  name: string;
  value: string;
}

export interface AuthConnectorOriginState {
  origin: string;
  localStorage?: AuthConnectorStorageEntry[];
  sessionStorage?: AuthConnectorStorageEntry[];
}

export interface AuthConnectorPayload {
  requestedUrl: string;
  exportedAt?: string;
  cookies: AuthConnectorCookie[];
  origins: AuthConnectorOriginState[];
}

export interface AuthConnectorStorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    partitionKey?: string;
  }>;
  origins: Array<{
    origin: string;
    localStorage: AuthConnectorStorageEntry[];
  }>;
}


export type AuthConnectorStatus = "waiting_for_extension" | "exporting" | "exported" | "error";

export interface AuthConnectorServerState {
  status: AuthConnectorStatus;
  message: string;
  token: string;
  requestedUrl: string;
  extensionDirectory: string;
  extensionInstallUrl?: string;
  openBrowser: AuthConnectorBrowserOpener;
  resolve(payload: AuthConnectorPayload): void;
  reject(error: Error): void;
}

