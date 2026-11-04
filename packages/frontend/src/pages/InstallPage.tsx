import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { WizardShell, type WizardStep } from './install/WizardShell';
import SecretStep from './install/steps/SecretStep';
import AdminStep from './install/steps/AdminStep';
import ServicesStep from './install/steps/ServicesStep';
import SyncStep from './install/steps/SyncStep';
import DoneStep from './install/steps/DoneStep';
import { useBackend } from '@/context/BackendGate';

/**
 * Install wizard — kept to what a new LeMedia needs:
 *
 *   Secret → Admin → Services (Radarr and/or Sonarr) → Finishing up → Done
 *
 * "Finishing up" applies sensible defaults on its own (quality options mapped to the *arr
 * profiles, the first root folder of each *arr as the default) and runs the first library
 * scan. A media server (Plex / Jellyfin / Emby) is optional and added later under
 * Admin → Services.
 */

const LABEL_KEYS = ['secret', 'admin', 'services', 'sync', 'done'] as const;

export default function InstallPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { markInstalled } = useBackend();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState(0);
  const [secretValid, setSecretValid] = useState(false);
  const [adminExists, setAdminExists] = useState(false);

  useEffect(() => {
    api.get('/setup/install-status')
      .then(({ data }) => {
        if (data.installed) navigate('/login', { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return (
      <div className="min-h-dvh bg-ndp-bg flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-ndp-accent animate-spin" />
      </div>
    );
  }

  const stepperLabels: WizardStep[] = LABEL_KEYS.map((k) => ({
    label: t(`install.step.${k}`),
    hint: t(`install.step.${k}_hint`, ''),
  }));

  return (
    <WizardShell
      steps={stepperLabels}
      currentStep={step}
      brandTagline={t('install.brand_tagline')}
    >
      {step === 0 && (
        <SecretStep
          onValidated={(adminThere) => {
            setSecretValid(true);
            setAdminExists(adminThere);
            setStep(1);
          }}
        />
      )}

      {step === 1 && secretValid && (
        <AdminStep
          adminExists={adminExists}
          onComplete={() => { setAdminExists(true); setStep(2); }}
        />
      )}

      {step === 2 && (
        <ServicesStep
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <SyncStep onComplete={() => setStep(4)} />
      )}

      {step === 4 && (
        <DoneStep onGo={() => { markInstalled(); navigate('/', { replace: true }); }} />
      )}
    </WizardShell>
  );
}
