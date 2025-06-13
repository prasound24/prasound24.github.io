// https://en.wikipedia.org/wiki/PLY_(file_format)
// https://deepwiki.com/mkkellogg/GaussianSplats3D/3.2-ply-loading

export function exportPLY(w, h, xyzw, rgba) {
  if (xyzw.length < w * h * 4)
    throw new Error('Invalid size of xyzw');
  if (rgba.length < w * h * 4)
    throw new Error('Invalid size of rgba');

  let tHeader = 370;
  let buffer = new ArrayBuffer(tHeader + w * h * 4 * 14);
  let stream = new DataStream(buffer);

  stream.write([
    {
      str: [
        'ply',
        'format binary_little_endian 1.0',
        'element vertex ' + w * h,
        'property float x',
        'property float y',
        'property float z',
        'property float scale_0',
        'property float scale_1',
        'property float scale_2',
        'property float rot_0',
        'property float rot_1',
        'property float rot_2',
        'property float rot_3',
        'property float f_dc_0',
        'property float f_dc_1',
        'property float f_dc_2',
        'property float opacity',
        'end_header'
      ]
    }
  ]);

  if (stream.offset > tHeader)
    throw new Error('Incorrect ply header size: ' + tHeader + ' < ' + stream.offset);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let i = y * w + x;

      stream.writeFloat(xyzw[i * 4 + 0]); // X
      stream.writeFloat(xyzw[i * 4 + 1]); // Y
      stream.writeFloat(xyzw[i * 4 + 2]); // Z

      let scale = Math.log(xyzw[i * 4 + 3]);
      stream.writeFloat(scale);
      stream.writeFloat(scale);
      stream.writeFloat(scale);

      // quaternion rotation
      stream.writeFloat(0);
      stream.writeFloat(0);
      stream.writeFloat(0);
      stream.writeFloat(0);

      // x -> 255*(0.5 + x*c0)
      const c0 = 0.28209479177387814;
      stream.writeFloat((rgba[i * 4 + 0] - 0.5) / c0); // R
      stream.writeFloat((rgba[i * 4 + 1] - 0.5) / c0); // G
      stream.writeFloat((rgba[i * 4 + 2] - 0.5) / c0); // B

      // opacity: x -> 255/(1 + e^-x)
      let opacity = rgba[i * 4 + 3];
      opacity = Math.max(0.001, Math.min(0.999, opacity));
      stream.writeFloat(-Math.log(1 / opacity - 1));
    }
  }

  buffer = buffer.slice(0, stream.offset);
  return new Blob([buffer], { type: 'text/ply' });
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
    this.data.setUint8(this.offset++, 0x0A);
  }
}
