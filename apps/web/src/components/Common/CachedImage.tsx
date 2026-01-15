"use client";

import Image, { ImageProps } from "next/image";
import type { SyntheticEvent } from "react";
import { useEffect, useMemo, useState } from "react";

export type CachedImageProps = ImageProps & {
  src: string;
  type: "tmdb" | "avatar" | "tvdb";
};

const CachedImage = ({ src, type, ...props }: CachedImageProps) => {
  const { alt, unoptimized: unoptimizedProp, ...rest } = props;
  const isDirectTmdb = /^https:\/\/image\.tmdb\.org\//.test(src);
  const isDirectTvdb = /^https:\/\/artworks\.thetvdb\.com\//.test(src);
  const useProxy =
    (type === "tmdb" || type === "tvdb") &&
    Boolean(src) &&
    !src.startsWith("/") &&
    !isDirectTmdb &&
    !isDirectTvdb;

  const proxyUrl = useMemo(() => {
    if (!src) return src;
    if (type === "tmdb") {
      return src.replace(
        /^https:\/\/image\.tmdb\.org\//,
        "/imageproxy/tmdb/"
      );
    }
    if (type === "tvdb") {
      return src.replace(
        /^https:\/\/artworks\.thetvdb\.com\//,
        "/imageproxy/tvdb/"
      );
    }
    return src;
  }, [src, type]);

  const finalImageUrl = useMemo(() => {
    if (!src) return src;
    return useProxy ? proxyUrl : src;
  }, [src, useProxy, proxyUrl]);

  // Avoid Next.js optimizer overhead when serving from our proxy.
  const shouldBypassOptimization =
    useProxy ||
    (finalImageUrl || "").startsWith("/imageproxy/") ||
    isDirectTmdb ||
    isDirectTvdb;
  const unoptimized: boolean =
    unoptimizedProp === undefined ? shouldBypassOptimization : Boolean(unoptimizedProp);
  const placeholder = props.placeholder ?? "blur";
  const blurDataURL =
    props.blurDataURL ??
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjE1IiBmaWxsPSIjMWYyNjM3Ii8+PC9zdmc+";

  const [currentSrc, setCurrentSrc] = useState(finalImageUrl || "");
  useEffect(() => {
    const id = window.setTimeout(() => setCurrentSrc(finalImageUrl || ""), 0);
    return () => window.clearTimeout(id);
  }, [finalImageUrl]);

  if (!finalImageUrl) return null;

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if ((isDirectTmdb || isDirectTvdb) && currentSrc !== proxyUrl) {
      setCurrentSrc(proxyUrl);
    }
    if (typeof props.onError === "function") {
      props.onError(event);
    }
  };

  return (
    <Image
      src={currentSrc}
      alt={alt ?? ""}
      {...rest}
      unoptimized={unoptimized}
      placeholder={placeholder}
      blurDataURL={blurDataURL}
      onError={handleError}
    />
  );
};

export default CachedImage;
