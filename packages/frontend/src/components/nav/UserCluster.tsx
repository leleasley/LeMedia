import { useState } from 'react';
import { avatarSrc } from '@/utils/avatarSrc';
import { useTranslation } from 'react-i18next';
import { Settings, UserRound } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/context/AuthContext';
import AccountModal from '@/components/account/AccountModal';
import { Tooltip } from '@/components/ui/Tooltip';

interface UserClusterProps {
  viewAsRole: string | null;
  onViewAsRoleChange: (role: string | null) => void;
  variant?: 'compact' | 'expanded';
  onOpen?: () => void;
}

export function UserCluster({
  viewAsRole,
  onViewAsRoleChange,
  variant = 'compact',
  onOpen,
}: UserClusterProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Some existing Google-linked accounts have no LeMedia display name yet. Use the linked
  // provider's profile name before falling back to a literal question mark.
  const accountName = user?.displayName || user?.providers?.find((p) => p.provider === 'google')?.username || user?.email || '';
  const tooltipLabel = accountName || t('nav.account', 'Account');
  const providerAvatar = user?.avatarSource === 'none' || user?.avatarSource === 'dicebear'
    ? null
    : user?.providers?.find((p) => p.provider === user?.avatarSource)?.avatar
      || (!user?.avatarSource ? user?.providers?.find((p) => p.provider === 'google')?.avatar : null);
  const avatarUrl = user?.avatar || providerAvatar;

  const avatarEl = avatarUrl && !avatarFailed ? (
    <img
      src={avatarSrc(avatarUrl)}
      alt={accountName}
      referrerPolicy="no-referrer"
      onError={() => setAvatarFailed(true)}
      className="w-8 h-8 rounded-full ring-2 ring-white/10 flex-shrink-0 object-cover"
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-ndp-accent/20 flex items-center justify-center text-ndp-accent text-sm font-bold flex-shrink-0">
      {accountName ? accountName[0].toUpperCase() : <UserRound className="w-4 h-4" aria-hidden="true" />}
    </div>
  );

  return (
    <>
      <Tooltip label={tooltipLabel} disabled={open || variant === 'expanded'}>
        <button
          type="button"
          onClick={() => { onOpen?.(); setOpen(true); }}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={clsx(
            'flex items-center gap-2 rounded-xl hover:bg-white/5 transition-colors text-left',
            variant === 'expanded' ? 'p-2 w-full' : 'p-1',
          )}
        >
          {avatarEl}
          {variant === 'expanded' && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ndp-text truncate">
                {accountName || t('nav.account', 'Account')}
              </p>
              {user?.role && (
                <p className="text-xs text-ndp-text-dim truncate capitalize">{user.role}</p>
              )}
            </div>
          )}
          <Settings className={clsx(
            'w-3.5 h-3.5 text-ndp-text-dim/70 flex-shrink-0',
            variant === 'compact' && 'hidden sm:block',
          )} />
        </button>
      </Tooltip>

      <AccountModal
        open={open}
        onClose={() => setOpen(false)}
        viewAsRole={viewAsRole}
        onViewAsRoleChange={onViewAsRoleChange}
      />
    </>
  );
}
