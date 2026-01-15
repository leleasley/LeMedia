'use client';

import { LogOut } from "lucide-react";
import { useState } from "react";

interface LogoutButtonProps {
    className?: string;
    variant?: 'default' | 'mobile';
    onClick?: () => void;
}

export function LogoutButton({ className, variant = 'default', onClick }: LogoutButtonProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleLogout = async () => {
        // Use a full navigation to the logout route so cookies and redirects are handled by the browser
        // (avoids CSP-related issues from fetch and client-side redirects)
        onClick?.();
        setIsLoading(true);
        try {
            // Force a top-level navigation so the server can set/clear cookies and redirect to /login
            window.location.href = '/logout';
        } catch (error) {
            console.error('Logout navigation failed:', error);
            window.location.href = '/login';
        }
    };

    if (variant === 'mobile') {
        return (
            <button
                onClick={handleLogout}
                disabled={isLoading}
                className={className || "block w-full text-left px-4 py-2 rounded-lg transition-all hover:bg-white/10 text-foreground disabled:opacity-50"}
            >
                <div className="flex items-center gap-3">
                    <LogOut className="h-4 w-4 flex-shrink-0" />
                    <span>{isLoading ? 'Logging out...' : 'Logout'}</span>
                </div>
            </button>
        );
    }

    return (
        <button
            onClick={handleLogout}
            disabled={isLoading}
            className={className || "flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white/10 dark:hover:bg-white/15 w-full disabled:opacity-50"}
        >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span>{isLoading ? 'Logging out...' : 'Logout'}</span>
        </button>
    );
}
