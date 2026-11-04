import React, { useState } from 'react';
import { X, UserPlus, Trash2 } from 'lucide-react';

interface ContactDialogProps {
  title?: string;
  personName: string;
  initialNickname?: string;
  isSaved: boolean;
  busy?: boolean;
  onSave: (nickname: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
  onClose: () => void;
}

export function ContactDialog({
  title,
  personName,
  initialNickname = '',
  isSaved,
  busy,
  onSave,
  onRemove,
  onClose,
}: ContactDialogProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(nickname.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-xl bg-[var(--wa-panel)] p-5 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-medium text-[var(--wa-text)]">
            {title || (isSaved ? 'Edit contact' : 'Add to contacts')}
          </h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-[13px] text-[var(--wa-text-2)]">{personName}</p>

        <label className="mt-4 block">
          <span className="text-[12.5px] text-[var(--wa-text-2)]">Nickname (private to you)</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
            placeholder={personName}
            className="mt-1 w-full rounded-lg border border-[var(--wa-border)] bg-[var(--wa-panel-2)] px-3 py-2 text-[14px] text-[var(--wa-text)] outline-none focus:border-[#00a884]"
          />
          <span className="mt-1 block text-[11.5px] text-[var(--wa-text-3)]">
            Only you can see this name. Leave it empty to use their Chatly name.
          </span>
        </label>

        <div className="mt-5 flex items-center justify-between gap-2">
          {isSaved && onRemove ? (
            <button
              onClick={() => onRemove()}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-medium text-[var(--wa-danger)] hover:bg-[var(--wa-hover)]"
            >
              <Trash2 className="h-4 w-4" />
              Remove contact
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2 text-[14px] text-[var(--wa-text-2)] hover:bg-[var(--wa-hover)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || busy}
              className="flex items-center gap-1.5 rounded-full bg-[#00a884] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#008069] disabled:opacity-60"
            >
              <UserPlus className="h-4 w-4" />
              {saving ? 'Saving…' : isSaved ? 'Save' : 'Add contact'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
