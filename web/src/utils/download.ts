import type { Media } from '../types/media';

/**
 * Trigger downloads through plain links. download_url is signed and served with
 * Content-Disposition: attachment, so the page never navigates away.
 */
export function downloadMedia(items: Media[]) {
  items.forEach((item, i) => {
    window.setTimeout(() => {
      const a = document.createElement('a');
      a.href = item.download_url;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 400); // stagger so browsers don't drop rapid consecutive downloads
  });
}
