import { useCallback, useState } from "react";
import { inspectImage } from "../../api/registries";
import { ApiError } from "../../api/errors";
import type { VolumeMount } from "../../api/types";

export function useImageInspection(
  image: string,
  registry: string,
  name: string,
  setPort: (port: string) => void,
  setVolume: (volume: VolumeMount | undefined) => void,
  setMode: (mode: "new" | "existing") => void,
) {
  const [hint, setHint] = useState<string>();
  const [checking, setChecking] = useState(false);
  const check = useCallback(async () => {
    if (!image.trim()) return;
    setChecking(true);
    setHint(undefined);
    try {
      const result = await inspectImage({ image: image.trim(), registry: registry || undefined });
      if (result.exposedPorts[0] !== undefined) setPort(String(result.exposedPorts[0]));
      if (result.volumes.length > 0) {
        setVolume({ name: `${name || "app"}-data`, mountPath: result.volumes[0], size: "1Gi" });
        setMode("new");
        setHint(`This image expects storage at ${result.volumes.join(", ")}.`);
      } else setHint("Image checked successfully.");
    } catch (caught) {
      setHint((caught instanceof ApiError ? caught : ApiError.network(caught)).message);
    } finally {
      setChecking(false);
    }
  }, [image, registry, name, setPort, setVolume, setMode]);
  return { hint, checking, check };
}
