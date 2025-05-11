export function drawFrame(ctx, args) {
  ctx.runShader({ ...args, iChannelId: 0 }, 0);
  ctx.runShader({ ...args, iChannelId: 2 }, 2);
  ctx.runShader({ ...args, iChannelId: -1 });
}
