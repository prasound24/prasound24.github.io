export function openEXR(buffer, width, height, channels) {
  let tHeader = 324 + 18 * channels + 1;
  let tTable = 8 * height;
  let tScanline = 8 + channels * width * 4;
  let tTotal = tHeader + tTable + height * tScanline;
  let size = buffer.byteLength;

  if (size != tTotal)
    throw new Error('Invalid EXR size: ' + size + ' != ' + tTotal);

  let data = new DataView(buffer, size - height * tScanline);
  //let scanlines = new Float32Array(data.buffer);
  let rgba = new Float32Array(height * width * 4);

  for (let y = 0; y < height; y++) {
    for (let ch = 0; ch < channels; ch++) {
      for (let x = 0; x < width; x++) {
        let index = (height - 1 - y) * width + x;
        let offset = y * tScanline / 4 + 2 + (channels - ch - 1) * width;
        rgba[index * 4 + ch] = data.getFloat32((offset + x) * 4, true);
      }
    }
  }

  return { width, height, rgba };
}

export function createEXR(width, height, channels, rgba, pSize = 2) {
  let pType = { 4: 2, 2: 1 }[pSize]; // 2=float32, 1=float16, 0=int32
  if (!pType)
    throw new Error('Invalid pSize value: ' + pSize);
  let tHeader = 324 + 18 * channels + 1;
  let tTable = 8 * height;
  let tScanline = 8 + channels * width * pSize;
  let tTotal = tHeader + tTable + height * tScanline;

  let buffer = new ArrayBuffer(tTotal);
  let stream = new DataStream(buffer);

  // https://openexr.com/en/latest/OpenEXRFileLayout.html#structure
  stream.write([
    { buf: [0x76, 0x2f, 0x31, 0x01] }, // header
    { i32: [2] }, // version

    { str: ['channels', 'chlist'] },
    { i32: [18 * channels + 1] },
  ]);

  // pixel type, Plinear, X sampling, Y sampling
  if (channels >= 4)
    stream.write([{ str: ['A'] }, { i32: [pType, 1, 1, 1] }]);
  if (channels >= 3)
    stream.write([{ str: ['B'] }, { i32: [pType, 1, 1, 1] }]);
  if (channels >= 2)
    stream.write([{ str: ['G'] }, { i32: [pType, 1, 1, 1] }]);
  if (channels >= 1)
    stream.write([{ str: ['R'] }, { i32: [pType, 1, 1, 1] }]);

  stream.write([
    { buf: [0] },

    // https://en.wikipedia.org/wiki/Adobe_RGB_color_space
    { str: ['chromaticities', 'chromaticities'] },
    { i32: [32] }, { f32: [0.64, 0.33, 0.21, 0.71, 0.15, 0.06, 0.3127, 0.329] },

    { str: ['compression', 'compression'] },
    { i32: [1] }, { buf: [0] }, // attr size, attr value

    { str: ['dataWindow', 'box2i'] },
    { i32: [16, 0, 0, width - 1, height - 1] },

    { str: ['displayWindow', 'box2i'] },
    { i32: [16, 0, 0, width - 1, height - 1] },

    { str: ['lineOrder', 'lineOrder'] },
    { i32: [1] }, { buf: [0] },

    { str: ['PixelAspectRatio', 'float'] },
    { i32: [4] }, { f32: [1.0] },

    { str: ['screenWindowCenter', 'v2f'] },
    { i32: [8, 0, 0] },

    { str: ['screenWindowWidth', 'float'] },
    { i32: [4] }, { f32: [1.0] },

    { buf: [0] },
  ]);

  if (stream.offset != tHeader)
    throw new Error('Wrong tHeader size: ' + tHeader + ' != ' + stream.offset);

  let imgOffset = stream.offset + height * 8;
  for (let y = 0; y < height; y++) {
    stream.writeInt(imgOffset + y * tScanline);
    stream.writeInt(0);
  }

  let scanline32 = new Float32Array(width);
  let scanline16 = new Int16Array(width);
  let scanline = new Uint8Array(pSize == 2 ? scanline16.buffer : scanline32.buffer);

  for (let y = 0; y < height; y++) {
    stream.writeInt(y);
    stream.writeInt(width * channels * pSize);

    for (let ch = channels - 1; ch >= 0; ch--) {
      for (let x = 0; x < width; x++) {
        let index = (height - 1 - y) * width + x;
        scanline32[x] = rgba[index * 4 + ch];
      }

      if (pSize == 2)
        float2half(scanline16, scanline32);

      stream.writeBuf(scanline);
    }
  }

  if (stream.offset != tTotal)
    throw new Error('Wrong tTotal size: ' + tTotal + ' != ' + stream.offset);

  return new Blob([buffer], { type: 'image/x-exr' });
}

function float2half(f16, f32) {
  let i32 = new Int32Array(f32.buffer);
  let i16 = new Int16Array(f16.buffer);

  for (let i = 0; i < f32.length; i++) {
    let b = i32[i] + 0x00001000;
    let e = (b & 0x7F800000) >> 23;
    let m = b & 0x007FFFFF;
    let y = (b & 0x80000000) >> 16 | (e > 112) * ((((e - 112) << 10) & 0x7C00) | m >> 13) | ((e < 113) & (e > 101)) * ((((0x007FF000 + m) >> (125 - e)) + 1) >> 1) | (e > 143) * 0x7FFF;
    i16[i] = y;
  }
}

class DataStream {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.data = new DataView(buffer);
    this.offset = 0;
  }

  write(items) {
    for (let i of items) {
      for (let s of i.str || [])
        this.writeStr(s);
      for (let x of i.i32 || [])
        this.writeInt(x);
      for (let x of i.f32 || [])
        this.writeFloat(x);
      if (i.buf)
        this.writeBuf(i.buf);
    }
  }

  writeFloat(v) {
    this.data.setFloat32(this.offset, v, true);
    this.offset += 4;
  }

  writeInt(i) {
    this.data.setUint32(this.offset, i, true);
    this.offset += 4;
  }

  writeBuf(bytes) {
    this.bytes.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  writeStr(s) {
    for (let i = 0; i < s.length; i++)
      this.data.setUint8(this.offset++, s.charCodeAt(i));
    this.data.setUint8(this.offset++, 0);
  }
}
