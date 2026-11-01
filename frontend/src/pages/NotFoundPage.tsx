import { useNavigate } from "react-router-dom";
import { ThemeIllustration } from "../components/brand/ThemeIllustration";
import { Button } from "../components/ui/Button";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
      <ThemeIllustration base="lost-at-sea-colour" alt="" className="mb-6" width={280} />
      <h1 className="m-0 text-xl font-bold text-pier-fg">Page not found</h1>
      <p className="mt-2 mb-6 text-sm text-pier-muted m-0">
        That route is not on the pier. Head back to your apps list.
      </p>
      <Button type="button" variant="secondary" onClick={() => navigate("/apps")}>
        Back to apps
      </Button>
    </div>
  );
}
