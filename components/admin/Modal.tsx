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
    // 배경(오버레이) 클릭으로 닫힘. 폭은 widthClass(Tailwind max-w-*)가 정한다.
    <div
      className="fa-modal-bg"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget && closable) onClose(); }}
    >
      <div className={`w-full ${widthClass}`}>
        <div className="fa-modal" style={{ maxWidth: 'none' }}>
          <div className="mh">
            <div>
              <h3>{title}</h3>
              {description && <p className="fa-muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>{description}</p>}
            </div>
            {closable && (
              <button type="button" onClick={onClose} aria-label="닫기" className="fa-btn ghost sm">
                <X size={18} />
              </button>
            )}
          </div>
          <div className="mb">{children}</div>
        </div>
      </div>
    </div>
  );
}
