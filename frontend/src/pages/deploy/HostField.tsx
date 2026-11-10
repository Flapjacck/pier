import { Input } from "../../components/ui/Input";
import { Field } from "../../components/ui/Field";
import { subdomainInput } from "../../lib/host";

interface Props {
  id: string;
  subdomain: string;
  ingressDomain: string | null;
  /** Preview the URL as https:// (backend TLS on). */
  tls?: boolean;
  onSubdomainChange: (subdomain: string) => void;
  onClearError: () => void;
  error?: string;
}

/**
 * Host input with fixed ingress domain suffix (Vercel-style).
 * Shows subdomain + "." + domain, or plain text input when ingress is not configured.
 */
export function HostField({
  id,
  subdomain,
  ingressDomain,
  tls = false,
  onSubdomainChange,
  onClearError,
  error,
}: Props) {
  if (!ingressDomain) {
    return (
      <Field
        id={id}
        label="Public URL"
        hint="Public URLs are off: PIER_INGRESS_DOMAIN isn't set on the backend."
        error={error}
      >
        <Input disabled placeholder="Not available" />
      </Field>
    );
  }

  return (
    <Field
      id={id}
      label="Public URL"
      hint={
        subdomain
          ? `${tls ? "https" : "http"}://${subdomain}.${ingressDomain}`
          : `e.g. demo.${ingressDomain}`
      }
      error={error}
    >
      <div className="flex items-center gap-2">
        <Input
          value={subdomain}
          onChange={(e) => {
            // Pasting "app.<domain>" or a full URL keeps only the subdomain (#83).
            onSubdomainChange(subdomainInput(e.target.value, ingressDomain));
            if (error) {
              onClearError();
            }
          }}
          placeholder="demo"
        />
        <span className="text-pier-muted text-[13px] whitespace-nowrap">
          .{ingressDomain}
        </span>
      </div>
    </Field>
  );
}
