import { type AnchorHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: React.ReactNode;
}

/**
 * External link with an inline arrow icon (opens in new tab).
 * Used for app URLs and other external references.
 */
export const ExternalLink = forwardRef<HTMLAnchorElement, Props>(
  ({ className, children, ...rest }, ref) => {
    return (
      <a
        ref={ref}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "text-pier-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pier-focus rounded-sm inline-flex items-center gap-1",
          className,
        )}
        {...rest}
      >
        {children}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    );
  },
);

ExternalLink.displayName = "ExternalLink";
