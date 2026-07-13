import React, { useEffect, useRef, useState } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState({ x, y });
  const [menuStack, setMenuStack] = useState([items]);

  const currentItems = menuStack[menuStack.length - 1];

  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let clampedX = x;
      let clampedY = y;

      // Adjust X position if menu overflows right edge
      if (x + menuRect.width > viewportWidth) {
        clampedX = viewportWidth - menuRect.width - 8;
      }
      // Adjust Y position if menu overflows bottom edge
      if (y + menuRect.height > viewportHeight) {
        clampedY = viewportHeight - menuRect.height - 8;
      }

      // Ensure position is not negative
      clampedX = Math.max(8, clampedX);
      clampedY = Math.max(8, clampedY);

      setCoords({ x: clampedX, y: clampedY });
    }
  }, [x, y, menuStack.length]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: `${coords.x}px`,
        top: `${coords.y}px`,
      }}
      className="z-[999] min-w-[200px] bg-zinc-950/90 backdrop-blur-md border border-zinc-800/80 rounded-xl shadow-[0_4px_25px_rgba(0,0,0,0.6),0_0_15px_rgba(99,102,241,0.15)] p-1.5 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5 select-none"
    >
      {menuStack.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuStack(prev => prev.slice(0, -1));
          }}
          className="w-full text-left px-3 py-1.5 text-[9px] uppercase font-bold tracking-wider text-zinc-500 hover:text-zinc-300 font-mono rounded flex items-center gap-1 cursor-pointer border-b border-zinc-900 pb-1.5 mb-1"
        >
          <span>← Back</span>
        </button>
      )}

      {currentItems.map((item, idx) => {
        if (item.type === 'separator') {
          return <div key={idx} className="h-[1px] bg-zinc-900 my-1 mx-1" />;
        }

        const Icon = item.icon;
        const hasSubmenu = !!item.submenu;

        return (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (item.disabled) return;

              if (hasSubmenu) {
                setMenuStack(prev => [...prev, item.submenu]);
              } else {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`w-full text-left px-3 py-2 text-xs font-mono rounded-lg flex items-center justify-between gap-2.5 transition-all cursor-pointer ${
              item.disabled
                ? 'opacity-40 cursor-not-allowed text-zinc-500'
                : 'text-zinc-350 hover:bg-indigo-500/10 hover:text-white hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${item.iconColor || 'text-zinc-500'}`} />}
              <span className="truncate">{item.label}</span>
            </div>
            {hasSubmenu && (
              <span className="text-[10px] text-zinc-500 font-sans ml-auto shrink-0 font-bold">›</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
