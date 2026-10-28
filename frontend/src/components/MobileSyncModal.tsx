import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import "./MobileSyncModal.css";

interface MobileSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverUrl?: string;
}

export const MobileSyncModal: React.FC<MobileSyncModalProps> = ({
  isOpen,
  onClose,
  serverUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  // Compute active target URL
  const targetUrl =
    serverUrl ||
    (typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:5173`
      : "http://localhost:5173");

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, targetUrl, {
        width: 190,
        margin: 2,
        color: {
          dark: "#f3e8ff",
          light: "#110c22",
        },
      }).catch((err) => {
        console.error("Failed to generate QR code", err);
      });
    }
  }, [isOpen, targetUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mobile-sync-overlay" onClick={onClose}>
      <div className="mobile-sync-card" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-sync-header">
          <div className="mobile-sync-header-title">
            <div className="mobile-sync-icon-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="3" />
              </svg>
            </div>
            <span>Connect Mobile App (PWA)</span>
          </div>
          <button className="mobile-sync-close-btn" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="mobile-sync-body">
          <div className="qr-canvas-container">
            <canvas ref={canvasRef} className="qr-canvas" />
          </div>

          <div className="mobile-sync-url-box">
            <span className="mobile-sync-url-text">{targetUrl}</span>
            <button className="mobile-sync-copy-btn" onClick={handleCopy}>
              {copied ? "Copied! ✓" : "Copy"}
            </button>
          </div>

          <div className="mobile-pwa-steps">
            <div className="mobile-pwa-steps-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Install on Android (No App Store Needed)</span>
            </div>
            <div className="mobile-pwa-step-item">
              <span className="step-num">1</span>
              <span>Point your Android phone camera at the QR code above and open the link.</span>
            </div>
            <div className="mobile-pwa-step-item">
              <span className="step-num">2</span>
              <span>In Chrome, tap the banner or menu (⋮) → <strong>"Install app"</strong> (or <strong>"Add to Home screen"</strong>).</span>
            </div>
            <div className="mobile-pwa-step-item">
              <span className="step-num">3</span>
              <span>Tina is now a standalone app on your home screen! All changes instantly sync with your laptop.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
