import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  children: React.ReactNode;
  /** Custom class for the inner dialog container (e.g. max-w-lg, max-w-4xl, etc.) */
  className?: string;
  /** Custom class for the outer fixed backdrop */
  backdropClassName?: string;
}

/**
 * Universal Modal wrapper that teleports to document.body via createPortal.
 * - Prevents modal clipping/trapping inside parent containers, transforms, and page transitions.
 * - Guarantees 100% viewport-centered alignment on any screen size.
 * - Locks background body scrolling while open.
 * - Closes on backdrop click or Escape key.
 */
export function Modal({
  isOpen = true,
  onClose,
  children,
  className = '',
  backdropClassName = ''
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    // Lock background body scroll while modal is active
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm overflow-y-auto fade-in ${backdropClassName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-3 sm:p-4 md:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) {
            onClose();
          }
        }}
      >
        <div
          className={`relative w-full flex flex-col transition-all select-text ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
