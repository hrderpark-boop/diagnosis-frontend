"use client";

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * 어드민 공용 모달.
 * - ESC 키와 배경(오버레이) 클릭으로 닫힌다.
 * - 열려 있는 동안 body 스크롤을 잠가 뒤 배경이 함께 움직이지 않게 한다.
 */
interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 닫기를 막아야 하는 상황(예: 제출 진행 중) */
  closable?: boolean;
  widthClass?: string;
}

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  closable = true,
  widthClass = 'max-w-lg',
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closable) onClose();
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, closable, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => closable && onClose()}
      />

      {/* 본문 */}
      <div className={`relative w-full ${widthClass} rounded-2xl border border-gray-700 bg-gray-800 shadow-2xl`}>
        <div className="flex items-start justify-between border-b border-gray-700 p-6">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}
          </div>
          {closable && (
            <button
              onClick={onClose}
              aria-label="닫기"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
