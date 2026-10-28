import React, { useState, useRef, useEffect } from "react";
import type { NavItem } from "./RollingDialNav";
import "./MobileExpandableNav.css";

interface MobileExpandableNavProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  items: NavItem[];
  onOpenSettings?: () => void;
  onOpenChange?: (isOpen: boolean) => void;
}

/* ==========================================================================
   Static Navigation Bar Icons (matching user reference screenshot):
   1. 4-Square Rounded Grid (Left: Dashboard / Trackers)
   2. Upward Caret (Center: Swipe/Tap indicator)
   3. Card / Tab Stack (Right: Life Tree / Tabs)
   ========================================================================== */

export const Grid4Icon: React.FC<{ size?: number; color?: string }> = ({
  size = 22,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="2" />
    <rect x="14" y="3.5" width="6.5" height="6.5" rx="2" />
    <rect x="14" y="14" width="6.5" height="6.5" rx="2" />
    <rect x="3.5" y="14" width="6.5" height="6.5" rx="2" />
  </svg>
);

export const LifeTreeNavIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 22,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="5" r="3" />
    <circle cx="6" cy="19" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M12 8v4" />
    <path d="M12 12a6 6 0 0 0-6 4v3" />
    <path d="M12 12a6 6 0 0 1 6 4v3" />
  </svg>
);

export const CardStackIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 22,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3.5" y="5.5" width="17" height="14" rx="3.5" />
    <path d="M7.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 16.5 4v1.5" />
  </svg>
);

export const UpChevronIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 12,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 15l-6-6-6 6" />
  </svg>
);

/* ==========================================================================
   Reference Icons matching user screenshot:
   1. Glowing 3D Crystal Cube (Center Apex)
   2. Sunburst Asterisk (Claude snowflake, Flanking Left)
   3. Sparkle Star (Gemini 4-point star, Flanking Right)
   4. Whale Icon (DeepSeek, Bottom-Left corner)
   5. OpenAI Spiral Knot (ChatGPT, Bottom-Right corner)
   ========================================================================== */

export const TinaRibbonLogo: React.FC<{ size?: number; className?: string }> = ({ size = 32, className = "" }) => (
  <img
    src="/app-logo.png"
    alt="Tina Logo"
    className={`tina-ribbon-logo ${className}`}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      borderRadius: Math.round(size * 0.22),
      filter: "drop-shadow(0 0 10px rgba(168, 85, 247, 0.7))",
      display: "block",
    }}
  />
);

export const Glowing3DCube: React.FC<{ size?: number }> = ({ size = 44 }) => (
  <div className="dome-3d-cube-wrapper" style={{ width: size, height: size }}>
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <defs>
        <linearGradient id="cubeTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="60%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
        <linearGradient id="cubeLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id="cubeRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="60%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#6b21a8" />
        </linearGradient>
      </defs>
      {/* Top Face */}
      <path
        d="M22 6 L35 13.5 C36 14.1 36 15 35 15.6 L22 23 C21.4 23.4 20.6 23.4 20 23 L7 15.6 C6 15 6 14.1 7 13.5 L20 6 C20.6 5.6 21.4 5.6 22 6 Z"
        fill="url(#cubeTop)"
      />
      {/* Left Face */}
      <path
        d="M6.5 16.5 L19.5 24 C20 24.3 20.5 25 20.5 25.8 L20.5 37 C20.5 38 19.5 38.8 18.5 38.2 L7 31 C6 30.4 5.5 29.5 5.5 28.5 L5.5 18 C5.5 17 6 16.2 6.5 16.5 Z"
        fill="url(#cubeLeft)"
      />
      {/* Right Face */}
      <path
        d="M21.5 24 L34.5 16.5 C35 16.2 35.5 17 35.5 18 L35.5 28.5 C35.5 29.5 35 30.4 34 31 L22.5 38.2 C21.5 38.8 20.5 38 20.5 37 L20.5 25.8 C20.5 25 21 24.3 21.5 24 Z"
        fill="url(#cubeRight)"
      />
    </svg>
  </div>
);

export const SunburstIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <g transform="translate(12, 12)">
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
        <rect
          key={deg}
          x="-1.15"
          y="-9.5"
          width="2.3"
          height="5.8"
          rx="1.15"
          transform={`rotate(${deg})`}
        />
      ))}
      <circle cx="0" cy="0" r="2.8" />
    </g>
  </svg>
);

export const SparkleStarIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
  </svg>
);

