import type { DeployFormValues } from "../../src/lib/deployValidation";

export const validForm: DeployFormValues = {
  name: "myapp",
  image: "nginx:latest",
  port: "8080",
  replicas: "3",
  host: "",
  env: [],
  publicUrl: false,
};
