"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useMemo } from "react";

export interface RequestCardProps {
  request: {
    id: string;
    title: string;
    tmdb_id: number;
    request_type: "movie" | "episode";
    status: string;
    created_at: string;
    backdrop_path?: string | null;
    poster_path?: string | null;
  };
  onImageLoad?: (requestId: string, backdropPath: string) => void;
}

export function RequestCard({ request, onImageLoad }: RequestCardProps) {
  const statusConfig = useMemo(() => {
    const status = request.status.toLowerCase();
    
    if (["available", "completed"].includes(status)) {
      return {
        icon: CheckCircle,
        label: "Available",
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/30",
      };
    }
    
    if (["pending", "queued", "submitted"].includes(status)) {
      return {
        icon: Clock,
        label: "Pending",
        color: "text-yellow-500",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
      };
    }
    
    if (["downloading", "processing"].includes(status)) {
      return {
        icon: AlertCircle,
        label: "Processing",
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        borderColor: "border-blue-500/30",
      };
    }
    
    return {
      icon: XCircle,
      label: "Failed",
      color: "text-red-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
    };
  }, [request.status]);

  const StatusIcon = statusConfig.icon;
  const linkUrl = request.request_type === "movie" 
    ? `/movie/${request.tmdb_id}` 
    : `/tv/${request.tmdb_id}`;

  // Use backdrop if available, otherwise poster
  const imagePath = request.backdrop_path || request.poster_path;
  const imageUrl = imagePath 
    ? `/imageproxy/tmdb/t/p/w500${imagePath}`
    : null;

  // Notify parent if we have a backdrop
  if (request.backdrop_path && onImageLoad) {
    onImageLoad(request.id, request.backdrop_path);
  }

  return (
    <Link href={linkUrl}>
      <div className="group relative overflow-hidden rounded-xl bg-gray-800/50 ring-1 ring-gray-700 hover:ring-purple-500/50 transition-all hover:scale-[1.02] cursor-pointer h-full">
        <div className="aspect-[16/9] relative overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={request.title}
              fill
              className="object-cover transition-transform group-hover:scale-110"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
              <span className="text-gray-500 text-4xl">🎬</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-white font-semibold text-sm mb-2 line-clamp-2">
            {request.title}
          </h3>
          
          <div className="flex items-center justify-between">
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color} border ${statusConfig.borderColor}`}
            >
              <StatusIcon className="h-3 w-3" />
              <span>{statusConfig.label}</span>
            </div>
            
            <span className="text-xs text-gray-400">
              {new Date(request.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function RequestCardPlaceholder() {
  return (
    <div className="rounded-xl bg-gray-800/50 ring-1 ring-gray-700 overflow-hidden h-full animate-pulse">
      <div className="aspect-[16/9] bg-gray-700" />
      <div className="p-4 space-y-2">
        <div className="h-4 bg-gray-700 rounded w-3/4" />
        <div className="h-3 bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}
