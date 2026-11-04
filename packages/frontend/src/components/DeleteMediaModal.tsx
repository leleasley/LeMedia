import { useState } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { showToast } from '@/utils/toast';
import api from '@/lib/api';

interface Props {
  title: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  onClose: () => void;
}

export default function DeleteMediaModal({ title, mediaType, tmdbId, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [deleteFromService, setDeleteFromService] = useState(true);
  const [deleteFiles, setDeleteFiles] = useState(true);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await api.delete(`/media/${tmdbId}`, {
        params: { deleteFromService: String(deleteFromService), deleteFiles: String(deleteFiles) },
      });
      showToast(`${title} deleted`, 'success');
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Delete failed';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div className="modal-panel p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ndp-text">Delete {mediaType === 'movie' ? 'Movie' : 'Series'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ndp-text-dim mb-6">
          Remove <span className="text-ndp-text font-medium">{title}</span> from your library?
        </p>
        <div className="space-y-3 mb-6">
          <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors">
            <input
              type="checkbox"
              checked={deleteFromService}
              onChange={(e) => { setDeleteFromService(e.target.checked); if (!e.target.checked) setDeleteFiles(false); }}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm text-ndp-text font-medium">
                Delete from {mediaType === 'movie' ? 'Radarr' : 'Sonarr'}
              </p>
              <p className="text-xs text-ndp-text-dim">Remove from your {mediaType === 'movie' ? 'Radarr' : 'Sonarr'} library</p>
            </div>
          </label>
          {deleteFromService && (
            <label className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5 cursor-pointer hover:bg-white/[0.05] transition-colors ml-6">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm text-ndp-text font-medium">Delete files from disk</p>
                <p className="text-xs text-ndp-text-dim">Permanently delete downloaded files</p>
              </div>
            </label>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={loading || (!deleteFromService)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
