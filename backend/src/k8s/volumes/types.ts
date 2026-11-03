export type Volume = {
  name: string;
  size: string;
  status: "pending" | "bound" | "lost";
  app?: string;
  mountPath?: string;
  createdAt: string;
};

export type VolumeMount = {
  name: string;
  mountPath: string;
  size?: string;
};
