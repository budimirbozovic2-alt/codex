/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

// Browser API augmentation for non-standard APIs
interface Window {
  webkitAudioContext: typeof AudioContext;
  requestIdleCallback(callback: IdleRequestCallback, options?: IdleRequestOptions): number;
  cancelIdleCallback(handle: number): void;
}
