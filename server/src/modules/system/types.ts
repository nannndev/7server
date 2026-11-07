export interface SwapStatus {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  swappiness: number;
  vfsCachePressure: number;
  swapFileExists: boolean;
  swapFilePath: string;
  diskFreeMB: number;
  activeSwaps: { filename: string; type: string; sizeKB: number; usedKB: number; priority: number }[];
}

export interface SystemTuningStatus {
  swap: SwapStatus;
  hostname: string;
  timezone: string;
  bbrEnabled: boolean;
  fileMax: number;
  somaxconn: number;
}

export interface ConfigureSwapPayload {
  sizeMB: number;
  swappiness?: number;
  vfsCachePressure?: number;
}

export interface ConfigureSystemPayload {
  hostname?: string;
  timezone?: string;
  bbr?: boolean;
  optimizeLimits?: boolean;
}

