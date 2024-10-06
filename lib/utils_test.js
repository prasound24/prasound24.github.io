import * as utils from './utils.js';

const { dcheck } = utils;

test('SlidingWindowMinMax', () => {
  let mm3 = new utils.SlidingWindowMinMax(3);
  let mm5 = new utils.SlidingWindowMinMax(5);
  let a0 = [1, -2, 3, 0, 4, -3, 2, 5, -2, 1];
  let a3 = [0, +3, 5, 5, 4, +7, 7, 8, +7, 7];
  let a5 = [0, +3, 5, 5, 6, +7, 7, 8, +8, 8];
  let c3 = [], c5 = [];

  for (let i = 0; i < a0.length; i++) {
    mm3.push(a0[i]), c3[i] = mm3.range();
    mm5.push(a0[i]), c5[i] = mm5.range();
  }

  dcompare(a3, c3);
  dcompare(a5, c5);
});

function dcompare(need, have, eps = 1e-4) {
  dcheck(need.length == have.length);
  for (let i = 0; i < need.length; i++)
    dcheck(Math.abs(need[i] - have[i]) / need.length < eps, need[i] + ' != ' + have[i]);
}

function test(name, fn) {
  console.log(':: ' + name + ' ::');
  fn();
}

