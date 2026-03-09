import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";

type MediaCacheSectionProps = {
  imageProxyId: string;
  imageProxyEnabled: boolean;
  settingsLoading: boolean;
  savingImageProxy: boolean;
  onImageProxyChange: (nextValue: boolean) => void;
};

export function MediaCacheSection({
  imageProxyId,
  imageProxyEnabled,
  settingsLoading,
  savingImageProxy,
  onImageProxyChange,
}: MediaCacheSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-2">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Media</p>
        <h3 className="text-sm font-semibold text-white">Image Proxy Cache</h3>
        <p className="mt-1 text-xs text-muted">
          When enabled, TMDB images are served through the local proxy cache. Disable to load directly from TMDB.
        </p>
      </div>

      <AnimatedCheckbox
        id={imageProxyId}
        label="Enable proxy caching"
        checked={imageProxyEnabled}
        onChange={(e) => onImageProxyChange(e.target.checked)}
        disabled={settingsLoading || savingImageProxy}
      />
      <p className="text-xs text-muted">{savingImageProxy ? "Saving..." : "Auto-saves when toggled"}</p>
    </section>
  );
}
