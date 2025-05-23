// Standalone WebGL2 wrapper.

const dcheck = (x) => { if (x) return; debugger; throw new Error('webgl2 dcheck'); };

const DEBUG = false;
const FBO_MAX_SIZE = 2 ** 28;

const SHADER_PREFACE = `
  #version 300 es
  precision highp float;
  precision highp int;
  precision highp sampler2D;
`;

const VSHADER_PREFACE = `
  // TODO
`;

const FSHADER_PREFACE = `
  out vec4 v_FragColor;
`;

const VSHADER_DEFAULT = `
  in vec2 aPosition;

  out vec2 vTex; // 0..1 x 0..1
  out vec2 vPos; // -1..1 x -1..1
  out vec2 v;

  void main () {
    v = aPosition;
    vPos = aPosition;
    vTex = vPos * 0.5 + 0.5;
    gl_Position = vec4(vPos, 0.0, 1.0);
  }
`;

const FSHADER_DEFAULT = `
  in vec2 vTex;
  uniform sampler2D uInput;

  void main () {
    v_FragColor = texture(uInput, vTex);
  }
`;

export class GpuContext {
  constructor(canvas, { log = true } = {}) {
    if (log === true)
      log = { i: console.log, d: console.debug, w: console.warn, e: console.error };

    this.canvas = canvas;
    this.ext = null;
    this.gl = null;
    this.log = log;

    this.framebuffers = [];
    this.programs = [];
    this.num_points = 0;
  }

  destroy() {
    if (!this.gl) return;
    for (let fb of this.framebuffers)
      fb.destroy();
    for (let p of this.programs)
      p.destroy();
    this.gl = null;
  }

  createFrameBuffer(w, h, ch = 1, data = null) {
    let args = w > 0 ? { width: w, height: h, channels: ch } : w;
    let fb = new GpuFrameBuffer(this, { log: this.log, ...args });
    if (data) {
      dcheck(data.length == w * h * ch);
      fb.upload(data);
    }
    return fb;
  }

  createFrameBufferFromRGBA(img, scale = 1 / 255) {
    let rgba = new Float32Array(img.data);
    for (let i = 0; i < rgba.length; i++)
      rgba[i] *= scale;

    let fbuffer = this.createFrameBuffer({
      width: img.width,
      height: img.height,
      channels: 4,
    });

    fbuffer.upload(rgba);
    return fbuffer;
  }

  createTransformProgram(args) {
    return new GpuTransformProgram(this, { log: this.log, ...args });
  }

  checkError() {
    if (!DEBUG) return;
    let err = this.gl.getError();
    if (err) throw new Error('WebGL error code ' + err);
  }

  getTextureFormat(components) {
    return components == 1 ? this.ext.formatR :
      components == 2 ? this.ext.formatRG :
        this.ext.formatRGBA;
  }

  init(config = {}) {
    let canvas = this.canvas;

    let params = {
      alpha: config.alpha || false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: true, // enables 'Save Image As'
    };

    for (let s in config)
      params[s] = config[s];

    //this.log?.i('Initializing WebGL:', ...JSON.stringify(params).slice(1, -1).split(','));

    let gl = canvas.getContext('webgl2', params);
    if (!gl) throw new Error('WebGL 2.0 not available');

    let props = [
      'VERSION',
      'MAX_TEXTURE_SIZE',
      'MAX_3D_TEXTURE_SIZE',
      'MAX_ARRAY_TEXTURE_LAYERS',
    ];

    let sprop = props.map(
      prop => prop + ' ' + gl.getParameter(gl[prop]));

    for (let sp of ['HIGH_FLOAT', 'MEDIUM_FLOAT', 'LOW_FLOAT']) {
      let f = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl[sp]);
      sprop.push(sp + ' ' + f.precision);
    }

    this.log?.i('WebGL', sprop.join(' / '));

    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.clearColor(0, 0, 0, 0);

    let floatTexType = gl.FLOAT;
    let formatRGBA = this.getSupportedFormat(gl, gl.RGBA32F, gl.RGBA, floatTexType);
    let formatRG = this.getSupportedFormat(gl, gl.RG32F, gl.RG, floatTexType);
    let formatR = this.getSupportedFormat(gl, gl.R32F, gl.RED, floatTexType);

