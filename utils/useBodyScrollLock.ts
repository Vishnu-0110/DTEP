import { useEffect } from 'react';

let activeLocks = 0;
let lockedScrollY = 0;
let originalBodyStyles: {
  overflow: string;
  position: string;
  top: string;
  width: string;
  left: string;
  right: string;
  paddingRight: string;
} | null = null;

const lockBodyScroll = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const body = document.body;

  if (activeLocks === 0) {
    lockedScrollY = window.scrollY;
    originalBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      left: body.style.left,
      right: body.style.right,
      paddingRight: body.style.paddingRight,
    };

    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${lockedScrollY}px`;
    body.style.width = '100%';
    body.style.left = '0';
    body.style.right = '0';

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  activeLocks += 1;
};

const unlockBodyScroll = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (activeLocks === 0) return;

  activeLocks -= 1;

  if (activeLocks > 0) return;

  const body = document.body;
  const scrollY = lockedScrollY;

  body.style.overflow = originalBodyStyles?.overflow || '';
  body.style.position = originalBodyStyles?.position || '';
  body.style.top = originalBodyStyles?.top || '';
  body.style.width = originalBodyStyles?.width || '';
  body.style.left = originalBodyStyles?.left || '';
  body.style.right = originalBodyStyles?.right || '';
  body.style.paddingRight = originalBodyStyles?.paddingRight || '';

  window.scrollTo(0, scrollY);
  originalBodyStyles = null;
};

export const useBodyScrollLock = (locked: boolean) => {
  useEffect(() => {
    if (!locked) return;

    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [locked]);
};
