/** Resource request for CPU. */
export const CPU_REQUEST = "50m";

/** Resource limit for CPU. */
export const CPU_LIMIT = "500m";

/** Resource request for memory. */
export const MEMORY_REQUEST = "64Mi";

/** Resource limit for memory. */
export const MEMORY_LIMIT = "256Mi";

/** Resource request for ephemeral storage. */
export const EPHEMERAL_STORAGE_REQUEST = "64Mi";

/** Resource limit for ephemeral storage. */
export const EPHEMERAL_STORAGE_LIMIT = "1Gi";

/** Rollout deadline: 120 seconds to cap time-to-failure for immediately-exiting apps. */
export const PROGRESS_DEADLINE_SECONDS = 120;
