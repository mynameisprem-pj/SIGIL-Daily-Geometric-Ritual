import { showToast } from '@devvit/web/client';

function safeNotifyToast(text: string): void {
  try {
    showToast(text);
  } catch {
    // Running in standalone Vite browser tab outside Reddit WebView
  }
}

function legacyFallbackCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export async function copyShareDispatch(dispatchText: string): Promise<boolean> {
  let copied: boolean;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(dispatchText);
      copied = true;
    } catch {
      copied = legacyFallbackCopy(dispatchText);
    }
  } else {
    copied = legacyFallbackCopy(dispatchText);
  }

  if (copied) {
    safeNotifyToast('Sigil result copied to clipboard');
  } else {
    safeNotifyToast('Could not access clipboard');
  }

  return copied;
}