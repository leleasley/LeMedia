"use client";

import { useEffect } from "react";

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Hide the search bar on the discover page
    const searchHeader = document.querySelector('[data-search-header]');
    if (searchHeader) {
      (searchHeader as HTMLElement).style.display = 'none';
    }
    
    return () => {
      // Show it again when leaving
      const searchHeader = document.querySelector('[data-search-header]');
      if (searchHeader) {
        (searchHeader as HTMLElement).style.display = '';
      }
    };
  }, []);

  return (
    <div className="discover-page-wrapper">
      {children}
    </div>
  );
}
