declare module '@capacitor/core' {
  export const Capacitor: {
    isNativePlatform: () => boolean;
    getPlatform: () => string;
  };
}

declare module '@capacitor/app' {
  export const App: {
    addListener: (eventName: string, listenerFunc: Function) => { remove: () => void };
  };
}

declare module '@capacitor/haptics' {
  export const Haptics: {
    impact: (options?: any) => Promise<void>;
    notification: (options?: any) => Promise<void>;
    vibrate: (options?: any) => Promise<void>;
    selectionStart: () => Promise<void>;
    selectionChanged: () => Promise<void>;
    selectionEnd: () => Promise<void>;
  };
  export enum ImpactStyle {
    Heavy = 'HEAVY',
    Medium = 'MEDIUM',
    Light = 'LIGHT',
  }
}
