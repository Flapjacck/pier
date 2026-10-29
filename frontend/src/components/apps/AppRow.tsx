import type { AppRow as AppRowData } from "../../types/app";
import { StatusPill } from "./StatusPill";

interface Props {
  app: AppRowData;
}

/** Single row in the Apps table. */
export function AppRow({ app }: Props) {
  return (
    <tr>
      <td>
        <strong>{app.name}</strong>
      </td>
      <td>
        <StatusPill status={app.status} />
      </td>
      <td style={{ color: "var(--pier-muted)", fontSize: 13 }}>
        {app.ago}
      </td>
      <td>
        <code style={{ fontSize: 12.5 }}>{app.ref}</code>
      </td>
    </tr>
  );
}
