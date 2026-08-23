export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const isOnline = () => !isOffline();
