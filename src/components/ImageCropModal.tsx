import React, { useRef, useState } from 'react';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X } from 'lucide-react';

interface ImageCropModalProps {
  file: File;
  title?: string;
  onCancel: () => void;
  onComplete: (blob: Blob, previewUrl: string) => void;
}

const OUTPUT_SIZE = 512;

function initialCrop(width: number, height: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
    width,
    height
  );
}

export function ImageCropModal({ file, title = 'Crop photo', onCancel, onComplete }: ImageCropModalProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [src] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState<Crop>();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!image || !crop || !crop.width || !crop.height) return;
    setBusy(true);
    try {
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((result) => resolve(result), 'image/jpeg', 0.9)
      );
      if (!blob) return;
      onComplete(blob, URL.createObjectURL(blob));
    } finally {
      setBusy(false);
      URL.revokeObjectURL(src);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 animate-fade-in">
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-[var(--wa-panel)] shadow-2xl">
        <header className="flex h-14 items-center justify-between bg-[var(--wa-header)] px-4">
          <h3 className="text-[16px] font-medium text-[var(--wa-text)]">{title}</h3>
          <button
            onClick={onCancel}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
            title="Cancel"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex max-h-[65vh] items-center justify-center overflow-hidden bg-black p-3">
          <ReactCrop
            crop={crop}
            onChange={(pixelCrop) => setCrop(pixelCrop)}
            aspect={1}
            circularCrop
            keepSelection
          >
            <img
              ref={imageRef}
              src={src}
              alt="Crop preview"
              className="max-h-[55vh] w-auto"
              onLoad={(e) => {
                const { width, height } = e.currentTarget;
                setCrop(initialCrop(width, height));
              }}
            />
          </ReactCrop>
        </div>

        <footer className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-[14px] text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || !crop}
            className="rounded-full bg-[#00a884] px-5 py-2 text-[14px] font-medium text-white hover:bg-[#008069] disabled:opacity-60"
          >
            {busy ? 'Cropping…' : 'Use photo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
