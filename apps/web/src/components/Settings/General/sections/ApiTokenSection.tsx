type ApiTokenSectionProps = {
  apiKey: string | null;
  apiKeyVisible: boolean;
  apiKeyLoading: boolean;
  rotatingApiKey: boolean;
  saving: boolean;
  baseUrl: string | null;
  onToggleVisibility: () => void;
  onCopy: () => void;
  onRotateOrGenerate: () => void;
};

export function ApiTokenSection({
  apiKey,
  apiKeyVisible,
  apiKeyLoading,
  rotatingApiKey,
  saving,
  baseUrl,
  onToggleVisibility,
  onCopy,
  onRotateOrGenerate,
}: ApiTokenSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">API</p>
        <h3 className="text-sm font-semibold text-white">Global API Token</h3>
        <p className="mt-1 text-xs text-muted">
          Use this for server-wide integrations (Jellyfin/Jellyseerr). Treat it like a password.
        </p>
      </div>

      <div className="space-y-2">
        {apiKey ? (
          <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded overflow-hidden">
            <code className="text-sm text-white break-all block overflow-wrap-anywhere" style={{ wordBreak: "break-all" }}>
              {apiKeyVisible ? apiKey : apiKey.replace(/./g, "*")}
            </code>
          </div>
        ) : (
          <div className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded text-muted italic text-sm">
            {apiKeyLoading ? "Loading..." : "Generate a key to enable"}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn flex-1 sm:flex-none"
            onClick={onToggleVisibility}
            disabled={!apiKey}
          >
            {apiKeyVisible ? "Hide" : "Reveal"}
          </button>
          <button
            type="button"
            className="btn flex-1 sm:flex-none"
            onClick={onCopy}
            disabled={!apiKey}
          >
            Copy
          </button>
          <button
            type="button"
            className="btn flex-1 sm:flex-none"
            disabled={apiKeyLoading || saving || rotatingApiKey}
            onClick={onRotateOrGenerate}
          >
            {rotatingApiKey ? (apiKey ? "Rotating..." : "Generating...") : (apiKey ? "Rotate" : "Generate")}
          </button>
        </div>
      </div>

      {baseUrl ? (
        <p className="text-xs text-muted">
          Jellyseerr base URL: <span className="font-mono">{baseUrl}</span>
        </p>
      ) : null}
      <p className="text-xs text-muted">
        Compatible endpoints: <span className="font-mono">/api/v1/status</span>, {" "}
        <span className="font-mono">/api/v1/request</span>
      </p>
    </section>
  );
}