    this.gl = gl;

    this.ext = {
      formatRGBA,
      formatRG,
      formatR,
      floatTexType,
    };

    this.initVertexBufferSquare();
  }

  clear(r = 0, g = 0, b = 0, a = 0) {
    let gl = this.gl;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  initVertexBufferSquare(num = 1) {
    // The [-1, 1] x [-1, 1] area is split into NxN squares,
    // each square made of 2 triangles.
    let vertices = [];
    let elements = [];

    for (let i = 0; i <= num; i++)
      for (let j = 0; j <= num; j++)
        vertices.push(i / num * 2 - 1, j / num * 2 - 1);

    for (let i = 0; i < num; i++) {
      for (let j = 0; j < num; j++) {
        // a c
        // b d
        let a = i * (num + 1) + j, b = a + 1, c = a + num + 1, d = c + 1;
        elements.push(b, a, c, b, c, d);
      }
    }

    this.num_points = elements.length;

    let gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(elements), gl.STATIC_DRAW);

    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
  }

  getSupportedFormat(gl, internalFormat, format, type) {
    if (!this.supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R32F:
          return this.getSupportedFormat(gl, gl.RG32F, gl.RG, type);
        case gl.RG32F:
          return this.getSupportedFormat(gl, gl.RGBA32F, gl.RGBA, type);
        default:
          return null;
      }
    }

    return {
      internalFormat,
      format
    }
  }

  supportRenderTextureFormat(gl, internalFormat, format, type) {
    let texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.deleteTexture(texture);
    gl.deleteFramebuffer(fbo);
    return status == gl.FRAMEBUFFER_COMPLETE;
  }
}

export class GpuFrameBuffer {
  static max_id = 0;

  get capacity() {
    return this.width * this.height * this.channels;
  }

  get name() {
    return 'fb' + this.id + ':' + this.width + 'x' + this.height + 'x' + this.channels;
  }

  constructor(webgl, {
    log,
    size,
    width,
    height,
    channels = 1,
    // This GPU framebuffer can be bound to a JS Float32Array,
    // so every time this framebuffer is bound to a fragment
    // shader, the CPU data would be copied to GPU. Typical
    // size of the Float32Array: height x width x channels,
    // with RGBA values in the 0..1 range.
    source = null,
  }) {
    if (source && !(source instanceof Float32Array))
      throw new Error(`Texture can be bound only to a Float32Array`);

    if (size && (width || height))
      throw new Error(`Can't set size and width x height at the same time`);

    if (size) {
      width = size;
      height = size;
    }

    this.id = ++GpuFrameBuffer.max_id;
    this.log = log;
    this.width = width;
    this.height = height;
    this.channels = channels;
    this.shape = [width, height, channels];
    this.source = source;
    this.webgl = webgl;
    this.fmt = null;
    this.type = null;
    this.texture = null;
    this.fbo = null;

    this.checkBufferSize();
    this.prepareFBO();
    this.clear();
    this.webgl.framebuffers.push(this);
  }

  draw(x = 0, y = 0, w = 0, h = 0) {
    let gl = this.webgl.gl;
    w = w || gl.drawingBufferWidth;
    h = h || gl.drawingBufferHeight;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    gl.blitFramebuffer(
      0, 0, this.width, this.height,
      x, y, x + w, y + h,
      gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }

  destroy() {
    if (!this.webgl) return;
    this.log?.d('Deleting texture', this.name);
    let gl = this.webgl.gl;
    gl.deleteTexture(this.texture);
    gl.deleteFramebuffer(this.fbo);
    this.webgl = null;
  }

  // Moves data from GPU to CPU. Beware that doing this at 60 fps,
  // even if the texture is 1x1, kills the performance entirely.
  download(output = new Float32Array(this.width * this.height * this.channels),
    x = 0, y = 0, width = this.width, height = this.height) {

    if (output.length != width * height * this.channels)
      throw new Error('Invalid CPU buffer length: ' + output.length);

    let gl = this.webgl.gl;

    // gl.finish(); // TODO: flush pending GPU ops

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.texture, 0);

    this.tempbuf = this.tempbuf ||
      new Float32Array(this.width * this.height * 4);

    gl.readPixels(x, y, width, height,
      gl.RGBA /* this.fmt.format */, this.type, this.tempbuf);

    // This is ugly. readPixels() should really work with gl.RG.
    for (let i = 0; i < width * height; i++)
      for (let j = 0; j < this.channels; j++)
        output[i * this.channels + j] = this.tempbuf[i * 4 + j];

    return output;
  }

