type SecretsSectionProps = {
  saving: boolean;
  onRotateServiceSecrets: () => void;
};

export function SecretsSection({ saving, onRotateServiceSecrets }: SecretsSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Secrets</p>
        <h3 className="text-sm font-semibold text-white">Re-encrypt Service Secrets</h3>
        <p className="mt-1 text-xs text-muted">
          Use after rotating `SERVICES_SECRET_KEY` to re-encrypt stored API keys.
        </p>
      </div>

      <button
        type="button"
        className="btn"
        disabled={saving}
        onClick={onRotateServiceSecrets}
      >
        Rotate service secrets
      </button>
    </section>
  );
}
