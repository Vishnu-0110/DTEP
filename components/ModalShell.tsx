import React from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  zIndexClassName?: string;
  viewportClassName?: string;
  overlayClassName?: string;
  closeOnBackdropClick?: boolean;
}

const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  children,
  zIndexClassName = 'z-[60]',
  viewportClassName = 'p-3 pt-4 pb-4 sm:p-4',
  overlayClassName = 'modal-overlay',
  closeOnBackdropClick = true,
}) => {
  useBodyScrollLock(isOpen);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} overflow-y-auto overscroll-contain`} role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 ${overlayClassName}`}
        onClick={() => {
          if (closeOnBackdropClick) {
            onClose?.();
          }
        }}
      />
      <div className={`relative z-10 flex min-h-screen min-h-[100dvh] w-full items-start justify-center sm:items-center ${viewportClassName}`}>
        {children}
      </div>
    </div>,
    document.body
  );
};

export default ModalShell;