  clear(r = 0, g = 0, b = 0, a = 0) {
    let gl = this.webgl.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.webgl.checkError();
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D, this.texture, 0);
    this.webgl.checkError();
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  attach(id) {
    let gl = this.webgl.gl;
    gl.activeTexture(gl.TEXTURE0 + id);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    this.webgl.checkError();
    if (this.source)
      this.upload(this.source);
    return id;
  }

  setPixel(rgba, x, y) {
    this.upload(rgba, x, y, 1, 1);
  }

  upload(pixels, x = 0, y = 0, w = this.width, h = this.height) {
    let size = w * h * this.channels;

    if (pixels.length > size) {
      pixels = pixels.subarray(0, size);
    }

    if (pixels.length < size) {
      let temp = new Float32Array(size);
      temp.set(pixels);
      pixels = temp;
    }

    if (!(pixels instanceof Float32Array))
      pixels = new Float32Array(pixels);

    let gl = this.webgl.gl;
    // gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, x, y, w, h,
      this.fmt.format, this.type, pixels, 0);
    this.webgl.checkError();
  }

  checkBufferSize() {
    let gl = this.webgl.gl;

    let { width, height, channels } = this;

    let count = width * height * channels;
    let spec = `${width}x${height}x${channels}`;
    let note = `${spec} = ${count >> 20}M x float`;
    let tmax = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    this.log?.d('Creating texture', this.name);

    if (count > FBO_MAX_SIZE || Math.max(width, height) > tmax)
      throw new Error(`Texture too large: ${note}`);
  }

  prepareFBO() {
    let { webgl, width, height, channels } = this;
    let gl = webgl.gl;
    let fmt = webgl.getTextureFormat(channels);

    gl.activeTexture(gl.TEXTURE0);

    this.fmt = fmt;
    this.type = webgl.ext.floatTexType;
    this.texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, width, height, 0, fmt.format, this.type, null);
    this.webgl.checkError();

    this.fbo = gl.createFramebuffer();
  }
}

GpuFrameBuffer.DUMMY = 'dummy';

export class GpuProgram {
  constructor(webgl, vertexShader, fragmentShader) {
    this.gl = webgl.gl;
    this.webgl = webgl;
    this.uniforms = {};
    this.vertexShader = vertexShader;
    this.fragmentShader = fragmentShader;
    this.program = GpuProgram.createProgram(this.gl, vertexShader, fragmentShader);
    // uniforms[0] = {type:5,size:2,name:"uInput"}
    // uniforms["uInput"] = 32
    this.uniforms = this.getUniforms();
  }

  destroy() {
    let gl = this.gl;
    if (!gl) return;
    gl.deleteProgram(this.program);
    gl.deleteShader(this.vertexShader);
    gl.deleteShader(this.fragmentShader);
    this.gl = null;
  }

  bind() {
    this.gl.useProgram(this.program);
  }

