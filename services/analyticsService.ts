import { isOnline } from './networkService';

const GA_MEASUREMENT_ID = 'G-KDGGGJYZM6';

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Loads gtag.js after the app has mounted so it never sits on the startup
 * critical path. Skipped in dev and while offline; a load failure is silent
 * because analytics must not affect whether the app starts.
 */
export const initAnalytics = () => {
  if (!import.meta.env.PROD) return;
  if (!isOnline()) return;
  if (window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  script.onerror = () => { /* analytics is optional */ };
  document.head.appendChild(script);
};
