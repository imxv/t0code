import { lazy, Suspense, type ComponentProps } from "react";

import { FileSurfaceLoading } from "./fileSurfaceChrome";

const PreviewImageContent = lazy(() => import("./PreviewImageContent"));

export function PreviewImage(props: ComponentProps<typeof PreviewImageContent>) {
  return (
    <Suspense fallback={<FileSurfaceLoading />}>
      <PreviewImageContent {...props} />
    </Suspense>
  );
}