  getUniforms() {
    let gl = this.gl;
    let program = this.program;
    let uniforms = [];
    let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      let uniform = gl.getActiveUniform(program, i);
      // "uniform float x[3]" appears as {name:"x[0]", size:3}
      let name = /^\w+/.exec(uniform.name)[0];
      let uid = gl.getUniformLocation(program, name);
      uniforms[name] = uid;
      uniforms[i] = uniform;
    }
    return uniforms;
  }

  blit(output = null, draw_points = false) {
    let gl = this.gl;
    let w = output && output.width || gl.drawingBufferWidth;
    let h = output && output.height || gl.drawingBufferHeight;
    let vp = output && output.viewport || { x: 0, y: 0, w, h };
    let type = draw_points ? gl.POINTS : gl.TRIANGLES;
    gl.viewport(vp.x, vp.y, vp.w, vp.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output && output.fbo || null);
    gl.drawElements(type, this.webgl.num_points, gl.UNSIGNED_INT, 0);
  }

  static createProgram(gl, vertexShader, fragmentShader) {
    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw gl.getProgramInfoLog(program);

    return program;
  }

  static prepareShader(gl, source, type) {
    return [
      SHADER_PREFACE,
      type == gl.VERTEX_SHADER ?
        VSHADER_PREFACE :
        FSHADER_PREFACE,
      source,
    ].join('\n').trim();
  }

  static createShader(gl, type, source) {
    const source2 = GpuProgram.prepareShader(gl, source, type);
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source2);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      GpuProgram.reportError(gl, shader, source2);

    return shader;
  }

  static reportError(gl, shader, source) {
    let info = gl.getShaderInfoLog(shader) || '';
    let [, col, row] = /^ERROR: (\d+):(\d+):/.exec(info) || [];
    let message = info.split('\n')[0];

    if (row) {
      let lines = source.split(/\n/g);
      let line = lines[+row - 1];
      message += ' in "' + line.trim() + '"';
    }

    console.groupCollapsed('Failed shader:');
    console.debug(source);
    console.groupEnd();

    console.error(message);
    throw new Error(message);
  }
}

// This is a "GPU transformer node" that takes a few inputs
// and runs the fragment shader to produce one output buffer.
// In the final node that writes the RGBA output to canvas
// there is no output buffer.
export class GpuTransformProgram {
  constructor(glctx, {
    vshader,
    fshader,
    draw_points = false,
  } = {}) {
    this.glctx = glctx;
    this.draw_points = draw_points;
    this.init({ vshader, fshader });
    this.glctx.programs.push(this);
  }

  destroy() {
    if (!this.glctx) return;
    this.program?.destroy();
    this.glctx = null;
  }

  init({ vshader, fshader }) {
    let gl = this.glctx.gl;

    let gl_vshader = GpuProgram.createShader(
      gl, gl.VERTEX_SHADER, vshader || VSHADER_DEFAULT);

    let gl_fshader = GpuProgram.createShader(
      gl, gl.FRAGMENT_SHADER, fshader || FSHADER_DEFAULT);

    this.program = new GpuProgram(this.glctx, gl_vshader, gl_fshader);
  }

  draw(args = {}, output = null) {
    if (output == GpuFrameBuffer.DUMMY)
      return;
    let gp = this.program;
    gp.bind();
    this.bindArgs(args);
    gp.blit(output, this.draw_points);
    this.glctx.checkError();
  }

  bindArgs(args) {
    let gl = this.glctx.gl;
    let gp = this.program;
    let nSamplers = 0;

    for (let u of gp.uniforms) {
      // u.name = 'iSigFreqs[0]'
      let name = u.name.endsWith('[0]') ?
        u.name.slice(0, -3) : u.name;
      let arg = args[name];
      let uptr = gp.uniforms[name];

      if (arg === undefined)
        throw new Error('Missing uniform arg: ' + u.name);

      dcheck(u.size == 1 || u.size == arg.length);

      switch (u.type) {
        case gl.SAMPLER_2D:
          if (!arg) throw new Error('Missing sampler2D: ' + u.name);
          gl.uniform1i(uptr, arg.attach(nSamplers++));
          break;
        case gl.BOOL:
        case gl.INT:
          if (u.size == 1)
            gl.uniform1i(uptr, arg);
          else
            gl.uniform1iv(uptr, arg);
          break;
        case gl.UNSIGNED_INT:
          if (u.size == 1)
            gl.uniform1ui(uptr, arg);
          else
            gl.uniform1uiv(uptr, arg);
          break;
        case gl.FLOAT:
          if (u.size == 1)
            gl.uniform1f(uptr, arg);
          else
            gl.uniform1fv(uptr, arg);
          break;
        case gl.FLOAT_VEC2:
          dcheck(u.size == 1);
          gl.uniform2f(uptr, ...arg);
          break;
        case gl.FLOAT_VEC3:
          dcheck(u.size == 1);
          gl.uniform3f(uptr, ...arg);
          break;
        case gl.FLOAT_VEC4:
          dcheck(u.size == 1);
          gl.uniform4f(uptr, ...arg);
          break;
        default:
          throw new Error(`Unknown uniform type ${u.type} for ${u.name}`);
      }

      this.glctx.checkError();
    }
  }
}
