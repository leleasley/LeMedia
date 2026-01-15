"use client";

import { useState } from "react";
import { CollectionRequestModal } from "@/components/Requests/CollectionRequestModal";

type MovieItem = {
  id: number;
  title: string;
  posterPath?: string | null;
  releaseDate?: string | null;
  status?: "available" | "requested" | "pending" | "submitted" | "already_exists" | "already_requested";
};

type QualityProfile = { id: number; name: string };

export function CollectionRequestButton(props: {
  collectionId: number;
  collectionName: string;
  movies: MovieItem[];
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>
        Request Collection
      </button>
      <CollectionRequestModal
        open={open}
        onClose={() => setOpen(false)}
        collectionId={props.collectionId}
        collectionName={props.collectionName}
        movies={props.movies}
        qualityProfiles={props.qualityProfiles}
        defaultQualityProfileId={props.defaultQualityProfileId}
        requestsBlocked={props.requestsBlocked}
      />
    </>
  );
}
