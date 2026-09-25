const ZANIL_IMAGE_URL = "./assets/zanil_theran.png";

function placeholderSVG() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 96 112");
  svg.setAttribute("width", "72");
  svg.setAttribute("height", "84");
  svg.setAttribute("class", "zanil-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Zanil Theran - Luxury Furnisher");
  svg.innerHTML = `
    <title>Zanil Theran - Luxury Furnisher</title>
    <rect x="2" y="2" width="92" height="108" rx="6"
          fill="#1f2937" stroke="#b8860b" stroke-width="3"/>
    <rect x="8" y="8" width="80" height="96" rx="3"
          fill="#2d3a4e" stroke="#caa14a" stroke-width="1"/>
    <!-- hood / shoulders -->
    <path d="M20 104 Q20 70 48 64 Q76 70 76 104 Z" fill="#3b2f6b"/>
    <path d="M28 70 Q48 52 68 70 L64 80 Q48 66 32 80 Z" fill="#4c3f87"/>
    <!-- head -->
    <circle cx="48" cy="48" r="18" fill="#6b8f3e"/>
    <!-- simple face marks -->
    <ellipse cx="41" cy="46" rx="2.4" ry="3" fill="#1f2937"/>
    <ellipse cx="55" cy="46" rx="2.4" ry="3" fill="#1f2937"/>
    <path d="M42 56 Q48 60 54 56" stroke="#1f2937" stroke-width="2"
          fill="none" stroke-linecap="round"/>
    <!-- a coin, to read as "merchant" -->
    <circle cx="48" cy="88" r="7" fill="#caa14a" stroke="#8a6d2b" stroke-width="1.5"/>
    <text x="48" y="91.5" font-size="8" text-anchor="middle"
          fill="#5a4416" font-family="serif">$</text>`;
  return svg;
}

export function zanilPortrait() {
  const frame = document.createElement("div");
  frame.className = "zanil-portrait";

  if (ZANIL_IMAGE_URL) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    // Fixed dimensions at the art's own aspect, so the layout never reflows whichever one renders.
    img.width = 287;
    img.height = 640;
    img.src = ZANIL_IMAGE_URL;
    img.alt = "Zanil Theran, the in-game Luxury Furnisher NPC";
    img.className = "zanil-img";
    // Same file, so a dead URL takes both down: the left drops back to the SVG, the mirror goes.
    const mirror = img.cloneNode();
    mirror.alt = "";
    mirror.classList.add("zanil-mirror");
    img.onerror = () => {
      img.replaceWith(placeholderSVG());
    };
    mirror.onerror = () => mirror.remove();
    frame.append(img, mirror);
  } else {
    frame.append(placeholderSVG());
  }

  // No caption: a label under it makes it read as a framed thumbnail.
  return frame;
}
