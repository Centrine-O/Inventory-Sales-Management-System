import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// The Shape Detection API isn't in TypeScript's DOM types yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const Detector = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/** True on browsers with a built-in barcode detector (e.g. Chrome on Android) and a camera API. */
export const cameraScanSupported = () => Boolean(Detector) && Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Scan a barcode with the device camera using the browser's native BarcodeDetector.
 * Renders nothing where unsupported, so USB/Bluetooth scanners and typing remain the fallback.
 */
export function CameraScanButton({ onDetected }: { onDetected: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!cameraScanSupported()) return null;
  return (
    <>
      <Button type="button" variant="outline" size="icon" onClick={() => setOpen(true)} aria-label="Scan with camera" title="Scan with camera">
        <Camera className="h-4 w-4" />
      </Button>
      <CameraScanDialog
        open={open}
        onOpenChange={setOpen}
        onDetected={(code) => {
          setOpen(false);
          onDetected(code);
        }}
      />
    </>
  );
}

function CameraScanDialog({ open, onOpenChange, onDetected }: { open: boolean; onOpenChange: (o: boolean) => void; onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Parents pass a new callback each render; keep the latest in a ref so the camera isn't restarted.
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  useEffect(() => {
    if (!open || !Detector) return;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    setError(null);

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found[0]?.rawValue) {
              onDetectedRef.current(found[0].rawValue.trim());
              return;
            }
          } catch {
            /* frame not ready yet */
          }
          timer = window.setTimeout(tick, 250);
        };
        tick();
      } catch (e) {
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser settings and try again."
            : "Couldn't start the camera on this device.",
        );
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan barcode</DialogTitle>
          <DialogDescription>Point the camera at the barcode and hold steady.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
