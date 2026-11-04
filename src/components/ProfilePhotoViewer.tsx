import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { onAvatarError } from '../lib/avatar';

interface ProfilePhotoViewerProps {
  src: string;
  name?: string;
  onClose: () => void;
}

export function ProfilePhotoViewer({ src, name, onClose }: ProfilePhotoViewerProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black/95 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="flex h-14 shrink-0 items-center gap-3 px-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>
        <span className="truncate text-[15px] font-medium">{name}</span>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <img
          src={src}
          alt={name || 'Profile photo'}
          className="max-h-full max-w-full rounded-full object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          onError={(e) => onAvatarError(e, name)}
        />
      </div>
    </div>
  );
}
