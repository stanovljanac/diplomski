import { useLayoutEffect } from "react";

const useDocumentTitle = (title) => {
  useLayoutEffect(() => {
    if (title) {
      document.title = title;
    } else {
      document.title = "Diplomski - Mihailo Šebek";
    }
  }, [title]);
};

export default useDocumentTitle;
