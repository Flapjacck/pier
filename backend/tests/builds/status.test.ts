import assert from "node:assert/strict";
import type { V1ContainerStatus, V1Job, V1Pod } from "@kubernetes/client-node";
import { describe, it } from "node:test";
import { buildState, containerDone, readableContainers } from "../../src/builds/status.js";

const base = { repo: "https://github.com/acme/web", branch: "main", timeoutSeconds: 900 };
const job = (conditions: { type: string; status: string; reason?: string; message?: string }[] = []): V1Job => ({ status: { conditions } });
const running = (name: string): V1ContainerStatus => ({ name, image: "img", imageID: "", ready: false, restartCount: 0, state: { running: {} } });
const exited = (name: string, exitCode: number): V1ContainerStatus => ({ name, image: "img", imageID: "", ready: false, restartCount: 0, state: { terminated: { exitCode } } });
const waiting = (name: string, reason: string, message = "boom"): V1ContainerStatus => ({ name, image: "alpine/git:v2.54.0", imageID: "", ready: false, restartCount: 0, state: { waiting: { reason, message } } });
const pod = (init: V1ContainerStatus[], main: V1ContainerStatus[] = [], phase = "Pending"): V1Pod => ({ metadata: { name: "p" }, status: { phase, initContainerStatuses: init, containerStatuses: main } });

describe("build status → Build step (#83)", () => {
  it("pending, then running per container, then succeeded", () => {
    assert.deepEqual(buildState({ ...base, job: job(), pod: undefined }), { phase: "pending" });
    assert.deepEqual(buildState({ ...base, job: job(), pod: pod([exited("clone", 0), running("prepare")]) }), { phase: "running", container: "prepare" });
    assert.deepEqual(buildState({ ...base, job: job([{ type: "Complete", status: "True" }]), pod: pod([exited("clone", 0)], [exited("build", 0)], "Succeeded") }), { phase: "succeeded" });
  });

  it("maps each container's failure to a plain reason", () => {
    const at = (s: V1ContainerStatus, main: V1ContainerStatus[] = []) => buildState({ ...base, job: job(), pod: pod([s], main) });
    assert.match(failed(at(exited("fetch", 22))), /download the Railpack CLI.*github\.com/);
    assert.match(failed(at(exited("clone", 128))), /Could not clone https:\/\/github\.com\/acme\/web \(branch main\).*credential/);
    assert.match(failed(at(exited("clone", 2))), /folder was not found/);
    assert.match(failed(at(exited("prepare", 1))), /Railpack could not work out/);
    assert.match(failed(at(exited("clone", 0), [exited("build", 1)])), /image build failed \(exit code 1\)/);
    assert.match(failed(at(exited("clone", 0), [exited("build", 2)])), /Dockerfile was not found/);
    const state = at(exited("clone", 0), [exited("build", 1)]);
    assert.equal(state.phase === "failed" ? state.container : null, "build");
  });

  it("image pull and missing credential Secrets fail fast", () => {
    assert.match(failed(buildState({ ...base, job: job(), pod: pod([waiting("clone", "ImagePullBackOff")]) })), /Could not pull the build image alpine\/git/);
    assert.match(failed(buildState({ ...base, gitCredential: "github", job: job(), pod: pod([waiting("clone", "CreateContainerConfigError", 'secret "pier-git-github" not found')]) })), /git credential "github" could not be read/);
    assert.deepEqual(buildState({ ...base, job: job(), pod: pod([waiting("clone", "PodInitializing")]) }), { phase: "pending" });
  });

  it("deadline, a deleted Job and a failed pod", () => {
    assert.match(failed(buildState({ ...base, job: job([{ type: "Failed", status: "True", reason: "DeadlineExceeded" }]), pod: undefined })), /longer than 15 minutes/);
    assert.match(failed(buildState({ ...base, job: undefined, pod: undefined })), /disappeared/);
    assert.match(failed(buildState({ ...base, job: job(), pod: { status: { phase: "Failed", reason: "Evicted" } } })), /pod failed: Evicted/);
  });

  it("lists containers with readable logs in run order", () => {
    const p = pod([exited("fetch", 0), running("clone")]);
    assert.deepEqual(readableContainers(p, ["fetch", "clone", "prepare", "build"]), ["fetch", "clone"]);
    assert.equal(containerDone(p, "fetch"), true);
    assert.equal(containerDone(p, "clone"), false);
  });
});

function failed(state: ReturnType<typeof buildState>): string {
  assert.equal(state.phase, "failed");
  return state.phase === "failed" ? state.reason : "";
}
