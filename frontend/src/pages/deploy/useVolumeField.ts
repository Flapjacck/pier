import { useEffect, useRef, useState } from "react";
import { listVolumes } from "../../api/client";
import type { Volume, VolumeMount } from "../../api/types";

export function useVolumeField(appName: string): {
  volume?: VolumeMount;
  mode: "new" | "existing";
  setMode: (mode: "new" | "existing") => void;
  available: Volume[];
  loading: boolean;
  setVolume: (volume: VolumeMount | undefined) => void;
  setVolumeName: (name: string) => void;
} {
  const [volume, setVolume] = useState<VolumeMount>();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [available, setAvailable] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(false);
  const nameEdited = useRef(false);
  const defaultName = `${appName || "app"}-data`;

  useEffect(() => {
    if (!nameEdited.current && mode === "new") {
      setVolume((current) => current ? { ...current, name: defaultName } : current);
    }
  }, [appName, defaultName, mode]);

  useEffect(() => {
    if (mode !== "existing") return;
    setLoading(true);
    void listVolumes().then(setAvailable).finally(() => setLoading(false));
  }, [mode]);

  return {
    volume,
    mode,
    setMode,
    available: available.filter((item) => !item.app),
    loading,
    setVolume: (next) => {
      if (next === undefined) nameEdited.current = false;
      setVolume(next);
    },
    setVolumeName: (name) => {
      nameEdited.current = true;
      setVolume((current) => current ? { ...current, name } : current);
    },
  };
}
