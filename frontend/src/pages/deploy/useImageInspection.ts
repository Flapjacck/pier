import { useCallback, useState } from "react";
import { inspectImage } from "../../api/registries";
import { ApiError } from "../../api/errors";
import type { VolumeHint } from "../../api/types";

/**
 * "Check image": fills the port from EXPOSE and turns VOLUME into suggestions (#83).
 * It no longer attaches a volume by itself; the Runtime step offers one-click Add.
 */
export function useImageInspection(image: string, registry: string, setPort: (port: string) => void) {
  const [hint, setHint] = useState<string>();
  const [hints, setHints] = useState<VolumeHint[]>([]);
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    if (!image.trim()) return;
    setChecking(true);
    setHint(undefined);
    try {
      const result = await inspectImage({ image: image.trim(), registry: registry || undefined });
      if (result.exposedPorts[0] !== undefined) setPort(String(result.exposedPorts[0]));
      setHints(result.volumeHints);
      setHint(result.volumeHints.length > 0
        ? `Image checked. It expects storage at ${result.volumeHints.map((h) => h.path).join(", ")}; see Runtime.`
        : "Image checked successfully.");
    } catch (caught) {
      setHints([]);
      setHint((caught instanceof ApiError ? caught : ApiError.network(caught)).message);
    } finally {
      setChecking(false);
    }
  }, [image, registry, setPort]);
  return { hint, hints, checking, check };
}
