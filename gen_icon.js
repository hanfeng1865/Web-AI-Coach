/**
 * 生成一个纯 Node.js (无依赖) 的 128x128 PNG 图标
 * 前景色: #f8f6f1（米白）  背景色: #004d40（深绿）
 * 用 zlib deflate 压缩像素数据, 输出合规 PNG 文件
 */
const fs = require("fs");
const zlib = require("zlib");

const SIZE = 128;
const RADIUS = 22; // 圆角像素
const BG = [0x00, 0x4d, 0x40, 0xff]; // #004d40
const FG = [0xf8, 0xf6, 0xf1, 0xff]; // #f8f6f1

// --- 生成像素 RGBA 数组 ---
const pixels = new Uint8Array(SIZE * SIZE * 4);

function inRoundRect(x, y, margin, r) {
  const x1 = margin + r, x2 = SIZE - margin - r;
  const y1 = margin + r, y2 = SIZE - margin - r;
  if (x >= margin + r && x <= SIZE - margin - r) return y >= margin && y <= SIZE - margin;
  if (y >= margin + r && y <= SIZE - margin - r) return x >= margin && x <= SIZE - margin;
  const cx = x < x1 ? x1 : x > x2 ? x2 : x;
  const cy = y < y1 ? y1 : y > y2 ? y2 : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

// 简单像素字体 — "AI" 用 5x7 点阵绘制，居中放大 2.5×
const A_BITMAP = [
  [0,1,1,1,0],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,1,1,1,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
  [1,0,0,0,1],
];
const I_BITMAP = [
  [1,1,1],
  [0,1,0],
  [0,1,0],
  [0,1,0],
  [0,1,0],
  [0,1,0],
  [1,1,1],
];

const SCALE = 9;
const GAP = 4;
const A_W = 5 * SCALE, I_W = 3 * SCALE, H = 7 * SCALE;
const totalW = A_W + GAP + I_W;
const startX = Math.round((SIZE - totalW) / 2);
const startY = Math.round((SIZE - H) / 2);

for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const i = (py * SIZE + px) * 4;
    const inside = inRoundRect(px, py, 12, RADIUS);
    let color = [0xff, 0xff, 0xff, 0x00]; // transparent outside

    if (inside) {
      color = BG;
      // Draw A
      const ax = px - startX, ay = py - startY;
      const ac = Math.floor(ax / SCALE), ar = Math.floor(ay / SCALE);
      if (ac >= 0 && ac < 5 && ar >= 0 && ar < 7 && A_BITMAP[ar][ac]) color = FG;
      // Draw I
      const ix = px - (startX + A_W + GAP), iy = py - startY;
      const ic = Math.floor(ix / SCALE), ir = Math.floor(iy / SCALE);
      if (ic >= 0 && ic < 3 && ir >= 0 && ir < 7 && I_BITMAP[ir][ic]) color = FG;
    }
    pixels[i] = color[0];
    pixels[i+1] = color[1];
    pixels[i+2] = color[2];
    pixels[i+3] = color[3];
  }
}

// --- 拼装 PNG 文件 ---
function crc32(buf) {
  let c = 0xffffffff;
  const table = new Uint32Array(256).map((_, i) => {
    let n = i;
    for (let k = 0; k < 8; k++) n = (n & 1) ? (0xedb88320 ^ (n >>> 1)) : (n >>> 1);
    return n;
  });
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// IHDR
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, RGBA

// Raw pixel data: each row prefixed with filter byte 0x00
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0; // filter none
  Buffer.from(pixels.buffer, y * SIZE * 4, SIZE * 4).copy(raw, y * (1 + SIZE * 4) + 1);
}

const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0))
]);

const out = "assets/icon.png";
fs.writeFileSync(out, png);
console.log("OK:", out, png.length, "bytes");
