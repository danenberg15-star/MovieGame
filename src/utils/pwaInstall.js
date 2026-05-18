// src/utils/pwaInstall.js

/**
 * PWA Installation Handler
 * Manages the "Add to Home Screen" prompt
 */

let deferredPrompt = null;

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('💡 PWA: beforeinstallprompt event fired');
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Update UI to show install button (optional)
  showInstallPromotion();
});

// Show installation promotion (optional UI element)
function showInstallPromotion() {
  const installButton = document.getElementById('pwa-install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
}

// Trigger the install prompt
export async function installPWA() {
  if (!deferredPrompt) {
    console.log('❌ PWA: No install prompt available');
    alert('התקנה לא זמינה כרגע. אנא נסה מדפדפן Chrome או Safari.');
    return false;
  }

  // Show the install prompt
  deferredPrompt.prompt();

  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`👉 PWA: User response to the install prompt: ${outcome}`);

  if (outcome === 'accepted') {
    console.log('✅ PWA: User accepted the install prompt');
  } else {
    console.log('❌ PWA: User dismissed the install prompt');
  }

  // Clear the deferredPrompt for next time
  deferredPrompt = null;
  
  return outcome === 'accepted';
}

// Check if app is already installed
export function isPWAInstalled() {
  // Check if running in standalone mode (installed)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  
  // Check iOS
  if (window.navigator.standalone === true) {
    return true;
  }
  
  return false;
}

// Listen for successful installation
window.addEventListener('appinstalled', (e) => {
  console.log('✅ PWA: App was installed successfully');
  deferredPrompt = null;
});

// Named export object
const pwaUtils = {
  installPWA,
  isPWAInstalled
};

export default pwaUtils;