/**
 * Detect if the user is on an iOS device
 */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || 
         (navigator.maxTouchPoints > 2 && /macintosh/.test(ua));
}

/**
 * Detect if Safari on iOS
 */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  
  const ua = navigator.userAgent;
  return isIOS() && /Safari/.test(ua) && !/Chrome/.test(ua);
}
