import { openEXR } from "../../lib/exr.js";

const QTN = 12;

export async function initChannels(iChannels, ctx) {
  // config: zoom, etc.
  iChannels[4] = ctx.createFrameBuffer(64, 1, 4);
  
  // exr data, 3d mesh, bvh tree
  for (let i of [0, 1, 2]) {
    iChannels[i].destroy();
    iChannels[i] = ctx.createFrameBuffer(1280, 720, 4);
  }
  
  let res = await fetch('glsl/soundform3.exr');
  let blob = await res.blob();
  let data = await blob.arrayBuffer();
  let exr = openEXR(data, 1280, 720, 4);
  iChannels[0].upload(exr.rgba);
}

export function drawFrame(ctx, args) {
  ctx.runShader({ ...args, iChannelId: 4 }); // config: zoom, etc.
  ctx.runShader({ ...args, iChannelId: 1 });

  for (let i = 0; i < QTN; i++)
    ctx.runShader({ ...args, iPass: i, iChannelId: 2 });

  ctx.runShader({ ...args, iChannelId: 3 });
  ctx.runShader({ ...args, iChannelId: -1 });
}
