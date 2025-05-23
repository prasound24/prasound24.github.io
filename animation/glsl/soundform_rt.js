import { openEXR } from "../../lib/exr.js";

const QTN = 16;

export async function initChannels(iChannels) {
  let ch1 = iChannels[1];
  let res = await fetch('glsl/soundform.exr');
  let blob = await res.blob();
  let data = await blob.arrayBuffer();
  let exr = openEXR(data, ch1.width, ch1.height, 4);
  ch1.upload(exr.rgba);
}

export function drawFrame(ctx, args) {
  ctx.runShader({ ...args, iChannelId: 0 });
  
  for (let i = 0; i < QTN; i++)
    ctx.runShader({ ...args, iChannelId: 2 });
  
  ctx.runShader({ ...args, iChannelId: 3 });
  ctx.runShader({ ...args, iChannelId: -1 });
}
