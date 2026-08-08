import { Workbox } from 'workbox-window';

export interface PWAState {
  isOnline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  updateAvailable: boolean;
  swRegistered: boolean;
}

type PWAEventListener = (state: PWAState) => void;

class PWAManager {
  private listeners: PWAEventListener[] = [];
  private deferredPrompt: any = null;
  private wb: Workbox | null = null;

  public state: PWAState = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isInstallable: false,
    isInstalled: typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
    updateAvailable: false,
    swRegistered: false,
  };

  constructor() {
    if (typeof window === 'undefined') return;

    // Listen for online/offline browser events
    window.addEventListener('online', () => this.setOnlineStatus(true));
    window.addEventListener('offline', () => this.setOnlineStatus(false));

    // Listen for display mode changes (e.g. installed app mode)
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      this.state.isInstalled = e.matches;
      this.notify();
    });

    // Listen for PWA install prompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.state.isInstallable = true;
      this.notify();
    });

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.state.isInstallable = false;
      this.state.isInstalled = true;
      this.notify();
    });

    // Register Service Worker using Workbox if supported
    if ('serviceWorker' in navigator) {
      this.initSW();
    }
  }

  private initSW() {
    try {
      this.wb = new Workbox('/sw.js');

      this.wb.addEventListener('waiting', () => {
        console.log('[PWA] New version waiting to activate');
        this.state.updateAvailable = true;
        this.notify();
      });

      this.wb.addEventListener('controlling', () => {
        console.log('[PWA] Service worker taking control - reloading window');
        window.location.reload();
      });

      this.wb.register().then(() => {
        this.state.swRegistered = true;
        this.notify();
      }).catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err);
      });
    } catch (err) {
      console.warn('[PWA] Workbox SW init failed:', err);
    }
  }

  private setOnlineStatus(online: boolean) {
    this.state.isOnline = online;
    this.notify();
  }

  public subscribe(listener: PWAEventListener): () => void {
    this.listeners.push(listener);
    listener(this.state);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    try {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        this.deferredPrompt = null;
        this.state.isInstallable = false;
        this.notify();
        return true;
      }
    } catch (err) {
      console.warn('[PWA] Install prompt failed:', err);
    }
    return false;
  }

  public applyUpdate() {
    if (this.wb) {
      this.wb.messageSkipWaiting();
    } else if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    }
  }
}

export const pwaManager = new PWAManager();
