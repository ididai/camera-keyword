import { useRef, useState } from "react";

export function Tooltip({ text, children }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);

  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 8 });
    setVisible(true);
  };
  const hide = () => setVisible(false);

  return (
    <span ref={ref} style={{ position:"relative", display:"inline-flex", alignItems:"center" }}
      onMouseEnter={show} onMouseLeave={hide} onTouchStart={show} onTouchEnd={hide}>
      {children}
      {visible && (
        <div style={{
          position:"fixed",
          left: pos.x,
          top: pos.y,
          transform:"translate(-50%, -100%)",
          background:"#1a1a2e",
          border:"1px solid #f19eb8",
          borderRadius:7,
          padding:"7px 11px",
          maxWidth:220,
          fontSize: 13,
          color:"#e0ddd4",
          fontFamily:"sans-serif",
          lineHeight:1.5,
          zIndex:9999,
          pointerEvents:"none",
          boxShadow:"0 4px 20px rgba(0,0,0,0.6)",
          whiteSpace:"normal",
          textAlign:"left",
        }}>
          {text}
          <div style={{
            position:"absolute", bottom:-6, left:"50%", transform:"translateX(-50%)",
            width:10, height:6, overflow:"hidden",
          }}>
            <div style={{ width:10, height:10, background:"#f19eb8", transform:"rotate(45deg) translate(-3px,-3px)" }} />
          </div>
        </div>
      )}
    </span>
  );
}

// ── ? 아이콘 버튼 ─────────────────────────────────────────
export function TipIcon({ tip }) {
  if (!tip) return null;
  return (
    <Tooltip text={tip}>
      <span style={{
        display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:13, height:13, borderRadius:"50%",
        border:"1px solid #444", color:"#666",
        fontSize: 10, fontFamily:"sans-serif", fontWeight:900,
        cursor:"help", marginLeft:3, flexShrink:0,
        userSelect:"none",
      }}>?</span>
    </Tooltip>
  );
}
