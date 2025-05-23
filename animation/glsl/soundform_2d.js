import { openEXR } from "../../lib/exr.js";

const QTN = 12;

export async function initChannels(iChannels, ctx) {
  iChannels[4] = ctx.createFrameBuffer(64, 1, 4);
  let ch = iChannels[0];
  let res = await fetch('glsl/soundform3.exr');
  let blob = await res.blob();
  let data = await blob.arrayBuffer();
  let exr = openEXR(data, ch.width, ch.height, 4);
  ch.upload(exr.rgba);
}

export function drawFrame(ctx, args) {
  ctx.runShader({ ...args, iChannelId: 4 }, 4); // config: zoom, etc.
  ctx.runShader({ ...args, iChannelId: 1 }, 1);
  
  for (let i = 0; i < QTN; i++)
    ctx.runShader({ ...args, iPass: i, iChannelId: 2 }, 2);
  
  ctx.runShader({ ...args, iChannelId: 3 }, 3);
  ctx.runShader({ ...args, iChannelId: -1 });
}
