import { useState, useMemo, useEffect } from 'react';
import { avatarSrc } from '@/utils/avatarSrc';
import { useTranslation } from 'react-i18next';
import { Check, UserCircle2, Sparkles, Pencil, Save, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { showToast } from '@/utils/toast';
import AvatarEditor, { renderDicebearAvatar, type AvatarOptions } from '@/components/account/AvatarEditor';

interface InfoFieldProps {
  label: string;
  value: React.ReactNode;
}

function InfoField({ label, value }: Readonly<InfoFieldProps>) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <p className="text-[15px] text-ndp-text-muted flex-shrink-0">{label}</p>
      <p className="text-[15px] text-ndp-text text-right truncate">{value || '-'}</p>
    </div>
  );
}

const GROUP = 'rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] overflow-hidden';
const GROUP_LABEL = 'px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim';

export function AccountSection() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [savingSource, setSavingSource] = useState<string | null>(null);
  const [editingDicebear, setEditingDicebear] = useState(false);
  const [authProviders, setAuthProviders] = useState<Array<{ id: string; label: string; type?: string }>>([]);
  const [linking, setLinking] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [avatarTileFailures, setAvatarTileFailures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/auth/providers').then(({ data }) => setAuthProviders(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  // Hooks must run on every render — read user.avatarConfig defensively so the early return
  // below doesn't make React see a different hook order between renders.
  const dicebearConfig = useMemo(() => {
    if (!user?.avatarConfig) return null;
    try {
      const parsed = JSON.parse(user.avatarConfig) as { seed?: string; options?: AvatarOptions };
      return parsed.seed ? { seed: parsed.seed, options: parsed.options ?? {} } : null;
    } catch { return null; }
  }, [user?.avatarConfig]);

  const dicebearPreview = useMemo(
    () => (dicebearConfig ? renderDicebearAvatar(dicebearConfig.seed, dicebearConfig.options) : null),
    [dicebearConfig],
  );

  if (!user) return null;

  const profileName = user.displayName || user.providers?.find((p) => p.provider === 'google')?.username || user.email || '';

  const memberSince = user.createdAt ? new Date(user.createdAt) : null;
  const memberSinceLabel = memberSince && !Number.isNaN(memberSince.getTime())
    ? memberSince.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const linkedIds = new Set((user.providers ?? []).map((p) => p.provider));
  const oauthProviders = authProviders.filter((ap) => ap.type === 'oauth' && ap.id !== 'email');

  const handleLink = (providerId: string) => {
    window.location.href = `/api/auth/${providerId}/authorize?action=link`;
  };

  const handleUnlink = async (providerId: string) => {
    if (linking) return;
    setLinking(providerId);
    try {
      await api.delete(`/auth/me/providers/${providerId}`);
      await refreshUser();
      showToast(`${providerId.charAt(0).toUpperCase() + providerId.slice(1)} unlinked`, 'success');
    } catch (err) {
      showToast('Failed to unlink account', 'error');
      console.warn('[LinkedAccounts] unlink failed', err);
    } finally {
      setLinking(null);
    }
  };

  return (
    <>
    <div className="space-y-7">
      {/* Name */}
      <section>
        <h3 className={GROUP_LABEL}>{t('account.profile.name_title', 'Profile name')}</h3>
        <div className={GROUP}>
          {editingName ? (
            <form className="p-3 flex flex-col sm:flex-row gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const displayName = nameDraft.trim();
              if (!displayName || savingName) return;
              setSavingName(true);
              try {
                await api.put('/auth/me', { displayName });
                await refreshUser();
                setEditingName(false);
                showToast(t('account.profile.name_saved', 'Profile name updated'), 'success');
              } catch {
                showToast(t('account.profile.name_failed', 'Could not update profile name'), 'error');
              } finally { setSavingName(false); }
            }}>
              <input autoFocus maxLength={60} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="input flex-1" placeholder={user.email} aria-label={t('account.profile.name_title', 'Profile name')} />
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingName(false)} className="btn-secondary flex-1 sm:flex-none flex items-center justify-center gap-2 !px-4"><X className="w-4 h-4" />{t('common.cancel', 'Cancel')}</button>
                <button type="submit" disabled={savingName || !nameDraft.trim()} className="btn-primary flex-1 sm:flex-none flex items-center justify-center gap-2 !px-4 disabled:opacity-50"><Save className="w-4 h-4" />{t('common.save', 'Save')}</button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => { setNameDraft(user.displayName || ''); setEditingName(true); }}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03] active:bg-white/[0.06] transition-colors"
            >
              <span className={clsx('text-[15px] truncate', user.displayName ? 'text-ndp-text' : 'text-ndp-text-dim')}>
                {user.displayName || t('account.profile.name_empty', 'No custom name set')}
              </span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ndp-accent flex-shrink-0">
                <Pencil className="w-3.5 h-3.5" />{t('common.edit', 'Edit')}
              </span>
            </button>
          )}
        </div>
        <p className="px-1 mt-2 text-xs text-ndp-text-dim">{t('account.profile.name_hint', 'This name is shown around LeMedia.')}</p>
      </section>

      {user.providers && user.providers.length > 0 && !editingDicebear && (
        <AvatarSourcePicker
          providers={user.providers}
          currentSource={user.avatarSource ?? null}
          dicebearAvatar={dicebearPreview}
          savingSource={savingSource}
          avatarFailures={avatarTileFailures}
          onAvatarFailure={(id) => setAvatarTileFailures((current) => ({ ...current, [id]: true }))}
          onPick={async (source) => {
            if (savingSource) return;
            if (source === 'dicebear') {
              if (!dicebearConfig || user.avatarSource === 'dicebear') {
                setEditingDicebear(true);
                return;
              }
              setSavingSource('dicebear');
              try {
                const dataUri = renderDicebearAvatar(dicebearConfig.seed, dicebearConfig.options);
                await api.put('/auth/me/avatar-source', {
                  source: 'dicebear',
                  config: { style: 'avataaars', seed: dicebearConfig.seed, options: dicebearConfig.options },
                  avatar: dataUri,
                });
                await refreshUser();
              } finally {
                setSavingSource(null);
              }
              return;
            }
            setSavingSource(source);
            try {
              await api.put('/auth/me/avatar-source', { source });
              await refreshUser();
            } finally {
              setSavingSource(null);
            }
          }}
        />
      )}

      {editingDicebear && (
        <AvatarEditor
          initialSeed={dicebearConfig?.seed}
          initialOptions={dicebearConfig?.options}
          saving={savingSource === 'dicebear'}
          onCancel={() => setEditingDicebear(false)}
          onSave={async ({ seed, options, dataUri }) => {
            if (savingSource) return;
            setSavingSource('dicebear');
            try {
              await api.put('/auth/me/avatar-source', {
                source: 'dicebear',
                config: { style: 'avataaars', seed, options },
                avatar: dataUri,
              });
              await refreshUser();
              setEditingDicebear(false);
            } finally {
              setSavingSource(null);
            }
          }}
        />
      )}

      {/* Account details */}
      <section>
        <h3 className={GROUP_LABEL}>{t('account.info.title', 'Informations')}</h3>
        <div className={clsx(GROUP, 'divide-y divide-white/[0.06]')}>
          <InfoField label={t('account.info.email', 'Email')} value={user.email} />
          <InfoField label={t('account.info.role', 'Rôle')} value={user.role} />
          {memberSinceLabel && (
            <InfoField label={t('account.info.member_since', 'Membre depuis')} value={memberSinceLabel} />
          )}
        </div>
      </section>

      {/* Linked accounts */}
      <section>
        <h3 className={GROUP_LABEL}>{t('account.info.linked_accounts', 'Comptes liés')}</h3>
        {oauthProviders.length === 0 ? (
          <div className={clsx(GROUP, 'px-4 py-3 text-sm text-ndp-text-dim')}>{t('account.linked.none', 'No external providers enabled.')}</div>
        ) : (
          <ul className={clsx(GROUP, 'divide-y divide-white/[0.06]')}>
            {oauthProviders.map((ap) => {
              const linked = user.providers?.find((p) => p.provider === ap.id);
              const isLinked = !!linked;
              return (
                <li key={ap.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                      <img src={`/${ap.id}.svg`} alt="" className="w-[18px] h-[18px]" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-ndp-text capitalize">{ap.label || ap.id}</p>
                      <p className="text-xs text-ndp-text-dim truncate">
                        {isLinked ? (linked.username || linked.email || t('account.linked.connected', 'Connected')) : t('account.linked.not_connected', 'Not connected')}
                      </p>
                    </div>
                  </div>
                  {isLinked ? (
                    <button
                      type="button"
                      onClick={() => handleUnlink(ap.id)}
                      disabled={!!linking}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium text-ndp-text-muted hover:text-ndp-danger hover:bg-ndp-danger/10 transition-colors disabled:opacity-50 flex-shrink-0"
                    >
                      {linking === ap.id ? '…' : t('account.linked.unlink', 'Unlink')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleLink(ap.id)}
                      className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-ndp-accent text-white hover:bg-ndp-accent-hover transition-colors flex-shrink-0"
                    >
                      {t('account.linked.link', 'Link')}
                    </button>
                  )}
                </li>
              );
            })}
            {(user.providers ?? []).filter((p) => !oauthProviders.find((ap) => ap.id === p.provider)).map((p) => (
              <li key={p.provider} className="flex items-center justify-between gap-3 px-4 py-3 opacity-60">
                <span className="flex items-center gap-3 text-[15px] font-medium text-ndp-text capitalize">
                  <span className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center"><img src={`/${p.provider}.svg`} alt="" className="w-4 h-4" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /></span>
                  {p.provider}
                </span>
                <span className="text-xs text-ndp-text-dim truncate">{p.username || p.email || '-'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </>
  );
}

interface AvatarSourcePickerProps {
  providers: NonNullable<ReturnType<typeof useAuth>['user']>['providers'];
  currentSource: string | null;
  dicebearAvatar: string | null;
  savingSource: string | null;
  avatarFailures: Record<string, boolean>;
  onAvatarFailure: (id: string) => void;
  onPick: (source: string) => void;
}

interface Tile {
  id: string;
  label: string;
  avatar: string | null;
  fallbackIcon?: 'user' | 'sparkles' | 'provider';
}

function AvatarSourcePicker({ providers, currentSource, dicebearAvatar, savingSource, avatarFailures, onAvatarFailure, onPick }: Readonly<AvatarSourcePickerProps>) {
  const { t } = useTranslation();
  const visibleProviders = (providers ?? []).filter((p) => !!p.avatar);
  const tiles: Tile[] = [
    ...visibleProviders.map<Tile>((p) => ({
      id: p.provider,
      label: p.provider,
      avatar: p.avatar ?? null,
      fallbackIcon: 'provider',
    })),
    { id: 'dicebear', label: 'LeMedia', avatar: dicebearAvatar, fallbackIcon: 'sparkles' },
    { id: 'none', label: t('account.avatar.none', 'Aucun'), avatar: null },
  ];
  const effectiveSource = savingSource ?? currentSource ?? visibleProviders.find((p) => p.avatar)?.provider ?? 'none';

  return (
    <section>
      <h3 className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ndp-text-dim">
        {t('account.avatar.title', 'Avatar')}
      </h3>
      <div className="rounded-xl bg-ndp-surface ring-1 ring-inset ring-white/[0.06] p-3">
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const selected = effectiveSource === tile.id;
          const isEditableActive = selected && tile.id === 'dicebear';
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => {
                if (savingSource) return;
                if (selected && tile.id !== 'dicebear') return;
                onPick(tile.id);
              }}
              disabled={!!savingSource}
              className={clsx(
                'group relative flex flex-col items-center gap-2 p-3 rounded-lg transition-colors text-left',
                selected
                  ? 'bg-ndp-accent/10 ring-1 ring-inset ring-ndp-accent/60'
                  : 'hover:bg-white/[0.04] active:bg-white/[0.06]',
                isEditableActive && 'cursor-pointer',
              )}
            >
              <div className="relative">
                {tile.avatar && !avatarFailures[tile.id] ? (
                  <img
                    src={avatarSrc(tile.avatar)}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => onAvatarFailure(tile.id)}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white/5 bg-white/5"
                  />
                ) : (
                  <div className={clsx(
                    'w-14 h-14 rounded-full ring-2 ring-white/5 flex items-center justify-center overflow-hidden',
                    tile.fallbackIcon === 'sparkles' ? 'bg-ndp-accent/10 text-ndp-accent' : 'bg-white/5 text-ndp-text-dim',
                  )}>
                    {tile.fallbackIcon === 'sparkles' ? <Sparkles className="w-7 h-7" /> : tile.fallbackIcon === 'provider' ? (
                      <img src={`/${tile.id}.svg`} alt="" className="w-7 h-7" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    ) : <UserCircle2 className="w-8 h-8" />}
                  </div>
                )}
                {selected && !isEditableActive && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ndp-accent flex items-center justify-center ring-2 ring-ndp-bg">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
                  </span>
                )}
                {isEditableActive && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-ndp-accent flex items-center justify-center ring-2 ring-ndp-bg group-hover:scale-110 transition-transform">
                    <Pencil className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-ndp-text-muted capitalize truncate w-full text-center">
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
      </div>
      <p className="px-1 mt-2 text-xs text-ndp-text-dim">
        {t('account.avatar.hint', 'Choisis quel compte fournit ta photo de profil.')}
      </p>
    </section>
  );
}
