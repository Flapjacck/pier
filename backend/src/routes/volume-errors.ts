import type { FastifyReply } from "fastify";
import {
  InvalidVolumesError,
  VolumeExistsError,
  VolumeInUseError,
  VolumeNotFoundError,
  VolumeQuotaExceededError,
  VolumesReplicaError,
} from "../k8s/volumes/errors.js";

export function mapVolumeError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof InvalidVolumesError || err instanceof VolumesReplicaError) {
    reply.status(400).send({ ok: false, error: "invalid request", details: err.message });
    return true;
  }
  if (err instanceof VolumeNotFoundError) {
    reply.status(404).send({ ok: false, error: "volume not found", details: err.message });
    return true;
  }
  if (err instanceof VolumeExistsError) {
    reply.status(409).send({ ok: false, error: "volume exists", details: err.message });
    return true;
  }
  if (err instanceof VolumeInUseError) {
    reply.status(409).send({ ok: false, error: "volume in use", details: err.message });
    return true;
  }
  if (err instanceof VolumeQuotaExceededError) {
    reply.status(403).send({ ok: false, error: "quota exceeded", details: err.message });
    return true;
  }
  return false;
}