export const WhaleIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 13.5c1-3.5 4.5-6 8.5-6 5.5 0 9.5 3.5 9.5 8 0 1.5-.5 2.8-1.5 3.8-2 2-5 2.2-7.5 1.2-2.5-1-4-2.5-5.5-3.5-1.5-1-3-1-4-.5z" />
    <path d="M19.5 9.5c.8-1.5 2-2.5 3.5-2.5-1 2.5-.5 4.5 0 6" />
    <circle cx="8" cy="11.5" r="1.1" fill="currentColor" />
  </svg>
);

export const OpenAIIcon: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 3.46 2L17 5.73a4 4 0 0 1 1.46 5.46L17.5 13a4 4 0 0 1-2 3.46l-1.73 1a4 4 0 0 1-5.46-1.46L7.5 14.5a4 4 0 0 1-1.46-5.46L7.5 7.27a4 4 0 0 1 2-3.46L11.23 2.8A4 4 0 0 1 12 2z"/>
    <path d="M12 8.5v7"/>
    <path d="M8.5 10l7 4"/>
    <path d="M8.5 14l7-4"/>
  </svg>
);

export const MobileExpandableNav: React.FC<MobileExpandableNavProps> = ({
  activeTab,
  onSelectTab,
  items,
  onOpenSettings,
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dragOffsetAngle, setDragOffsetAngle] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const updateIsOpen = (open: boolean) => {
    setIsOpen(open);
    if (onOpenChange) onOpenChange(open);
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const currentDragAngle = useRef<number>(0);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeTab)
  );

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        updateIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Touch Drag Handlers for Thumb Swipe
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    touchStartX.current = clientX;
    touchStartY.current = clientY;
    setIsDragging(true);
    currentDragAngle.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (touchStartX.current === null) return;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const diffX = clientX - touchStartX.current;
    const diffY = clientY - (touchStartY.current || 0);

    // If swiping down forcefully, collapse dome
    if (diffY > 60 && Math.abs(diffY) > Math.abs(diffX)) {
      setIsOpen(false);
      touchStartX.current = null;
      setIsDragging(false);
      setDragOffsetAngle(0);
      return;
    }

    // Convert thumb horizontal delta to degrees on the arc
    const angleDelta = (diffX / 130) * 45;
    currentDragAngle.current = angleDelta;
    setDragOffsetAngle(angleDelta);
  };

  const handleTouchEnd = () => {
    if (touchStartX.current === null) return;
    const finalAngle = currentDragAngle.current;

    // Each item is spaced by 38 degrees along the arc
    const STEP_ANGLE = 38;
    const steps = Math.round(-finalAngle / STEP_ANGLE);

    if (steps !== 0) {
      const newIndex =
        (activeIndex + steps + items.length * 10) % items.length;
      onSelectTab(items[newIndex].id);
    }

    touchStartX.current = null;
    touchStartY.current = null;
    currentDragAngle.current = 0;
    setIsDragging(false);
    setDragOffsetAngle(0);
  };

  const handleItemClick = (index: number) => {
    onSelectTab(items[index].id);
  };

  const activeItem = items[activeIndex] || items[0];

  // Helper to render the matching screenshot icon for each tab item
  const renderItemIcon = (itemId: string, isApex: boolean) => {
    if (isApex) {
      return <TinaRibbonLogo size={46} />;
    }
    switch (itemId) {
      case "voice":
        return <TinaRibbonLogo size={32} />;
      case "research":
        return <SunburstIcon size={21} />;
      case "myday":
        return <SparkleStarIcon size={21} />;
      case "trackers":
        return <WhaleIcon size={21} />;
      case "lifetree":
        return <LifeTreeNavIcon size={21} />;
      case "memory":
        return (
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
          </svg>
        );
      default:
        return <SparkleStarIcon size={21} />;
    }
  };

  return (
    <div className="mobile-expandable-nav-root">
      {/* Dimmed backdrop when semi-circle dome is open */}
      {isOpen && (
        <div
          className="mobile-arc-backdrop"
          onClick={() => updateIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {!isOpen ? (
        /* =========================================================
           1. Static State: Bottom Dock matching user reference screenshot
           ========================================================= */
        <div
          className="mobile-static-nav-bar"
          role="navigation"
          aria-label="Bottom Navigation"
        >
          {/* Left Button: 4-Square Grid (Dashboard / Trackers) */}
          <button
            type="button"
            className={`static-nav-btn ${activeTab === "trackers" || activeTab === "myday" ? "active" : ""}`}
            onClick={() => onSelectTab("trackers")}
            title="Overview & Trackers"
          >
            <Grid4Icon size={22} />
          </button>

          {/* Center Button: Upward Caret + Glowing 3D Crystal Cube with Radiant Aura */}
          <div
            className="static-nav-center-zone"
            onClick={() => updateIsOpen(true)}
            role="button"
            tabIndex={0}
            aria-label="Open AI Navigation Dome"
          >
            <div className="static-center-caret">
              <UpChevronIcon size={12} />
            </div>
            <div className="static-cube-wrapper">
              <div className="static-cube-light-pool" />
              <TinaRibbonLogo size={36} />
            </div>
          </div>

          {/* Right Button: Life Tree Hierarchy */}
          <button
            type="button"
            className={`static-nav-btn ${activeTab === "lifetree" || activeTab === "memory" ? "active" : ""}`}
            onClick={() => onSelectTab("lifetree")}
            title="Life Tree"
          >
            <LifeTreeNavIcon size={22} />
          </button>
        </div>
      ) : (
        /* =========================================================
           2. Expanded State: Arched Semi-Circle Dome
           ========================================================= */
        <div
          className="mobile-arc-dome"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={isDragging ? handleTouchMove : undefined}
          onMouseUp={handleTouchEnd}
        >
          {/* Subtle top pull handle */}
          <div className="dome-handle-pip" onClick={() => updateIsOpen(false)} />

          {/* Centered Heading ("SMART AI" as in reference image) */}
          <div className="dome-header-row">
            <span className="dome-header-title">
              {activeTab === "voice" ? "SMART AI" : activeItem.label.toUpperCase()}
            </span>
          </div>

          {/* Radial Semi-Circle Track */}
          <div className="dome-arc-track">
            <div className="dome-guide-curve" />

            {items.map((item, idx) => {
              let diff = idx - activeIndex;

              // Wrap around circular calculation
              if (diff > items.length / 2) diff -= items.length;
              if (diff < -items.length / 2) diff += items.length;

              const STEP_ANGLE = 38;
              const angleDeg = diff * STEP_ANGLE + dragOffsetAngle;
              const rad = (angleDeg * Math.PI) / 180;

              // Radius of the semi-circle arch
              const R = 125;
              const x = Math.sin(rad) * R;
              const y = -Math.cos(rad) * R + 68;

              const absAngle = Math.abs(angleDeg);
              const isCenterApex = absAngle < 18;

              // Smoothly fade out items as they move down the sides of the arch
              const opacity = Math.max(0, 1 - absAngle / 85);
              const scale = isCenterApex ? 1.15 : Math.max(0.72, 1 - absAngle / 160);

              if (absAngle > 88) return null;

              return (
                <div
                  key={item.id}
                  className={`dome-arc-item ${isCenterApex ? "active" : ""} ${
                    isDragging ? "dragging" : ""
                  }`}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                    opacity,
                    zIndex: 30 - Math.round(absAngle),
                  }}
                  onClick={() => handleItemClick(idx)}
                >
                  {isCenterApex ? (
                    <div className="dome-crystal-cube">
                      {renderItemIcon(item.id, true)}
                    </div>
                  ) : (
                    <div className="dome-flank-icon">
                      {renderItemIcon(item.id, false)}
                    </div>
                  )}

                  <span className="dome-item-caption">{item.label}</span>
                </div>
              );
            })}
          </div>

          {/* Bottom Controls: Whale (left), Settings (center), OpenAI (right) */}
          <div className="dome-bottom-controls">
            {/* Left Corner Shortcut: Whale icon (matching screenshot) */}
            <button
              type="button"
              className="dome-corner-btn"
              onClick={() => onSelectTab("trackers")}
              title="Trackers"
            >
              <WhaleIcon size={19} />
            </button>

            {/* Center "Settings" Pill (matches user reference image) */}
            <button
              type="button"
              className="dome-settings-pill"
              onClick={() => {
                if (onOpenSettings) onOpenSettings();
                else updateIsOpen(false);
              }}
            >
              Settings
            </button>

            {/* Right Corner Shortcut: Life Tree icon */}
            <button
              type="button"
              className="dome-corner-btn"
              onClick={() => onSelectTab("lifetree")}
              title="Life Tree"
            >
              <LifeTreeNavIcon size={19} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
