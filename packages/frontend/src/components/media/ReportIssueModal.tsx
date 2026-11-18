import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageSquareWarning, X } from 'lucide-react';
import api from '@/lib/api';
import { extractApiError, showToast } from '@/utils/toast';

const CATEGORIES = ['playback', 'wrong_file', 'audio', 'subtitles', 'other'] as const;
type Category = typeof CATEGORIES[number];

/** "Something is wrong with this title" — a note for the admins, not a library change. */
export function ReportIssueModal({ open, onClose, tmdbId, mediaType, title }: Readonly<{
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
}>) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<Category>('playback');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const submit = async () => {
    const text = message.trim();
    if (text.length < 10) {
      setError(t('issue.too_short', 'Please describe the issue in at least 10 characters.'));
      return;
    }
    setSending(true);
    setError('');
    try {
      await api.post('/issues', { tmdbId, mediaType, title, category, message: text });
      showToast(t('issue.sent', 'Issue sent — an admin will take a look'), 'success');
      setMessage('');
      setCategory('playback');
      onClose();
    } catch (err) {
      setError(extractApiError(err, t('issue.failed', 'Could not send the issue. Try again.')));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay z-50" onClick={sending ? undefined : onClose}>
      <div className="modal-panel p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="admin-icon-tile bg-ndp-warning/15 text-ndp-warning flex-shrink-0"><MessageSquareWarning className="w-[17px] h-[17px]" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-ndp-text truncate">{t('issue.title', 'Report an issue')}</h2>
              <p className="text-sm text-ndp-text-dim truncate">{title}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={sending} aria-label={t('common.close', 'Close')} className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-ndp-text-muted mt-3 leading-relaxed">
          {t('issue.subtitle', "Tell an admin what's wrong with this title. They can fix the file, the subtitles or the audio in your library.")}
        </p>

        <label className="block mt-4">
          <span className="block text-sm font-medium text-ndp-text mb-1.5">{t('issue.category', 'What is wrong?')}</span>
          <select className="input w-full text-sm py-2.5" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`issue.category.${c}`, c === 'playback' ? 'It will not play' : c === 'wrong_file' ? 'Wrong film, episode or cut' : c === 'audio' ? 'Audio is missing or wrong' : c === 'subtitles' ? 'Subtitles are missing or wrong' : 'Something else')}</option>
            ))}
          </select>
        </label>

        <label className="block mt-4">
          <span className="block text-sm font-medium text-ndp-text mb-1.5">{t('issue.message', 'Details')}</span>
          <textarea
            className="input w-full text-sm min-h-[110px] resize-y"
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('issue.placeholder', 'What happened, and at what point? Extra detail helps an admin reproduce it.')}
          />
        </label>

        {error && <p className="text-sm text-ndp-danger mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" className="btn-secondary !py-2 !px-4 !text-sm" onClick={onClose} disabled={sending}>{t('common.cancel', 'Cancel')}</button>
          <button type="button" className="btn-primary !py-2 !px-4 !text-sm inline-flex items-center gap-2" onClick={() => void submit()} disabled={sending}>
            {sending && <Loader2 className="w-4 h-4 animate-spin" />}
            {t('issue.submit', 'Send to admins')}
          </button>
        </div>
      </div>
    </div>
  );
}
