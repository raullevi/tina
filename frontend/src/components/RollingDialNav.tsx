import React, { useRef, useState } from "react";
import "./RollingDialNav.css";

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  desc?: string;
}

interface RollingDialNavProps {
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

export const RollingDialNav: React.FC<RollingDialNavProps> = ({
  items,
  activeId,
  onSelect,
}) => {
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const touchStartX = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePrev = () => {
    const nextIdx = (activeIndex - 1 + items.length) % items.length;
    onSelect(items[nextIdx].id);
  };

  const handleNext = () => {
    const nextIdx = (activeIndex + 1) % items.length;
    onSelect(items[nextIdx].id);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 35) {
      if (diff > 0) handlePrev();
      else handleNext();
    }
    touchStartX.current = null;
    setIsDragging(false);
  };

  return (
    <div
      className="rolling-dial-container"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Dial Step Prev Button */}
      <button
        className="dial-arrow-btn prev-btn"
        onClick={handlePrev}
        aria-label="Previous tab"
      >
        ‹
      </button>

      {/* 3D Cylindrical Rolling Drum */}
      <div className="dial-viewport">
        <div className="dial-indicator-frame" />
        <div className={`dial-drum ${isDragging ? "dragging" : ""}`}>
          {items.map((item, idx) => {
            const offset = idx - activeIndex;
            // Cylindrical rotation calculation
            const rotationY = offset * 34; // degrees
            const translateZ = Math.cos((rotationY * Math.PI) / 180) * 110;
            const translateX = Math.sin((rotationY * Math.PI) / 180) * 110;
            const opacity = Math.max(0.2, 1 - Math.abs(offset) * 0.4);
            const scale = Math.max(0.75, 1 - Math.abs(offset) * 0.15);
            const isActive = offset === 0;

            return (
              <div
                key={item.id}
                className={`dial-item ${isActive ? "active" : ""}`}
                style={{
                  transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotationY}deg) scale(${scale})`,
                  opacity,
                  zIndex: 20 - Math.abs(offset),
                }}
                onClick={() => onSelect(item.id)}
              >
                <span className="dial-item-icon">{item.icon}</span>
                <span className="dial-item-label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dial Step Next Button */}
      <button
        className="dial-arrow-btn next-btn"
        onClick={handleNext}
        aria-label="Next tab"
      >
        ›
      </button>
    </div>
  );
};
