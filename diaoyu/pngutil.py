"""PNG and Android screencap decoding. Stdlib only."""

from __future__ import annotations

import struct
import zlib


class Frame:
    def __init__(self, width: int, height: int, rgb: bytes | bytearray):
        if len(rgb) != width * height * 3:
            raise ValueError("rgb size does not match width*height*3")
        self.width = width
        self.height = height
        self.rgb = rgb if isinstance(rgb, bytearray) else bytearray(rgb)

    def get(self, x: int, y: int) -> tuple[int, int, int]:
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return (0, 0, 0)
        o = (y * self.width + x) * 3
        buf = self.rgb
        return buf[o], buf[o + 1], buf[o + 2]

    def set(self, x: int, y: int, color: tuple[int, int, int]) -> None:
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return
        o = (y * self.width + x) * 3
        self.rgb[o] = color[0]
        self.rgb[o + 1] = color[1]
        self.rgb[o + 2] = color[2]


def solid(width: int, height: int, color: tuple[int, int, int]) -> Frame:
    pixel = bytes(color)
    return Frame(width, height, pixel * (width * height))


def fill_rect(frame: Frame, x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            frame.set(xx, yy, color)


def decode_png(data: bytes) -> Frame:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a png")
    offset = 8
    idat = bytearray()
    width = height = color_type = None
    while offset + 8 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        kind = data[offset + 4 : offset + 8]
        chunk = data[offset + 8 : offset + 8 + length]
        if kind == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, inter = struct.unpack(
                ">IIBBBBB", chunk
            )
            if bit_depth != 8 or inter != 0 or color_type not in (2, 6):
                raise ValueError("only 8-bit RGB or RGBA pngs are supported")
            if comp != 0 or filt != 0:
                raise ValueError("unsupported png compression")
        elif kind == b"IDAT":
            idat.extend(chunk)
        elif kind == b"IEND":
            break
        offset += 12 + length
    if width is None or height is None or color_type is None:
        raise ValueError("png missing header")
    raw = zlib.decompress(bytes(idat))
    channels = 3 if color_type == 2 else 4
    stride = width * channels
    rgb = bytearray(width * height * 3)
    index = 0
    previous = bytearray(stride)
    out = 0
    for _y in range(height):
        filter_type = raw[index]
        index += 1
        row = bytearray(raw[index : index + stride])
        index += stride
        if filter_type == 1:
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                row[x] = (row[x] + left) & 255
        elif filter_type == 2:
            for x in range(stride):
                row[x] = (row[x] + previous[x]) & 255
        elif filter_type == 3:
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                row[x] = (row[x] + ((left + previous[x]) // 2)) & 255
        elif filter_type == 4:
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                up = previous[x]
                ul = previous[x - channels] if x >= channels else 0
                estimate = left + up - ul
                pa, pb, pc = abs(estimate - left), abs(estimate - up), abs(estimate - ul)
                predictor = left if pa <= pb and pa <= pc else up if pb <= pc else ul
                row[x] = (row[x] + predictor) & 255
        elif filter_type != 0:
            raise ValueError(f"bad png filter {filter_type}")
        previous = row
        if channels == 3:
            rgb[out : out + stride] = row
            out += stride
        else:
            for x in range(width):
                src = x * 4
                rgb[out] = row[src]
                rgb[out + 1] = row[src + 1]
                rgb[out + 2] = row[src + 2]
                out += 3
    return Frame(width, height, rgb)


def parse_raw_screencap(data: bytes) -> Frame:
    """Android `adb exec-out screencap` raw header: width, height, format, then RGBA."""
    if len(data) < 12:
        raise ValueError("screencap too short")
    width, height, fmt = struct.unpack_from("<III", data, 0)
    pixels = data[12:]
    if width <= 0 or height <= 0 or width > 8000 or height > 8000:
        raise ValueError("bad screencap size")
    needed = width * height * 4
    if len(pixels) < needed:
        raise ValueError("screencap pixels truncated")
    rgb = bytearray(width * height * 3)
    # format 1 is RGBA_8888. Other little-endian 32-bit layouts we still read as RGBA.
    _ = fmt
    for i in range(width * height):
        src = i * 4
        dst = i * 3
        rgb[dst] = pixels[src]
        rgb[dst + 1] = pixels[src + 1]
        rgb[dst + 2] = pixels[src + 2]
    return Frame(width, height, rgb)
