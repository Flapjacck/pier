export class InvalidVolumesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVolumesError";
  }
}

export class VolumesReplicaError extends Error {
  constructor(message = "apps with volumes run at most 1 replica") {
    super(message);
    this.name = "VolumesReplicaError";
  }
}

export class VolumeExistsError extends Error {
  constructor(message = "volume exists") {
    super(message);
    this.name = "VolumeExistsError";
  }
}

export class VolumeNotFoundError extends Error {
  constructor(message = "volume not found") {
    super(message);
    this.name = "VolumeNotFoundError";
  }
}

export class VolumeInUseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolumeInUseError";
  }
}

export class VolumeQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VolumeQuotaExceededError";
  }
}

export class StorageClassMissingError extends Error {
  constructor() {
    super("StorageClass pier-local not found; re-run deploy-local.sh");
    this.name = "StorageClassMissingError";
  }
}
