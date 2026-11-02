import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HostField } from "../../../src/pages/deploy/HostField";

const noop = () => {};

function renderField(tls?: boolean, subdomain = "demo") {
  render(
    <HostField
      id="host"
      subdomain={subdomain}
      ingressDomain="192.0.2.10.nip.io"
      tls={tls}
      onSubdomainChange={noop}
      onClearError={noop}
    />,
  );
}

describe("HostField URL preview", () => {
  it("previews http:// by default", () => {
    renderField();
    expect(screen.getByText("http://demo.192.0.2.10.nip.io")).toBeInTheDocument();
  });

  it("previews https:// when TLS is on", () => {
    renderField(true);
    expect(screen.getByText("https://demo.192.0.2.10.nip.io")).toBeInTheDocument();
  });

  it("shows an example host before a subdomain is typed", () => {
    renderField(true, "");
    expect(screen.getByText("e.g. demo.192.0.2.10.nip.io")).toBeInTheDocument();
  });
});
