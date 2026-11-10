import { useCallback, useState } from "react";

/** App name and public subdomain; the subdomain follows the name until edited. */
export function useNameHost() {
  const [name, setNameState] = useState("");
  const [publicUrl, setPublicUrlState] = useState(true);
  const [subdomain, setSubdomainState] = useState("");
  const [follows, setFollows] = useState(true);

  const setName = useCallback((next: string) => {
    setNameState(next);
    if (follows && publicUrl) setSubdomainState(next.toLowerCase());
  }, [follows, publicUrl]);

  const setSubdomain = useCallback((next: string) => {
    setSubdomainState(next);
    setFollows(false);
  }, []);

  const setPublicUrl = useCallback((checked: boolean) => {
    setPublicUrlState(checked);
    if (checked) {
      setSubdomainState(name.toLowerCase());
      setFollows(true);
    }
  }, [name]);

  return { name, setName, publicUrl, setPublicUrl, subdomain, setSubdomain };
}
