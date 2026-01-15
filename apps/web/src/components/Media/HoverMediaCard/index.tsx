"use client";

import { TitleCard } from "@/components/Media/TitleCard";
import { MediaStatus } from "@/components/Common/StatusBadgeMini";

export interface HoverMediaCardProps {
    id: number;
    title: string;
    posterUrl: string | null;
    href: string;
    year?: string;
    rating?: number;
    description?: string;
    className?: string;
    genres?: string[];
    mediaType?: "movie" | "tv";
    mediaStatus?: MediaStatus;
    inProgress?: boolean;
    imagePriority?: boolean;
    imageLoading?: "eager" | "lazy";
    imageFetchPriority?: "high" | "auto" | "low";
}

export function HoverMediaCard(props: HoverMediaCardProps) {
    return (
        <TitleCard
            id={props.id}
            title={props.title}
            posterUrl={props.posterUrl ?? undefined}
            href={props.href}
            year={props.year}
            rating={props.rating}
            description={props.description}
            mediaType={props.mediaType}
            mediaStatus={props.mediaStatus}
            inProgress={props.inProgress}
            imagePriority={props.imagePriority}
            imageLoading={props.imageLoading}
            imageFetchPriority={props.imageFetchPriority}
            className={props.className}
        />
    );
}