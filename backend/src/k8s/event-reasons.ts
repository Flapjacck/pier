export function summarizeEvent(reason: string, message: string): string | undefined {
  const lower = message.toLowerCase();
  switch (reason) {
    case "FailedScheduling":
      if (lower.includes("insufficient cpu")) return "Not enough CPU on the node.";
      if (lower.includes("insufficient memory")) return "Not enough memory on the node.";
      if (lower.includes("quota")) return "The app exceeded its namespace quota.";
      return "The app could not be scheduled on a node.";
    case "BackOff":
      return lower.includes("pull") ? "Kubernetes is backing off while pulling the image." : "Kubernetes is backing off while restarting the crashed container.";
    case "Unhealthy":
      return lower.includes("readiness") ? "The readiness health check is failing." : lower.includes("liveness") ? "The liveness health check is failing." : "A health check is failing.";
    case "OOMKilling":
    case "OOMKilled":
      return "The app ran out of memory; raise the memory limit in Settings.";
    case "Evicted":
      return "The node ran low on resources and evicted the pod.";
    case "FailedMount":
      return "A volume could not be mounted.";
    case "Failed":
    case "ErrImagePull":
    case "ImagePullBackOff":
      return "The image could not be pulled; check its name, tag, or registry access.";
    case "Killing": return "Kubernetes is stopping the container.";
    case "Pulled": return "Kubernetes pulled the image.";
    case "Created": return "Kubernetes created the container.";
    case "Started": return "Kubernetes started the container.";
    case "Scheduled": return "Kubernetes scheduled the pod.";
    case "ScalingReplicaSet": return "Kubernetes is scaling the ReplicaSet.";
    case "SuccessfulCreate": return "Kubernetes created the resource.";
    case "SuccessfulDelete": return "Kubernetes deleted the resource.";
    default: return undefined;
  }

}

export function eventReasonDescription(reason: string, message = ""): string | undefined {
  return summarizeEvent(reason, message);
}
