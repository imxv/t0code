import { useGT } from "gt-react";
import { useLayoutEffect, useRef, useState } from "react";
import { MaximizeIcon, MinusIcon, PlusIcon, ScanIcon } from "lucide-react";
import { ExpandedImageDialog } from "~/components/chat/ExpandedImageDialog";
import { observeResize } from "~/lib/observeResize";
import { AttachmentImage } from "../media/AttachmentImage";
import { FileSurfaceAction, FileSurfaceFailure } from "./fileSurfaceChrome";

export default function PreviewImageContent(props: {
  readonly src: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly refreshPending?: boolean;
  readonly onError?: () => void;
}) {
  const gt = useGT();
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState<{ src: string; width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const requestedSrc = props.refreshPending && shown !== null ? shown.src : props.src;
  const failed = shown === null && failedSrc === requestedSrc;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Measure the image viewport before paint and observe resizes to keep fit-to-view scaling accurate.
  useLayoutEffect(() => {
    if (failed) return;
    const node = ref.current;
    if (!node) return;
    // clientWidth rounds a fractional pane size up, and an image fitted to it overflows the pane.
    // The computed size keeps the fraction; it reads "auto" while an ancestor is display:none.
    const update = () => {
      const size = getComputedStyle(node);
      setViewport({
        width: Math.floor(Number.parseFloat(size.width) || 0),
        height: Math.floor(Number.parseFloat(size.height) || 0),
      });
    };
    update();
    return observeResize(node, update);
  }, [failed]);
  const sources =
    shown === null || shown.src === requestedSrc || failedSrc === requestedSrc
      ? [shown?.src ?? requestedSrc]
      : [shown.src, requestedSrc];
  const fit = shown
    ? Math.min(
        1,
        Math.max(1, viewport.width - 32) / shown.width,
        Math.max(1, viewport.height - 32) / shown.height,
      )
    : 1;
  const scale = zoom ?? fit;
  const changeZoom = (factor: number) => setZoom(Math.max(0.05, Math.min(8, scale * factor)));
  if (failed) {
    return <FileSurfaceFailure message={gt("Unable to load image.")} />;
  }
  return (
    <>
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-1 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {shown
            ? `${shown.width.toLocaleString()} × ${shown.height.toLocaleString()}`
            : gt("Loading image…")}
        </span>
        <div className="flex items-center gap-1">
          <FileSurfaceAction
            label={gt("Zoom out")}
            disabled={shown === null || scale <= 0.05}
            onPress={() => changeZoom(1 / 1.25)}
          >
            <MinusIcon className="size-3.5" />
          </FileSurfaceAction>
          <span className="min-w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <FileSurfaceAction
            label={gt("Zoom in")}
            disabled={shown === null || scale >= 8}
            onPress={() => changeZoom(1.25)}
          >
            <PlusIcon className="size-3.5" />
          </FileSurfaceAction>
          <FileSurfaceAction
            label={gt("Fit image")}
            pressed={zoom === null}
            onPress={() => setZoom(null)}
          >
            <ScanIcon className="size-3.5" />
          </FileSurfaceAction>
          <FileSurfaceAction
            label={gt("Actual image size")}
            pressed={zoom === 1}
            onPress={() => setZoom(1)}
          >
            <MaximizeIcon className="size-3.5" />
          </FileSurfaceAction>
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto">
        <div
          className="flex min-h-full min-w-full items-center justify-center p-4"
          style={{
            width: shown ? shown.width * scale + 32 : undefined,
            height: shown ? shown.height * scale + 32 : undefined,
          }}
        >
          <button
            type="button"
            aria-label={gt("Zoom {name}", { name: props.name })}
            className="relative shrink-0 cursor-zoom-in"
            onClick={() => setExpanded(true)}
          >
            {sources.map((src) => {
              const visible = shown?.src === src;
              return (
                <AttachmentImage
                  key={src}
                  name={props.name}
                  mimeType={props.mimeType}
                  src={src}
                  alt={props.name}
                  aria-hidden={!visible}
                  className={
                    visible ? "block max-w-none" : "pointer-events-none invisible absolute"
                  }
                  style={{
                    width: visible ? shown.width * scale : 0,
                    height: visible ? shown.height * scale : 0,
                  }}
                  onLoad={async ({ currentTarget: image }) => {
                    if (src !== requestedSrc) return;
                    const loadedSrc = image.currentSrc;
                    await image.decode().catch(() => undefined);
                    if (!image.isConnected || image.currentSrc !== loadedSrc) return;
                    setShown({ src, width: image.naturalWidth, height: image.naturalHeight });
                  }}
                  onError={() => {
                    if (src !== requestedSrc) return;
                    setFailedSrc(src);
                    props.onError?.();
                  }}
                />
              );
            })}
          </button>
        </div>
      </div>
      {expanded ? (
        <ExpandedImageDialog
          preview={{
            images: [
              {
                src: shown?.src ?? requestedSrc,
                name: props.name,
                ...(props.mimeType ? { mimeType: props.mimeType } : {}),
              },
            ],
            index: 0,
          }}
          onClose={() => setExpanded(false)}
        />
      ) : null}
    </>
  );
}
