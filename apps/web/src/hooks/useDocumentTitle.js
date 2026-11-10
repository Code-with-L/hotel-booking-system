import { useEffect } from "react";

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — The Stillhouse` : "The Stillhouse — A quieter kind of extraordinary";
  }, [title]);
}
