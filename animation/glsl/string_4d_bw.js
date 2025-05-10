export function drawFrame(ctx, args) {
  ctx.runShader({ ...args, iChannelId: 0 }, 0);
  for (let i = 0; i < 2; i++)
    ctx.runShader({ ...args, iChannelId: 1, iPass: i }, 1);
  ctx.runShader({ ...args, iChannelId: 2 }, 2);
  ctx.runShader({ ...args, iChannelId: 3 }, 3);
  ctx.runShader({ ...args, iChannelId: -1 });
}
