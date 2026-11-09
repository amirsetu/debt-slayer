"""App icons: Penny the coin on violet, drawn with 2x2 supersampling. No dependencies.

    python3 tools/make_icons.py icons
"""
import sys, zlib, struct, pathlib, math

BG, INK, GOLD, RING, CHEEK = (0x6D, 0x3A, 0xED), (0x1C, 0x12, 0x38), (0xFF, 0xC5, 0x31), (0xE0, 0xA4, 0x00), (0xFF, 0x9C, 0x86)

def color_at(x, y, k):
    # x, y in 0..100 icon units; k scales Penny around the centre (1 = full, 0.8 = maskable safe zone)
    u, v = 50 + (x - 50) / k, 50 + (y - 50) / k
    d = math.hypot(u - 50, v - 50)
    if d > 38: return BG
    if d > 34.5: return INK
    if 25 < d < 28.5: return RING
    for ex in (40, 60):
        if ((u - ex) / 4.2) ** 2 + ((v - 45) / 5.6) ** 2 <= 1: return INK
    for cx in (31, 69):
        if math.hypot(u - cx, v - 55) <= 4: return CHEEK
    if abs(math.hypot(u - 50, v - 49) - 12) < 1.9 and v > 55 and abs(u - 50) < 9.5: return INK
    return GOLD

def png(path, size, k):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px_ in range(size):
            acc = [0, 0, 0]
            for sy in (0.25, 0.75):
                for sx in (0.25, 0.75):
                    c = color_at((px_ + sx) / size * 100, (py + sy) / size * 100, k)
                    acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
            row += bytes(a // 4 for a in acc)
        rows.append(bytes(row))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)

d = pathlib.Path(sys.argv[1]); d.mkdir(parents=True, exist_ok=True)
png(d / 'apple-touch-icon.png', 180, 1)
png(d / 'icon-192.png', 192, 1)
png(d / 'icon-512.png', 512, 1)
png(d / 'icon-maskable-512.png', 512, 0.78)
png(d / 'favicon-32.png', 32, 1.12)
print('icons in', d)
