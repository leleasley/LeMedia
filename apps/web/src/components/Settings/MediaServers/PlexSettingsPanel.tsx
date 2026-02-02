"use client";

import { useState } from "react";

export function PlexSettingsPanel() {
    const [email, setEmail] = useState("");

    return (
        <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-6 border-b border-white/10">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                <div className="relative flex items-center gap-4">
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-1 ring-white/10">
                        <svg viewBox="0 0 24 24" className="w-7 h-7 text-amber-300" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Plex Media Server</h3>
                        <p className="text-sm text-white/60">Connect your Plex server for availability tracking</p>
                    </div>
                </div>
            </div>

            {/* Coming Soon Content */}
            <div className="p-6">
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mb-6 ring-1 ring-white/10">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-amber-400">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                    </div>

                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold mb-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Coming Soon
                    </div>

                    <h4 className="text-xl font-bold text-white mb-2">Plex Integration</h4>
                    <p className="text-sm text-gray-400 max-w-md mb-8">
                        We&apos;re working on bringing Plex support to LeMedia. This will allow you to track availability
                        across your Plex libraries just like Jellyfin.
                    </p>

                    {/* Features Preview */}
                    <div className="grid gap-3 w-full max-w-md mb-8">
                        {[
                            { icon: "🔗", label: "Easy server connection via Plex account" },
                            { icon: "📚", label: "Library sync and availability tracking" },
                            { icon: "🔄", label: "Automatic content detection" },
                            { icon: "📊", label: "Unified media dashboard" }
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-lg">{feature.icon}</span>
                                <span className="text-sm text-gray-300">{feature.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Notify Form */}
                    <div className="w-full max-w-md p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-sm text-gray-400 mb-3">Want to be notified when Plex support is available?</p>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="flex-1 input text-sm"
                                disabled
                            />
                            <button
                                className="btn btn-primary opacity-50 cursor-not-allowed"
                                disabled
                            >
                                Notify Me
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Notification system coming soon</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
