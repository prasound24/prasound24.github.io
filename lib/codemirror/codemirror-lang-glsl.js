import {
  DefaultBufferLength,
  IterMode,
  LRLanguage,
  LanguageSupport,
  NodeProp,
  NodeSet,
  NodeType,
  Parser,
  Tree,
  continuedIndent,
  delimitedIndent,
  foldInside,
  foldNodeProp,
  indentNodeProp,
  styleTags,
  tags
} from "./chunk-MED5PSS5.js";
import "./chunk-FEL5PANN.js";

// node_modules/@lezer/lr/dist/index.js
var Stack = class _Stack {
  /**
  @internal
  */
  constructor(p, stack, state, reducePos, pos, score, buffer, bufferBase, curContext, lookAhead = 0, parent) {
    this.p = p;
    this.stack = stack;
    this.state = state;
    this.reducePos = reducePos;
    this.pos = pos;
    this.score = score;
    this.buffer = buffer;
    this.bufferBase = bufferBase;
    this.curContext = curContext;
    this.lookAhead = lookAhead;
    this.parent = parent;
  }
  /**
  @internal
  */
  toString() {
    return `[${this.stack.filter((_, i) => i % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
  }
  // Start an empty stack
  /**
  @internal
  */
  static start(p, state, pos = 0) {
    let cx = p.parser.context;
    return new _Stack(p, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
  }
  /**
  The stack's current [context](#lr.ContextTracker) value, if
  any. Its type will depend on the context tracker's type
  parameter, or it will be `null` if there is no context
  tracker.
  */
  get context() {
    return this.curContext ? this.curContext.context : null;
  }
  // Push a state onto the stack, tracking its start position as well
  // as the buffer base at that point.
  /**
  @internal
  */
  pushState(state, start) {
    this.stack.push(this.state, start, this.bufferBase + this.buffer.length);
    this.state = state;
  }
  // Apply a reduce action
  /**
  @internal
  */
  reduce(action) {
    var _a;
    let depth = action >> 19, type = action & 65535;
    let { parser: parser2 } = this.p;
    let lookaheadRecord = this.reducePos < this.pos - 25;
    if (lookaheadRecord)
      this.setLookAhead(this.pos);
    let dPrec = parser2.dynamicPrecedence(type);
    if (dPrec)
      this.score += dPrec;
    if (depth == 0) {
      this.pushState(parser2.getGoto(this.state, type, true), this.reducePos);
      if (type < parser2.minRepeatTerm)
        this.storeNode(type, this.reducePos, this.reducePos, lookaheadRecord ? 8 : 4, true);
      this.reduceContext(type, this.reducePos);
      return;
    }
    let base = this.stack.length - (depth - 1) * 3 - (action & 262144 ? 6 : 0);
    let start = base ? this.stack[base - 2] : this.p.ranges[0].from, size = this.reducePos - start;
    if (size >= 2e3 && !((_a = this.p.parser.nodeSet.types[type]) === null || _a === void 0 ? void 0 : _a.isAnonymous)) {
      if (start == this.p.lastBigReductionStart) {
        this.p.bigReductionCount++;
        this.p.lastBigReductionSize = size;
      } else if (this.p.lastBigReductionSize < size) {
        this.p.bigReductionCount = 1;
        this.p.lastBigReductionStart = start;
        this.p.lastBigReductionSize = size;
      }
    }
    let bufferBase = base ? this.stack[base - 1] : 0, count = this.bufferBase + this.buffer.length - bufferBase;
    if (type < parser2.minRepeatTerm || action & 131072) {
      let pos = parser2.stateFlag(
        this.state,
        1
        /* StateFlag.Skipped */
      ) ? this.pos : this.reducePos;
      this.storeNode(type, start, pos, count + 4, true);
    }
    if (action & 262144) {
      this.state = this.stack[base];
    } else {
      let baseStateID = this.stack[base - 3];
      this.state = parser2.getGoto(baseStateID, type, true);
    }
    while (this.stack.length > base)
      this.stack.pop();
    this.reduceContext(type, start);
  }
  // Shift a value into the buffer
  /**
  @internal
  */
  storeNode(term, start, end, size = 4, mustSink = false) {
    if (term == 0 && (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
      let cur = this, top = this.buffer.length;
      if (top == 0 && cur.parent) {
        top = cur.bufferBase - cur.parent.bufferBase;
        cur = cur.parent;
      }
      if (top > 0 && cur.buffer[top - 4] == 0 && cur.buffer[top - 1] > -1) {
        if (start == end)
          return;
        if (cur.buffer[top - 2] >= start) {
          cur.buffer[top - 2] = end;
          return;
        }
      }
    }
    if (!mustSink || this.pos == end) {
      this.buffer.push(term, start, end, size);
    } else {
      let index = this.buffer.length;
      if (index > 0 && this.buffer[index - 4] != 0) {
        let mustMove = false;
        for (let scan = index; scan > 0 && this.buffer[scan - 2] > end; scan -= 4) {
          if (this.buffer[scan - 1] >= 0) {
            mustMove = true;
            break;
          }
        }
        if (mustMove)
          while (index > 0 && this.buffer[index - 2] > end) {
            this.buffer[index] = this.buffer[index - 4];
            this.buffer[index + 1] = this.buffer[index - 3];
            this.buffer[index + 2] = this.buffer[index - 2];
            this.buffer[index + 3] = this.buffer[index - 1];
            index -= 4;
            if (size > 4)
              size -= 4;
          }
      }
      this.buffer[index] = term;
      this.buffer[index + 1] = start;
      this.buffer[index + 2] = end;
      this.buffer[index + 3] = size;
    }
  }
  // Apply a shift action
  /**
  @internal
  */
  shift(action, type, start, end) {
    if (action & 131072) {
      this.pushState(action & 65535, this.pos);
    } else if ((action & 262144) == 0) {
      let nextState = action, { parser: parser2 } = this.p;
      if (end > this.pos || type <= parser2.maxNode) {
        this.pos = end;
        if (!parser2.stateFlag(
          nextState,
          1
          /* StateFlag.Skipped */
        ))
          this.reducePos = end;
      }
      this.pushState(nextState, start);
      this.shiftContext(type, start);
      if (type <= parser2.maxNode)
        this.buffer.push(type, start, end, 4);
    } else {
      this.pos = end;
      this.shiftContext(type, start);
      if (type <= this.p.parser.maxNode)
        this.buffer.push(type, start, end, 4);
    }
  }
  // Apply an action
  /**
  @internal
  */
  apply(action, next, nextStart, nextEnd) {
    if (action & 65536)
      this.reduce(action);
    else
      this.shift(action, next, nextStart, nextEnd);
  }
  // Add a prebuilt (reused) node into the buffer.
  /**
  @internal
  */
  useNode(value, next) {
    let index = this.p.reused.length - 1;
    if (index < 0 || this.p.reused[index] != value) {
      this.p.reused.push(value);
      index++;
    }
    let start = this.pos;
    this.reducePos = this.pos = start + value.length;
    this.pushState(next, start);
    this.buffer.push(
      index,
      start,
      this.reducePos,
      -1
      /* size == -1 means this is a reused value */
    );
    if (this.curContext)
      this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
  }
  // Split the stack. Due to the buffer sharing and the fact
  // that `this.stack` tends to stay quite shallow, this isn't very
  // expensive.
  /**
  @internal
  */
  split() {
    let parent = this;
    let off = parent.buffer.length;
    while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
      off -= 4;
    let buffer = parent.buffer.slice(off), base = parent.bufferBase + off;
    while (parent && base == parent.bufferBase)
      parent = parent.parent;
    return new _Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base, this.curContext, this.lookAhead, parent);
  }
  // Try to recover from an error by 'deleting' (ignoring) one token.
  /**
  @internal
  */
  recoverByDelete(next, nextEnd) {
    let isNode = next <= this.p.parser.maxNode;
    if (isNode)
      this.storeNode(next, this.pos, nextEnd, 4);
    this.storeNode(0, this.pos, nextEnd, isNode ? 8 : 4);
    this.pos = this.reducePos = nextEnd;
    this.score -= 190;
  }
  /**
  Check if the given term would be able to be shifted (optionally
  after some reductions) on this stack. This can be useful for
  external tokenizers that want to make sure they only provide a
  given token when it applies.
  */
  canShift(term) {
    for (let sim = new SimulatedStack(this); ; ) {
      let action = this.p.parser.stateSlot(
        sim.state,
        4
        /* ParseState.DefaultReduce */
      ) || this.p.parser.hasAction(sim.state, term);
      if (action == 0)
        return false;
      if ((action & 65536) == 0)
        return true;
      sim.reduce(action);
    }
  }
  // Apply up to Recover.MaxNext recovery actions that conceptually
  // inserts some missing token or rule.
  /**
  @internal
  */
  recoverByInsert(next) {
    if (this.stack.length >= 300)
      return [];
    let nextStates = this.p.parser.nextStates(this.state);
    if (nextStates.length > 4 << 1 || this.stack.length >= 120) {
      let best = [];
      for (let i = 0, s; i < nextStates.length; i += 2) {
        if ((s = nextStates[i + 1]) != this.state && this.p.parser.hasAction(s, next))
          best.push(nextStates[i], s);
      }
      if (this.stack.length < 120)
        for (let i = 0; best.length < 4 << 1 && i < nextStates.length; i += 2) {
          let s = nextStates[i + 1];
          if (!best.some((v, i2) => i2 & 1 && v == s))
            best.push(nextStates[i], s);
        }
      nextStates = best;
    }
    let result = [];
    for (let i = 0; i < nextStates.length && result.length < 4; i += 2) {
      let s = nextStates[i + 1];
      if (s == this.state)
        continue;
      let stack = this.split();
      stack.pushState(s, this.pos);
      stack.storeNode(0, stack.pos, stack.pos, 4, true);
      stack.shiftContext(nextStates[i], this.pos);
      stack.reducePos = this.pos;
      stack.score -= 200;
      result.push(stack);
    }
    return result;
  }
  // Force a reduce, if possible. Return false if that can't
  // be done.
  /**
  @internal
  */
  forceReduce() {
    let { parser: parser2 } = this.p;
    let reduce = parser2.stateSlot(
      this.state,
      5
      /* ParseState.ForcedReduce */
    );
    if ((reduce & 65536) == 0)
      return false;
    if (!parser2.validAction(this.state, reduce)) {
      let depth = reduce >> 19, term = reduce & 65535;
      let target = this.stack.length - depth * 3;
      if (target < 0 || parser2.getGoto(this.stack[target], term, false) < 0) {
        let backup = this.findForcedReduction();
        if (backup == null)
          return false;
        reduce = backup;
      }
      this.storeNode(0, this.pos, this.pos, 4, true);
      this.score -= 100;
    }
    this.reducePos = this.pos;
    this.reduce(reduce);
    return true;
  }
  /**
  Try to scan through the automaton to find some kind of reduction
  that can be applied. Used when the regular ForcedReduce field
  isn't a valid action. @internal
  */
  findForcedReduction() {
    let { parser: parser2 } = this.p, seen = [];
    let explore = (state, depth) => {
      if (seen.includes(state))
        return;
      seen.push(state);
      return parser2.allActions(state, (action) => {
        if (action & (262144 | 131072)) ;
        else if (action & 65536) {
          let rDepth = (action >> 19) - depth;
          if (rDepth > 1) {
            let term = action & 65535, target = this.stack.length - rDepth * 3;
            if (target >= 0 && parser2.getGoto(this.stack[target], term, false) >= 0)
              return rDepth << 19 | 65536 | term;
          }
        } else {
          let found = explore(action, depth + 1);
          if (found != null)
            return found;
        }
      });
    };
    return explore(this.state, 0);
  }
  /**
  @internal
  */
  forceAll() {
    while (!this.p.parser.stateFlag(
      this.state,
      2
      /* StateFlag.Accepting */
    )) {
      if (!this.forceReduce()) {
        this.storeNode(0, this.pos, this.pos, 4, true);
        break;
      }
    }
    return this;
  }
  /**
  Check whether this state has no further actions (assumed to be a direct descendant of the
  top state, since any other states must be able to continue
  somehow). @internal
  */
  get deadEnd() {
    if (this.stack.length != 3)
      return false;
    let { parser: parser2 } = this.p;
    return parser2.data[parser2.stateSlot(
      this.state,
      1
      /* ParseState.Actions */
    )] == 65535 && !parser2.stateSlot(
      this.state,
      4
      /* ParseState.DefaultReduce */
    );
  }
  /**
  Restart the stack (put it back in its start state). Only safe
  when this.stack.length == 3 (state is directly below the top
  state). @internal
  */
  restart() {
    this.storeNode(0, this.pos, this.pos, 4, true);
    this.state = this.stack[0];
    this.stack.length = 0;
  }
  /**
  @internal
  */
  sameState(other) {
    if (this.state != other.state || this.stack.length != other.stack.length)
      return false;
    for (let i = 0; i < this.stack.length; i += 3)
      if (this.stack[i] != other.stack[i])
        return false;
    return true;
  }
  /**
  Get the parser used by this stack.
  */
  get parser() {
    return this.p.parser;
  }
  /**
  Test whether a given dialect (by numeric ID, as exported from
  the terms file) is enabled.
  */
  dialectEnabled(dialectID) {
    return this.p.parser.dialect.flags[dialectID];
  }
  shiftContext(term, start) {
    if (this.curContext)
      this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start)));
  }
  reduceContext(term, start) {
    if (this.curContext)
      this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start)));
  }
  /**
  @internal
  */
  emitContext() {
    let last = this.buffer.length - 1;
    if (last < 0 || this.buffer[last] != -3)
      this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
  }
  /**
  @internal
  */
  emitLookAhead() {
    let last = this.buffer.length - 1;
    if (last < 0 || this.buffer[last] != -4)
      this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
  }
  updateContext(context) {
    if (context != this.curContext.context) {
      let newCx = new StackContext(this.curContext.tracker, context);
      if (newCx.hash != this.curContext.hash)
        this.emitContext();
      this.curContext = newCx;
    }
  }
  /**
  @internal
  */
  setLookAhead(lookAhead) {
    if (lookAhead > this.lookAhead) {
      this.emitLookAhead();
      this.lookAhead = lookAhead;
    }
  }
  /**
  @internal
  */
  close() {
    if (this.curContext && this.curContext.tracker.strict)
      this.emitContext();
    if (this.lookAhead > 0)
      this.emitLookAhead();
  }
};
var StackContext = class {
  constructor(tracker, context) {
    this.tracker = tracker;
    this.context = context;
    this.hash = tracker.strict ? tracker.hash(context) : 0;
  }
};
var SimulatedStack = class {
  constructor(start) {
    this.start = start;
    this.state = start.state;
    this.stack = start.stack;
    this.base = this.stack.length;
  }
  reduce(action) {
    let term = action & 65535, depth = action >> 19;
    if (depth == 0) {
      if (this.stack == this.start.stack)
        this.stack = this.stack.slice();
      this.stack.push(this.state, 0, 0);
      this.base += 3;
    } else {
      this.base -= (depth - 1) * 3;
    }
    let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
    this.state = goto;
  }
};
var StackBufferCursor = class _StackBufferCursor {
  constructor(stack, pos, index) {
    this.stack = stack;
    this.pos = pos;
    this.index = index;
    this.buffer = stack.buffer;
    if (this.index == 0)
      this.maybeNext();
  }
  static create(stack, pos = stack.bufferBase + stack.buffer.length) {
    return new _StackBufferCursor(stack, pos, pos - stack.bufferBase);
  }
  maybeNext() {
    let next = this.stack.parent;
    if (next != null) {
      this.index = this.stack.bufferBase - next.bufferBase;
      this.stack = next;
      this.buffer = next.buffer;
    }
  }
  get id() {
    return this.buffer[this.index - 4];
  }
  get start() {
    return this.buffer[this.index - 3];
  }
  get end() {
    return this.buffer[this.index - 2];
  }
  get size() {
    return this.buffer[this.index - 1];
  }
  next() {
    this.index -= 4;
    this.pos -= 4;
    if (this.index == 0)
      this.maybeNext();
  }
  fork() {
    return new _StackBufferCursor(this.stack, this.pos, this.index);
  }
};
function decodeArray(input, Type = Uint16Array) {
  if (typeof input != "string")
    return input;
  let array = null;
  for (let pos = 0, out = 0; pos < input.length; ) {
    let value = 0;
    for (; ; ) {
      let next = input.charCodeAt(pos++), stop = false;
      if (next == 126) {
        value = 65535;
        break;
      }
      if (next >= 92)
        next--;
      if (next >= 34)
        next--;
      let digit = next - 32;
      if (digit >= 46) {
        digit -= 46;
        stop = true;
      }
      value += digit;
      if (stop)
        break;
      value *= 46;
    }
    if (array)
      array[out++] = value;
    else
      array = new Type(value);
  }
  return array;
}
var CachedToken = class {
  constructor() {
    this.start = -1;
    this.value = -1;
    this.end = -1;
    this.extended = -1;
    this.lookAhead = 0;
    this.mask = 0;
    this.context = 0;
  }
};
var nullToken = new CachedToken();
var InputStream = class {
  /**
  @internal
  */
  constructor(input, ranges) {
    this.input = input;
    this.ranges = ranges;
    this.chunk = "";
    this.chunkOff = 0;
    this.chunk2 = "";
    this.chunk2Pos = 0;
    this.next = -1;
    this.token = nullToken;
    this.rangeIndex = 0;
    this.pos = this.chunkPos = ranges[0].from;
    this.range = ranges[0];
    this.end = ranges[ranges.length - 1].to;
    this.readNext();
  }
  /**
  @internal
  */
  resolveOffset(offset, assoc) {
    let range = this.range, index = this.rangeIndex;
    let pos = this.pos + offset;
    while (pos < range.from) {
      if (!index)
        return null;
      let next = this.ranges[--index];
      pos -= range.from - next.to;
      range = next;
    }
    while (assoc < 0 ? pos > range.to : pos >= range.to) {
      if (index == this.ranges.length - 1)
        return null;
      let next = this.ranges[++index];
      pos += next.from - range.to;
      range = next;
    }
    return pos;
  }
  /**
  @internal
  */
  clipPos(pos) {
    if (pos >= this.range.from && pos < this.range.to)
      return pos;
    for (let range of this.ranges)
      if (range.to > pos)
        return Math.max(pos, range.from);
    return this.end;
  }
  /**
  Look at a code unit near the stream position. `.peek(0)` equals
  `.next`, `.peek(-1)` gives you the previous character, and so
  on.
  
  Note that looking around during tokenizing creates dependencies
  on potentially far-away content, which may reduce the
  effectiveness incremental parsing—when looking forward—or even
  cause invalid reparses when looking backward more than 25 code
  units, since the library does not track lookbehind.
  */
  peek(offset) {
    let idx = this.chunkOff + offset, pos, result;
    if (idx >= 0 && idx < this.chunk.length) {
      pos = this.pos + offset;
      result = this.chunk.charCodeAt(idx);
    } else {
      let resolved = this.resolveOffset(offset, 1);
      if (resolved == null)
        return -1;
      pos = resolved;
      if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
        result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
      } else {
        let i = this.rangeIndex, range = this.range;
        while (range.to <= pos)
          range = this.ranges[++i];
        this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
        if (pos + this.chunk2.length > range.to)
          this.chunk2 = this.chunk2.slice(0, range.to - pos);
        result = this.chunk2.charCodeAt(0);
      }
    }
    if (pos >= this.token.lookAhead)
      this.token.lookAhead = pos + 1;
    return result;
  }
  /**
  Accept a token. By default, the end of the token is set to the
  current stream position, but you can pass an offset (relative to
  the stream position) to change that.
  */
  acceptToken(token, endOffset = 0) {
    let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
    if (end == null || end < this.token.start)
      throw new RangeError("Token end out of bounds");
    this.token.value = token;
    this.token.end = end;
  }
  /**
  Accept a token ending at a specific given position.
  */
  acceptTokenTo(token, endPos) {
    this.token.value = token;
    this.token.end = endPos;
  }
  getChunk() {
    if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
      let { chunk, chunkPos } = this;
      this.chunk = this.chunk2;
      this.chunkPos = this.chunk2Pos;
      this.chunk2 = chunk;
      this.chunk2Pos = chunkPos;
      this.chunkOff = this.pos - this.chunkPos;
    } else {
      this.chunk2 = this.chunk;
      this.chunk2Pos = this.chunkPos;
      let nextChunk = this.input.chunk(this.pos);
      let end = this.pos + nextChunk.length;
      this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
      this.chunkPos = this.pos;
      this.chunkOff = 0;
    }
  }
  readNext() {
    if (this.chunkOff >= this.chunk.length) {
      this.getChunk();
      if (this.chunkOff == this.chunk.length)
        return this.next = -1;
    }
    return this.next = this.chunk.charCodeAt(this.chunkOff);
  }
  /**
  Move the stream forward N (defaults to 1) code units. Returns
  the new value of [`next`](#lr.InputStream.next).
  */
  advance(n = 1) {
    this.chunkOff += n;
    while (this.pos + n >= this.range.to) {
      if (this.rangeIndex == this.ranges.length - 1)
        return this.setDone();
      n -= this.range.to - this.pos;
      this.range = this.ranges[++this.rangeIndex];
      this.pos = this.range.from;
    }
    this.pos += n;
    if (this.pos >= this.token.lookAhead)
      this.token.lookAhead = this.pos + 1;
    return this.readNext();
  }
  setDone() {
    this.pos = this.chunkPos = this.end;
    this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
    this.chunk = "";
    return this.next = -1;
  }
  /**
  @internal
  */
  reset(pos, token) {
    if (token) {
      this.token = token;
      token.start = pos;
      token.lookAhead = pos + 1;
      token.value = token.extended = -1;
    } else {
      this.token = nullToken;
    }
    if (this.pos != pos) {
      this.pos = pos;
      if (pos == this.end) {
        this.setDone();
        return this;
      }
      while (pos < this.range.from)
        this.range = this.ranges[--this.rangeIndex];
      while (pos >= this.range.to)
        this.range = this.ranges[++this.rangeIndex];
      if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
        this.chunkOff = pos - this.chunkPos;
      } else {
        this.chunk = "";
        this.chunkOff = 0;
      }
      this.readNext();
    }
    return this;
  }
  /**
  @internal
  */
  read(from, to) {
    if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
      return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
    if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
      return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
    if (from >= this.range.from && to <= this.range.to)
      return this.input.read(from, to);
    let result = "";
    for (let r of this.ranges) {
      if (r.from >= to)
        break;
      if (r.to > from)
        result += this.input.read(Math.max(r.from, from), Math.min(r.to, to));
    }
    return result;
  }
};
var TokenGroup = class {
  constructor(data, id) {
    this.data = data;
    this.id = id;
  }
  token(input, stack) {
    let { parser: parser2 } = stack.p;
    readToken(this.data, input, stack, this.id, parser2.data, parser2.tokenPrecTable);
  }
};
TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
var LocalTokenGroup = class {
  constructor(data, precTable, elseToken) {
    this.precTable = precTable;
    this.elseToken = elseToken;
    this.data = typeof data == "string" ? decodeArray(data) : data;
  }
  token(input, stack) {
    let start = input.pos, skipped = 0;
    for (; ; ) {
      let atEof = input.next < 0, nextPos = input.resolveOffset(1, 1);
      readToken(this.data, input, stack, 0, this.data, this.precTable);
      if (input.token.value > -1)
        break;
      if (this.elseToken == null)
        return;
      if (!atEof)
        skipped++;
      if (nextPos == null)
        break;
      input.reset(nextPos, input.token);
    }
    if (skipped) {
      input.reset(start, input.token);
      input.acceptToken(this.elseToken, skipped);
    }
  }
};
LocalTokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
var ExternalTokenizer = class {
  /**
  Create a tokenizer. The first argument is the function that,
  given an input stream, scans for the types of tokens it
  recognizes at the stream's position, and calls
  [`acceptToken`](#lr.InputStream.acceptToken) when it finds
  one.
  */
  constructor(token, options = {}) {
    this.token = token;
    this.contextual = !!options.contextual;
    this.fallback = !!options.fallback;
    this.extend = !!options.extend;
  }
};
function readToken(data, input, stack, group, precTable, precOffset) {
  let state = 0, groupMask = 1 << group, { dialect } = stack.p.parser;
  scan: for (; ; ) {
    if ((groupMask & data[state]) == 0)
      break;
    let accEnd = data[state + 1];
    for (let i = state + 3; i < accEnd; i += 2)
      if ((data[i + 1] & groupMask) > 0) {
        let term = data[i];
        if (dialect.allows(term) && (input.token.value == -1 || input.token.value == term || overrides(term, input.token.value, precTable, precOffset))) {
          input.acceptToken(term);
          break;
        }
      }
    let next = input.next, low = 0, high = data[state + 2];
    if (input.next < 0 && high > low && data[accEnd + high * 3 - 3] == 65535) {
      state = data[accEnd + high * 3 - 1];
      continue scan;
    }
    for (; low < high; ) {
      let mid = low + high >> 1;
      let index = accEnd + mid + (mid << 1);
      let from = data[index], to = data[index + 1] || 65536;
      if (next < from)
        high = mid;
      else if (next >= to)
        low = mid + 1;
      else {
        state = data[index + 2];
        input.advance();
        continue scan;
      }
    }
    break;
  }
}
function findOffset(data, start, term) {
  for (let i = start, next; (next = data[i]) != 65535; i++)
    if (next == term)
      return i - start;
  return -1;
}
function overrides(token, prev, tableData, tableOffset) {
  let iPrev = findOffset(tableData, tableOffset, prev);
  return iPrev < 0 || findOffset(tableData, tableOffset, token) < iPrev;
}
var verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
var stackIDs = null;
function cutAt(tree, pos, side) {
  let cursor = tree.cursor(IterMode.IncludeAnonymous);
  cursor.moveTo(pos);
  for (; ; ) {
    if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
      for (; ; ) {
        if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
          return side < 0 ? Math.max(0, Math.min(
            cursor.to - 1,
            pos - 25
            /* Lookahead.Margin */
          )) : Math.min(tree.length, Math.max(
            cursor.from + 1,
            pos + 25
            /* Lookahead.Margin */
          ));
        if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
          break;
        if (!cursor.parent())
          return side < 0 ? 0 : tree.length;
      }
  }
}
var FragmentCursor = class {
  constructor(fragments, nodeSet) {
    this.fragments = fragments;
    this.nodeSet = nodeSet;
    this.i = 0;
    this.fragment = null;
    this.safeFrom = -1;
    this.safeTo = -1;
    this.trees = [];
    this.start = [];
    this.index = [];
    this.nextFragment();
  }
  nextFragment() {
    let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
    if (fr) {
      this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
      this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
      while (this.trees.length) {
        this.trees.pop();
        this.start.pop();
        this.index.pop();
      }
      this.trees.push(fr.tree);
      this.start.push(-fr.offset);
      this.index.push(0);
      this.nextStart = this.safeFrom;
    } else {
      this.nextStart = 1e9;
    }
  }
  // `pos` must be >= any previously given `pos` for this cursor
  nodeAt(pos) {
    if (pos < this.nextStart)
      return null;
    while (this.fragment && this.safeTo <= pos)
      this.nextFragment();
    if (!this.fragment)
      return null;
    for (; ; ) {
      let last = this.trees.length - 1;
      if (last < 0) {
        this.nextFragment();
        return null;
      }
      let top = this.trees[last], index = this.index[last];
      if (index == top.children.length) {
        this.trees.pop();
        this.start.pop();
        this.index.pop();
        continue;
      }
      let next = top.children[index];
      let start = this.start[last] + top.positions[index];
      if (start > pos) {
        this.nextStart = start;
        return null;
      }
      if (next instanceof Tree) {
        if (start == pos) {
          if (start < this.safeFrom)
            return null;
          let end = start + next.length;
          if (end <= this.safeTo) {
            let lookAhead = next.prop(NodeProp.lookAhead);
            if (!lookAhead || end + lookAhead < this.fragment.to)
              return next;
          }
        }
        this.index[last]++;
        if (start + next.length >= Math.max(this.safeFrom, pos)) {
          this.trees.push(next);
          this.start.push(start);
          this.index.push(0);
        }
      } else {
        this.index[last]++;
        this.nextStart = start + next.length;
      }
    }
  }
};
var TokenCache = class {
  constructor(parser2, stream) {
    this.stream = stream;
    this.tokens = [];
    this.mainToken = null;
    this.actions = [];
    this.tokens = parser2.tokenizers.map((_) => new CachedToken());
  }
  getActions(stack) {
    let actionIndex = 0;
    let main = null;
    let { parser: parser2 } = stack.p, { tokenizers } = parser2;
    let mask = parser2.stateSlot(
      stack.state,
      3
      /* ParseState.TokenizerMask */
    );
    let context = stack.curContext ? stack.curContext.hash : 0;
    let lookAhead = 0;
    for (let i = 0; i < tokenizers.length; i++) {
      if ((1 << i & mask) == 0)
        continue;
      let tokenizer = tokenizers[i], token = this.tokens[i];
      if (main && !tokenizer.fallback)
        continue;
      if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
        this.updateCachedToken(token, tokenizer, stack);
        token.mask = mask;
        token.context = context;
      }
      if (token.lookAhead > token.end + 25)
        lookAhead = Math.max(token.lookAhead, lookAhead);
      if (token.value != 0) {
        let startIndex = actionIndex;
        if (token.extended > -1)
          actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
        actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
        if (!tokenizer.extend) {
          main = token;
          if (actionIndex > startIndex)
            break;
        }
      }
    }
    while (this.actions.length > actionIndex)
      this.actions.pop();
    if (lookAhead)
      stack.setLookAhead(lookAhead);
    if (!main && stack.pos == this.stream.end) {
      main = new CachedToken();
      main.value = stack.p.parser.eofTerm;
      main.start = main.end = stack.pos;
      actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
    }
    this.mainToken = main;
    return this.actions;
  }
  getMainToken(stack) {
    if (this.mainToken)
      return this.mainToken;
    let main = new CachedToken(), { pos, p } = stack;
    main.start = pos;
    main.end = Math.min(pos + 1, p.stream.end);
    main.value = pos == p.stream.end ? p.parser.eofTerm : 0;
    return main;
  }
  updateCachedToken(token, tokenizer, stack) {
    let start = this.stream.clipPos(stack.pos);
    tokenizer.token(this.stream.reset(start, token), stack);
    if (token.value > -1) {
      let { parser: parser2 } = stack.p;
      for (let i = 0; i < parser2.specialized.length; i++)
        if (parser2.specialized[i] == token.value) {
          let result = parser2.specializers[i](this.stream.read(token.start, token.end), stack);
          if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
            if ((result & 1) == 0)
              token.value = result >> 1;
            else
              token.extended = result >> 1;
            break;
          }
        }
    } else {
      token.value = 0;
      token.end = this.stream.clipPos(start + 1);
    }
  }
  putAction(action, token, end, index) {
    for (let i = 0; i < index; i += 3)
      if (this.actions[i] == action)
        return index;
    this.actions[index++] = action;
    this.actions[index++] = token;
    this.actions[index++] = end;
    return index;
  }
  addActions(stack, token, end, index) {
    let { state } = stack, { parser: parser2 } = stack.p, { data } = parser2;
    for (let set = 0; set < 2; set++) {
      for (let i = parser2.stateSlot(
        state,
        set ? 2 : 1
        /* ParseState.Actions */
      ); ; i += 3) {
        if (data[i] == 65535) {
          if (data[i + 1] == 1) {
            i = pair(data, i + 2);
          } else {
            if (index == 0 && data[i + 1] == 2)
              index = this.putAction(pair(data, i + 2), token, end, index);
            break;
          }
        }
        if (data[i] == token)
          index = this.putAction(pair(data, i + 1), token, end, index);
      }
    }
    return index;
  }
};
var Parse = class {
  constructor(parser2, input, fragments, ranges) {
    this.parser = parser2;
    this.input = input;
    this.ranges = ranges;
    this.recovering = 0;
    this.nextStackID = 9812;
    this.minStackPos = 0;
    this.reused = [];
    this.stoppedAt = null;
    this.lastBigReductionStart = -1;
    this.lastBigReductionSize = 0;
    this.bigReductionCount = 0;
    this.stream = new InputStream(input, ranges);
    this.tokens = new TokenCache(parser2, this.stream);
    this.topTerm = parser2.top[1];
    let { from } = ranges[0];
    this.stacks = [Stack.start(this, parser2.top[0], from)];
    this.fragments = fragments.length && this.stream.end - from > parser2.bufferLength * 4 ? new FragmentCursor(fragments, parser2.nodeSet) : null;
  }
  get parsedPos() {
    return this.minStackPos;
  }
  // Move the parser forward. This will process all parse stacks at
  // `this.pos` and try to advance them to a further position. If no
  // stack for such a position is found, it'll start error-recovery.
  //
  // When the parse is finished, this will return a syntax tree. When
  // not, it returns `null`.
  advance() {
    let stacks = this.stacks, pos = this.minStackPos;
    let newStacks = this.stacks = [];
    let stopped, stoppedTokens;
    if (this.bigReductionCount > 300 && stacks.length == 1) {
      let [s] = stacks;
      while (s.forceReduce() && s.stack.length && s.stack[s.stack.length - 2] >= this.lastBigReductionStart) {
      }
      this.bigReductionCount = this.lastBigReductionSize = 0;
    }
    for (let i = 0; i < stacks.length; i++) {
      let stack = stacks[i];
      for (; ; ) {
        this.tokens.mainToken = null;
        if (stack.pos > pos) {
          newStacks.push(stack);
        } else if (this.advanceStack(stack, newStacks, stacks)) {
          continue;
        } else {
          if (!stopped) {
            stopped = [];
            stoppedTokens = [];
          }
          stopped.push(stack);
          let tok = this.tokens.getMainToken(stack);
          stoppedTokens.push(tok.value, tok.end);
        }
        break;
      }
    }
    if (!newStacks.length) {
      let finished = stopped && findFinished(stopped);
      if (finished) {
        if (verbose)
          console.log("Finish with " + this.stackID(finished));
        return this.stackToTree(finished);
      }
      if (this.parser.strict) {
        if (verbose && stopped)
          console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
        throw new SyntaxError("No parse at " + pos);
      }
      if (!this.recovering)
        this.recovering = 5;
    }
    if (this.recovering && stopped) {
      let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0] : this.runRecovery(stopped, stoppedTokens, newStacks);
      if (finished) {
        if (verbose)
          console.log("Force-finish " + this.stackID(finished));
        return this.stackToTree(finished.forceAll());
      }
    }
    if (this.recovering) {
      let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3;
      if (newStacks.length > maxRemaining) {
        newStacks.sort((a, b) => b.score - a.score);
        while (newStacks.length > maxRemaining)
          newStacks.pop();
      }
      if (newStacks.some((s) => s.reducePos > pos))
        this.recovering--;
    } else if (newStacks.length > 1) {
      outer: for (let i = 0; i < newStacks.length - 1; i++) {
        let stack = newStacks[i];
        for (let j = i + 1; j < newStacks.length; j++) {
          let other = newStacks[j];
          if (stack.sameState(other) || stack.buffer.length > 500 && other.buffer.length > 500) {
            if ((stack.score - other.score || stack.buffer.length - other.buffer.length) > 0) {
              newStacks.splice(j--, 1);
            } else {
              newStacks.splice(i--, 1);
              continue outer;
            }
          }
        }
      }
      if (newStacks.length > 12)
        newStacks.splice(
          12,
          newStacks.length - 12
          /* Rec.MaxStackCount */
        );
    }
    this.minStackPos = newStacks[0].pos;
    for (let i = 1; i < newStacks.length; i++)
      if (newStacks[i].pos < this.minStackPos)
        this.minStackPos = newStacks[i].pos;
    return null;
  }
  stopAt(pos) {
    if (this.stoppedAt != null && this.stoppedAt < pos)
      throw new RangeError("Can't move stoppedAt forward");
    this.stoppedAt = pos;
  }
  // Returns an updated version of the given stack, or null if the
  // stack can't advance normally. When `split` and `stacks` are
  // given, stacks split off by ambiguous operations will be pushed to
  // `split`, or added to `stacks` if they move `pos` forward.
  advanceStack(stack, stacks, split) {
    let start = stack.pos, { parser: parser2 } = this;
    let base = verbose ? this.stackID(stack) + " -> " : "";
    if (this.stoppedAt != null && start > this.stoppedAt)
      return stack.forceReduce() ? stack : null;
    if (this.fragments) {
      let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
      for (let cached = this.fragments.nodeAt(start); cached; ) {
        let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser2.getGoto(stack.state, cached.type.id) : -1;
        if (match > -1 && cached.length && (!strictCx || (cached.prop(NodeProp.contextHash) || 0) == cxHash)) {
          stack.useNode(cached, match);
          if (verbose)
            console.log(base + this.stackID(stack) + ` (via reuse of ${parser2.getName(cached.type.id)})`);
          return true;
        }
        if (!(cached instanceof Tree) || cached.children.length == 0 || cached.positions[0] > 0)
          break;
        let inner = cached.children[0];
        if (inner instanceof Tree && cached.positions[0] == 0)
          cached = inner;
        else
          break;
      }
    }
    let defaultReduce = parser2.stateSlot(
      stack.state,
      4
      /* ParseState.DefaultReduce */
    );
    if (defaultReduce > 0) {
      stack.reduce(defaultReduce);
      if (verbose)
        console.log(base + this.stackID(stack) + ` (via always-reduce ${parser2.getName(
          defaultReduce & 65535
          /* Action.ValueMask */
        )})`);
      return true;
    }
    if (stack.stack.length >= 8400) {
      while (stack.stack.length > 6e3 && stack.forceReduce()) {
      }
    }
    let actions = this.tokens.getActions(stack);
    for (let i = 0; i < actions.length; ) {
      let action = actions[i++], term = actions[i++], end = actions[i++];
      let last = i == actions.length || !split;
      let localStack = last ? stack : stack.split();
      let main = this.tokens.mainToken;
      localStack.apply(action, term, main ? main.start : localStack.pos, end);
      if (verbose)
        console.log(base + this.stackID(localStack) + ` (via ${(action & 65536) == 0 ? "shift" : `reduce of ${parser2.getName(
          action & 65535
          /* Action.ValueMask */
        )}`} for ${parser2.getName(term)} @ ${start}${localStack == stack ? "" : ", split"})`);
      if (last)
        return true;
      else if (localStack.pos > start)
        stacks.push(localStack);
      else
        split.push(localStack);
    }
    return false;
  }
  // Advance a given stack forward as far as it will go. Returns the
  // (possibly updated) stack if it got stuck, or null if it moved
  // forward and was given to `pushStackDedup`.
  advanceFully(stack, newStacks) {
    let pos = stack.pos;
    for (; ; ) {
      if (!this.advanceStack(stack, null, null))
        return false;
      if (stack.pos > pos) {
        pushStackDedup(stack, newStacks);
        return true;
      }
    }
  }
  runRecovery(stacks, tokens, newStacks) {
    let finished = null, restarted = false;
    for (let i = 0; i < stacks.length; i++) {
      let stack = stacks[i], token = tokens[i << 1], tokenEnd = tokens[(i << 1) + 1];
      let base = verbose ? this.stackID(stack) + " -> " : "";
      if (stack.deadEnd) {
        if (restarted)
          continue;
        restarted = true;
        stack.restart();
        if (verbose)
          console.log(base + this.stackID(stack) + " (restarted)");
        let done = this.advanceFully(stack, newStacks);
        if (done)
          continue;
      }
      let force = stack.split(), forceBase = base;
      for (let j = 0; force.forceReduce() && j < 10; j++) {
        if (verbose)
          console.log(forceBase + this.stackID(force) + " (via force-reduce)");
        let done = this.advanceFully(force, newStacks);
        if (done)
          break;
        if (verbose)
          forceBase = this.stackID(force) + " -> ";
      }
      for (let insert of stack.recoverByInsert(token)) {
        if (verbose)
          console.log(base + this.stackID(insert) + " (via recover-insert)");
        this.advanceFully(insert, newStacks);
      }
      if (this.stream.end > stack.pos) {
        if (tokenEnd == stack.pos) {
          tokenEnd++;
          token = 0;
        }
        stack.recoverByDelete(token, tokenEnd);
        if (verbose)
          console.log(base + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
        pushStackDedup(stack, newStacks);
      } else if (!finished || finished.score < stack.score) {
        finished = stack;
      }
    }
    return finished;
  }
  // Convert the stack's buffer to a syntax tree.
  stackToTree(stack) {
    stack.close();
    return Tree.build({
      buffer: StackBufferCursor.create(stack),
      nodeSet: this.parser.nodeSet,
      topID: this.topTerm,
      maxBufferLength: this.parser.bufferLength,
      reused: this.reused,
      start: this.ranges[0].from,
      length: stack.pos - this.ranges[0].from,
      minRepeatType: this.parser.minRepeatTerm
    });
  }
  stackID(stack) {
    let id = (stackIDs || (stackIDs = /* @__PURE__ */ new WeakMap())).get(stack);
    if (!id)
      stackIDs.set(stack, id = String.fromCodePoint(this.nextStackID++));
    return id + stack;
  }
};
function pushStackDedup(stack, newStacks) {
  for (let i = 0; i < newStacks.length; i++) {
    let other = newStacks[i];
    if (other.pos == stack.pos && other.sameState(stack)) {
      if (newStacks[i].score < stack.score)
        newStacks[i] = stack;
      return;
    }
  }
  newStacks.push(stack);
}
var Dialect = class {
  constructor(source, flags, disabled) {
    this.source = source;
    this.flags = flags;
    this.disabled = disabled;
  }
  allows(term) {
    return !this.disabled || this.disabled[term] == 0;
  }
};
var LRParser = class _LRParser extends Parser {
  /**
  @internal
  */
  constructor(spec) {
    super();
    this.wrappers = [];
    if (spec.version != 14)
      throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14})`);
    let nodeNames = spec.nodeNames.split(" ");
    this.minRepeatTerm = nodeNames.length;
    for (let i = 0; i < spec.repeatNodeCount; i++)
      nodeNames.push("");
    let topTerms = Object.keys(spec.topRules).map((r) => spec.topRules[r][1]);
    let nodeProps = [];
    for (let i = 0; i < nodeNames.length; i++)
      nodeProps.push([]);
    function setProp(nodeID, prop, value) {
      nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
    }
    if (spec.nodeProps)
      for (let propSpec of spec.nodeProps) {
        let prop = propSpec[0];
        if (typeof prop == "string")
          prop = NodeProp[prop];
        for (let i = 1; i < propSpec.length; ) {
          let next = propSpec[i++];
          if (next >= 0) {
            setProp(next, prop, propSpec[i++]);
          } else {
            let value = propSpec[i + -next];
            for (let j = -next; j > 0; j--)
              setProp(propSpec[i++], prop, value);
            i++;
          }
        }
      }
    this.nodeSet = new NodeSet(nodeNames.map((name, i) => NodeType.define({
      name: i >= this.minRepeatTerm ? void 0 : name,
      id: i,
      props: nodeProps[i],
      top: topTerms.indexOf(i) > -1,
      error: i == 0,
      skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i) > -1
    })));
    if (spec.propSources)
      this.nodeSet = this.nodeSet.extend(...spec.propSources);
    this.strict = false;
    this.bufferLength = DefaultBufferLength;
    let tokenArray = decodeArray(spec.tokenData);
    this.context = spec.context;
    this.specializerSpecs = spec.specialized || [];
    this.specialized = new Uint16Array(this.specializerSpecs.length);
    for (let i = 0; i < this.specializerSpecs.length; i++)
      this.specialized[i] = this.specializerSpecs[i].term;
    this.specializers = this.specializerSpecs.map(getSpecializer);
    this.states = decodeArray(spec.states, Uint32Array);
    this.data = decodeArray(spec.stateData);
    this.goto = decodeArray(spec.goto);
    this.maxTerm = spec.maxTerm;
    this.tokenizers = spec.tokenizers.map((value) => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
    this.topRules = spec.topRules;
    this.dialects = spec.dialects || {};
    this.dynamicPrecedences = spec.dynamicPrecedences || null;
    this.tokenPrecTable = spec.tokenPrec;
    this.termNames = spec.termNames || null;
    this.maxNode = this.nodeSet.types.length - 1;
    this.dialect = this.parseDialect();
    this.top = this.topRules[Object.keys(this.topRules)[0]];
  }
  createParse(input, fragments, ranges) {
    let parse = new Parse(this, input, fragments, ranges);
    for (let w of this.wrappers)
      parse = w(parse, input, fragments, ranges);
    return parse;
  }
  /**
  Get a goto table entry @internal
  */
  getGoto(state, term, loose = false) {
    let table = this.goto;
    if (term >= table[0])
      return -1;
    for (let pos = table[term + 1]; ; ) {
      let groupTag = table[pos++], last = groupTag & 1;
      let target = table[pos++];
      if (last && loose)
        return target;
      for (let end = pos + (groupTag >> 1); pos < end; pos++)
        if (table[pos] == state)
          return target;
      if (last)
        return -1;
    }
  }
  /**
  Check if this state has an action for a given terminal @internal
  */
  hasAction(state, terminal) {
    let data = this.data;
    for (let set = 0; set < 2; set++) {
      for (let i = this.stateSlot(
        state,
        set ? 2 : 1
        /* ParseState.Actions */
      ), next; ; i += 3) {
        if ((next = data[i]) == 65535) {
          if (data[i + 1] == 1)
            next = data[i = pair(data, i + 2)];
          else if (data[i + 1] == 2)
            return pair(data, i + 2);
          else
            break;
        }
        if (next == terminal || next == 0)
          return pair(data, i + 1);
      }
    }
    return 0;
  }
  /**
  @internal
  */
  stateSlot(state, slot) {
    return this.states[state * 6 + slot];
  }
  /**
  @internal
  */
  stateFlag(state, flag) {
    return (this.stateSlot(
      state,
      0
      /* ParseState.Flags */
    ) & flag) > 0;
  }
  /**
  @internal
  */
  validAction(state, action) {
    return !!this.allActions(state, (a) => a == action ? true : null);
  }
  /**
  @internal
  */
  allActions(state, action) {
    let deflt = this.stateSlot(
      state,
      4
      /* ParseState.DefaultReduce */
    );
    let result = deflt ? action(deflt) : void 0;
    for (let i = this.stateSlot(
      state,
      1
      /* ParseState.Actions */
    ); result == null; i += 3) {
      if (this.data[i] == 65535) {
        if (this.data[i + 1] == 1)
          i = pair(this.data, i + 2);
        else
          break;
      }
      result = action(pair(this.data, i + 1));
    }
    return result;
  }
  /**
  Get the states that can follow this one through shift actions or
  goto jumps. @internal
  */
  nextStates(state) {
    let result = [];
    for (let i = this.stateSlot(
      state,
      1
      /* ParseState.Actions */
    ); ; i += 3) {
      if (this.data[i] == 65535) {
        if (this.data[i + 1] == 1)
          i = pair(this.data, i + 2);
        else
          break;
      }
      if ((this.data[i + 2] & 65536 >> 16) == 0) {
        let value = this.data[i + 1];
        if (!result.some((v, i2) => i2 & 1 && v == value))
          result.push(this.data[i], value);
      }
    }
    return result;
  }
  /**
  Configure the parser. Returns a new parser instance that has the
  given settings modified. Settings not provided in `config` are
  kept from the original parser.
  */
  configure(config) {
    let copy = Object.assign(Object.create(_LRParser.prototype), this);
    if (config.props)
      copy.nodeSet = this.nodeSet.extend(...config.props);
    if (config.top) {
      let info = this.topRules[config.top];
      if (!info)
        throw new RangeError(`Invalid top rule name ${config.top}`);
      copy.top = info;
    }
    if (config.tokenizers)
      copy.tokenizers = this.tokenizers.map((t) => {
        let found = config.tokenizers.find((r) => r.from == t);
        return found ? found.to : t;
      });
    if (config.specializers) {
      copy.specializers = this.specializers.slice();
      copy.specializerSpecs = this.specializerSpecs.map((s, i) => {
        let found = config.specializers.find((r) => r.from == s.external);
        if (!found)
          return s;
        let spec = Object.assign(Object.assign({}, s), { external: found.to });
        copy.specializers[i] = getSpecializer(spec);
        return spec;
      });
    }
    if (config.contextTracker)
      copy.context = config.contextTracker;
    if (config.dialect)
      copy.dialect = this.parseDialect(config.dialect);
    if (config.strict != null)
      copy.strict = config.strict;
    if (config.wrap)
      copy.wrappers = copy.wrappers.concat(config.wrap);
    if (config.bufferLength != null)
      copy.bufferLength = config.bufferLength;
    return copy;
  }
  /**
  Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
  are registered for this parser.
  */
  hasWrappers() {
    return this.wrappers.length > 0;
  }
  /**
  Returns the name associated with a given term. This will only
  work for all terms when the parser was generated with the
  `--names` option. By default, only the names of tagged terms are
  stored.
  */
  getName(term) {
    return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
  }
  /**
  The eof term id is always allocated directly after the node
  types. @internal
  */
  get eofTerm() {
    return this.maxNode + 1;
  }
  /**
  The type of top node produced by the parser.
  */
  get topNode() {
    return this.nodeSet.types[this.top[1]];
  }
  /**
  @internal
  */
  dynamicPrecedence(term) {
    let prec = this.dynamicPrecedences;
    return prec == null ? 0 : prec[term] || 0;
  }
  /**
  @internal
  */
  parseDialect(dialect) {
    let values = Object.keys(this.dialects), flags = values.map(() => false);
    if (dialect)
      for (let part of dialect.split(" ")) {
        let id = values.indexOf(part);
        if (id >= 0)
          flags[id] = true;
      }
    let disabled = null;
    for (let i = 0; i < values.length; i++)
      if (!flags[i]) {
        for (let j = this.dialects[values[i]], id; (id = this.data[j++]) != 65535; )
          (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id] = 1;
      }
    return new Dialect(dialect, flags, disabled);
  }
  /**
  Used by the output of the parser generator. Not available to
  user code. @hide
  */
  static deserialize(spec) {
    return new _LRParser(spec);
  }
};
function pair(data, off) {
  return data[off] | data[off + 1] << 16;
}
function findFinished(stacks) {
  let best = null;
  for (let stack of stacks) {
    let stopped = stack.p.stoppedAt;
    if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) && stack.p.parser.stateFlag(
      stack.state,
      2
      /* StateFlag.Accepting */
    ) && (!best || best.score < stack.score))
      best = stack;
  }
  return best;
}
function getSpecializer(spec) {
  if (spec.external) {
    let mask = spec.extend ? 1 : 0;
    return (value, stack) => spec.external(value, stack) << 1 | mask;
  }
  return spec.get;
}

// node_modules/lezer-glsl/dist/index.js
var PreprocArg = 1;
var slash = 47;
var newline = 10;
var preprocArg = new ExternalTokenizer(
  (input) => {
    while (input.next !== slash && input.peek(1) !== slash && input.next !== -1 && input.next !== slash && input.next !== newline) {
      input.advance();
    }
    input.acceptToken(PreprocArg);
  },
  { contextual: true }
);
var glslHighlighting = styleTags({
  struct: tags.definitionKeyword,
  "precision const uniform in out centroid layout smooth flat invariant highp mediump lowp": tags.modifier,
  "if else switch for while do case default return break continue goto try catch": tags.controlKeyword,
  "true false": tags.bool,
  PrimitiveType: tags.standard(tags.typeName),
  TypeIdentifier: tags.typeName,
  FieldIdentifier: tags.propertyName,
  "CallExpression/FieldExpression/FieldIdentifier": tags.function(tags.propertyName),
  Identifier: tags.variableName,
  IdentifierDefinition: tags.definition(tags.variableName),
  "CallExpression/Identifier": tags.function(tags.variableName),
  "FunctionDeclarator/Identifier": tags.function(tags.definition(tags.variableName)),
  OperatorName: tags.operator,
  ArithOp: tags.arithmeticOperator,
  LogicOp: tags.logicOperator,
  BitOp: tags.bitwiseOperator,
  CompareOp: tags.compareOperator,
  AssignOp: tags.definitionOperator,
  UpdateOp: tags.updateOperator,
  LineComment: tags.lineComment,
  BlockComment: tags.blockComment,
  Number: tags.number,
  PreProcArg: tags.meta,
  String: tags.string,
  "PreprocDirectiveName #version #include": tags.processingInstruction,
  "( )": tags.strong,
  "[ ]": tags.squareBracket,
  "{ }": tags.brace,
  "< >": tags.angleBracket,
  ". ->": tags.derefOperator,
  ", ;": tags.separator
});
var spec_identifier = { __proto__: null, const: 26, in: 28, out: 30, centroid: 32, uniform: 34, layout: 40, smooth: 48, flat: 50, invariant: 52, highp: 54, mediump: 56, lowp: 58, struct: 64, void: 100, bool: 100, int: 100, uint: 100, float: 100, vec2: 100, vec3: 100, vec4: 100, bvec2: 100, bvec3: 100, bvec4: 100, ivec2: 100, ivec3: 100, ivec4: 100, uvec2: 100, uvec3: 100, uvec4: 100, mat2: 100, mat3: 100, mat4: 100, mat2x2: 100, mat2x3: 100, mat2x4: 100, mat3x2: 100, mat3x3: 100, mat3x4: 100, mat4x2: 100, mat4x3: 100, mat4x4: 100, sampler2D: 100, sampler3D: 100, samplerCube: 100, samplerCubeShadow: 100, sampler2DShadow: 100, sampler2DArray: 100, sampler2DArrayShadow: 100, isampler2D: 100, isampler3D: 100, isamplerCube: 100, isampler2DArray: 100, usampler2D: 100, usampler3D: 100, usamplerCube: 100, usampler2DArray: 100, true: 128, false: 130, case: 160, default: 162, switch: 168, if: 176, else: 178, do: 182, while: 184, for: 190, return: 194, break: 198, continue: 202, precision: 206 };
var parser = LRParser.deserialize({
  version: 14,
  states: "JSQkQQOOP#}OQOOO%sQQO'#CrOOQO'#FR'#FROOQO'#Ek'#EkO%}QQO'#FQO(VQQO'#EQO(^QQO'#DZO*YQQO'#F^O*pQQO'#FZO(^QQO'#DpO(^QQO'#DsOOQO'#F^'#F^O+OQQO'#FQOOQO'#FZ'#FZO+^QQO'#DzO+eQQO'#ChOOQO'#EQ'#EQO+mQQO'#EQOOQO'#Fk'#FkOOQO'#Fj'#FjOOQO'#FP'#FPOOQO'#Ej'#EjQkQQOOOOQO'#FS'#FSO+rQQO'#CoOOQO'#FX'#FXOOQO'#FY'#FYO+wQQO'#C{O,PQQO'#FZO,bQQO'#ERO,bQQO'#EVO,gQQO'#EYO,bQQO'#E]O-dQQO'#E^O-iQQO'#E`O-pQQO'#EbO-uQQO'#EdO-zQQO'#EfO(^QQO'#D}O.VQQO'#D}P.[fSO'#C`P.afSO'#C`P.rfTO'#C`POOO)C@k)C@kOOQO-E8i-E8iOOQO'#C}'#C}O.wQQO,5;lO(^QQO,59pO/YQQO,59rO(^QQO,59tO(^QQO,59vO/_QQO'#D_OOQO,59x,59xOOQO'#Dc'#DcOOQO'#De'#DeOOQO'#Df'#DfOOQO'#Di'#DiO(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O(^QQO,59{O0mQQO,5:_OOQO,5:l,5:lO1gQQO,59uO1nQQO,59uO1sQQOOO(^QQO,59qO1xQQO,5:[O3uQQO,5:_O4VQQO,59nOOQO,5;k,5;kOOQO,5:f,5:fO4^QQO,5:fOOQO'#Du'#DuO4eQQO'#FiO+eQQO'#DyOOQO'#Fh'#FhO4sQQO'#FhO5UQQO,59SO5^QQO'#FiO5fQQO,5:gOOQO-E8h-E8hO5kQQO,59ZO%}QQO,59gO5pQQO,59gO7]QQO'#ETO7gQQO,5:mO,gQQO,5:qO7lQQO,5:tO,gQQO,5:wO7qQQO,5:xO7{QQO,5:zOOQO,5:z,5:zO8SQQO,5:zOOQO,5:|,5:|OOQO,5;O,5;OO8XQQO,5;QO9bQQO,5:iO9iQQO,5:iP:rfSO,58zPOfO'#Eh'#EhP:wfSO'#EyPOOO'#Ey'#EyP:}fSO'#EyP;SOWO'#CdP;_OWO'#CdPOOO,58z,58zP;jfSO,58zO;uQQO1G/[OOQO'#DX'#DXOOQO1G/^1G/^O;|QQO1G/`O<TQQO1G/bOOQO1G/b1G/bO<_QQO'#FbO<iQQO,59yO>OQQO1G/gO?aQQO1G/gOAOQQO1G/gOAVQQO1G/gOBnQQO1G/gOBuQQO1G/gOD^QQO1G/gODeQQO1G/gOE|QQO1G/gOFTQQO1G/gOG]QQO1G/gOOQO1G/a1G/aOGsQQO1G/]OHZQQO1G/YOOQO1G/Y1G/YOOQO1G0Q1G0QOHbQQO'#EpOOQO,5:d,5:dO(^QQO,5:hO+eQQO'#ErOHiQQO,5<TOHqQQO,5:eOHyQQO'#DvOOQO,5:`,5:`OOQO1G.n1G.nOOQO1G0R1G0ROOQO'#Cr'#CrOIQQQO'#FVOI]QQO'#FUOIeQQO1G.uO%}QQO'#DQOIjQQO'#DQOIrQQO'#DPOOQO'#Em'#EmOIyQQO1G/RO%}QQO1G/ROJOQQO,5:oOJVQQO'#FQO+eQQO'#EUOJhQQO,5:oO(^QQO,5:oOJmQQO,5:oOOQO1G0X1G0XOJtQQO1G0]OMaQQO1G0`OOQO1G0c1G0cOMfQQO1G0dO+eQQO'#D{OMmQQO1G0dOMtQQO1G0dOOQO1G0f1G0fOMyQQO1G0lONOQQO1G0TOOQO'#Es'#EsONOQQO1G0TP;jfSO1G.fPOfO-E8f-E8fPOOO,5;e,5;eP! XfSO,5;ePOOO'#Ei'#EiP! ^OWO,59OPOfO,59O,59OP! iOWO,59OPOOO1G.f1G.fO(^QQO7+$vOOQO7+$z7+$zO(^QQO'#EoO! tQQO,5;|OOQO1G/e1G/eOOQO7+$t7+$tO! |QQO,5;[OOQO,5;[,5;[POQO-E8n-E8nO!!TQQO1G0SO!!_QQO,5;^OOQO,5;^,5;^OOQO-E8p-E8pOOQO1G0P1G0PO!!mQQO'#DwO!!{QQO'#FgO!#TQQO,5:bO!#YQQO,5;qO5kQQO'#ElO!#_QQO,5;pOOQO7+$a7+$aOIjQQO,59lO!#gQQO'#F]O!#oQQO,59lOOQO-E8k-E8kOOQO7+$m7+$mO!#tQQO7+$mOOQO1G0Z1G0ZO!#yQQO,5:pOOQO,5:p,5:pO!$wQQO1G0ZO!%OQQO1G0ZO(^QQO1G0ZO,gQQO7+%wO!%TQQO7+%zO!%YQQO7+&OO!%aQQO7+&OO!%hQQO7+&OO!%oQQO7+&OOOQO7+&W7+&WO!%tQQO7+%oOOQO-E8q-E8qPOOO7+$Q7+$QPOOO1G1P1G1PPOOO-E8g-E8gPOfO1G.j1G.jO!&}QQO<<HbO!'bQQO,5;ZOOQO-E8m-E8mOOQO1G0v1G0vO!'lQQO,5:cO%}QQO'#EqO!'wQQO,5<ROOQO1G/|1G/|OOQO1G1]1G1]OOQO,5;W,5;WOOQO-E8j-E8jO!(PQQO1G/WO5kQQO'#EnO!(UQQO,5;wOOQO1G/W1G/WOOQO<<HX<<HXOOQO7+%u7+%uO!(^QQO7+%uO!(eQQO7+%uOOQO<<Ic<<IcOOQO<<If<<IfO!(jQQO<<IjO!(qQQO<<IjO!(xQQO<<IjO!(}QQO<<IjO,gQQO<<IjO!)UQQO<<IjOOQO,5;],5;]OOQO-E8o-E8oOOQO7+$r7+$rOOQO,5;Y,5;YOOQO-E8l-E8lOOQO<<Ia<<IaO!)ZQQOAN?UO!)bQQOAN?UO,gQQOAN?UO!)iQQOAN?UOOQOAN?UAN?UOOQO,5:_,5:_O!)nQQOG24pO,gQQOG24pO!)uQQOG24pOOQOG24pG24pO,gQQOLD*[OOQOLD*[LD*[OOQO!$'Mv!$'MvO!+_QQO'#CrO$YQQO'#CrO!,UQQO'#FZO!,^QQO,5:_O!/kQQO1G/gO!1YQQO1G/gO!3TQQO1G/gO!3[QQO1G/gO!5PQQO1G/gO!5WQQO1G/gO!6{QQO1G/gO!7SQQO1G/gO!8wQQO1G/gO!9OQQO1G/gP!:WQQO1G/gO!:zQQO1G/]O!;nQQO1G0SO!<bQQO<<HbO!=UQQO'#DsO!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59{O!=UQQO,59qO!=UQQO,5:hO!=UQQO7+$vO!=yQQO'#F^O!=UQQO'#DpO!>mQQO1G/[O(^QQO,59p",
  stateData: "!?R~O#kOSQOSROSTPQVPQYPQ~O#rOS~OU[O]hO^hO_hO`hOahOdiOeVOhjOijOjROkkOlkOmkOplOr_O!SmO!UYO!aZO!b[O!c[O!eYO!fYO!rwO!sxO!vnO!zoO!}pO#OqO#RrO#TsO#VtO#XuO#ZvO#wQO$OaO~OTyOVzOY{O~OefXeqXgfXwfXwqX!PfX!UfX!WfX!ZfX![fX!^fX!_fX!`fX!afX#wqX#zfX$OfX$RfX$TfX$VfX$WfX$XfX$YfX~O$OqXbfX~P$YO]hO^hO_hO`hOahOdiOhjOijOjROkkOlkOmkOplO!S^O#w!OO~Oe!UOg!TOw!SO!U![O!W!]O!Z!`O![!aO!^!cO!_!dO!`!eO!a!fO$R!QO$T!RO$V!WO$W!XO$X!YO$Y!ZO~O$O!gO~P'OOU[OeVOplO!S'TO!UYO!aZO!b[O!c[O!eYO!fYO#w'RO~Oe$QXg$QXw$QX!U$QX!W$QX!Z$QX![$QX!^$QX!_$QX!`$QX!a$QX$R$QX$T$QX$V$QX$W$QX$X$QX$Y$QX~O!P!kO#z!kO$O$QXb$QX$S$QXu$QX~P)ROe!UOw#}X#w#}X$O#}X~Ow!nO$O!oOe#tX#w#tX~On!pO~PkOe!tO#w!rO~O$O!gO~Oe!{O~Or!|O#w!OO~Oe!UOe#}Xw#}X#w#}X$O#}X~Oe#OO~Or_O!rwO!sxO!vnO!zoO!}pO#OqO#RrO#TsO#VtO#XuO#ZvO$OaO~P(^Oe#TO~O$O#VO~P(^O$O#XO~O$O#YO~OkkOlkOmkO~O$S#]O~OU#^O~OQ#bOR#_O#n#aO#o#cO#q#dO~OP#fO~Ow!nOe#ta#w#tab#tag#ta~O#w#hO~Ob$UP~P(^Og!ga!U!ga!W!ga!Z!ga![!ga!^!ga!_!ga!`!ga$O!ga$R!ga$V!ga$W!ga$X!ga$Y!gab!ga$S!gau!ga~OU[OplO!S'TO!b[O!c[O!eYO!fYO#w'ROe!gaw!ga!a!ga$T!ga~P/fOb#zO~P'OOb#zO~Ow!nO~Oe!UOw!SO$T!ROg!da!U!da!W!da!Z!da![!da!^!da!_!da!`!da!a!da$O!da$R!da$V!da$W!da$X!da$Y!dab!da$S!dau!daU!dap!da!S!da!b!da!c!da!e!da!f!da#w!da~Oe!UOw!SO!a!fO$T!RO~P/fOu#}O~P(^On$OO~PkOg$SOw$PO#z$RO$O$]X~Oe$VOg$[Xw$[X#z$[X$O$[X~Or_O$O$XO~Og$SO$O$]X~O$O$YO~O#w$ZO~Or$dO~OU[O]hO^hO_hO`hOahOdiOeVOhjOijOjROkkOlkOmkOplO!SmO!UYO!aZO!b[O!c[O!eYO!fYO~Og$iO#wQO~P5uOr_O~O#O$mO~O#w'SO$O$qO~P5uO$O$sO~P'OO$O$sO~O!S$tO~Oe!UOw!SO!U![O!W!]O!Z!`O![!aO!^!cO!_!dO!`!eO!a!fO$R!QO$T!RO$V!WO$W!XO$X!YO$Y!ZO~O$S$uO~P8^Or_O!vnO!zoO!}pO#OqO#RrO#TsO#VtO#XuO#ZvO#w'SO$OaO!r!qa!s!qa#h!qan!qa!{!qa~P5uO#l$xO~OQ${OR#_O#n$zO~OX$|O#o%OO#p$|O~OX$|O#p$|O#q%OO~OQ#bOR#_O#n#aO~O$S%RO~P8^Ou%SO~P8^O$O!Oib!Oi~P'OOg%TOb$UX~P8^Ob%VO~Oe!UOw!SO!W!]O!a!fO$T!RO$V!WOg!Ti!Z!Ti![!Ti!^!Ti!_!Ti!`!Ti$O!Ti$R!Ti$W!Ti$X!Ti$Y!Tib!Ti$S!Tiu!Ti~O!U!Ti~P<nOe!UOw!SO!a!fO$T!ROg!Ti!Z!Ti![!Ti!^!Ti!_!Ti!`!Ti$O!Ti$R!Ti$W!Ti$X!Ti$Y!Tib!Ti$S!Tiu!Ti~O!U!Ti!W!Ti$V!Ti~P>VOe!UOw!SO!U![O!W!]O!Z!`O![!aO!^!cO!_!dO!`!eO!a!fO$T!RO$V!WO$Y!ZOg!Ti$O!Ti$R!Ti$X!Tib!Ti$S!Tiu!Ti~O$W!Ti~P?nO$W!XO~P?nOe!UOw!SO!U![O!W!]O!^!cO!_!dO!`!eO!a!fO$T!RO$V!WO$Y!ZOg!Ti!Z!Ti$O!Ti$R!Ti$W!Ti$X!Tib!Ti$S!Tiu!Ti~O![!aO~PA^O![!Ti~PA^Oe!UOw!SO!U![O!W!]O!_!dO!`!eO!a!fO$T!RO$V!WOg!Ti!Z!Ti![!Ti$O!Ti$R!Ti$W!Ti$X!Ti$Y!Tib!Ti$S!Tiu!Ti~O!^!cO~PB|O!^!Ti~PB|Oe!UOw!SO!U![O!W!]O!a!fO$T!RO$V!WOg!Ti!Z!Ti![!Ti!^!Ti!_!Ti$O!Ti$R!Ti$W!Ti$X!Ti$Y!Tib!Ti$S!Tiu!Ti~O!`!eO~PDlO!U![O~P<nOe!UOw!SO!U![O!W!]O!Z!`O![!aO!^!cO!_!dO!`!eO!a!fO$T!RO$V!WO$W!XO$X!YO$Y!ZO~Og!Ti$O!Ti$R!Tib!Ti$S!Tiu!Ti~PF[Ogyi$Oyi$Ryibyi$Syiuyi~PF[Ou%WO~P8^Ou%YO~P(^Og$SO$O$]a~Ob%`Ow$PO~Ob$ZP~P%}O#z%dOb#yXg#yX~Og%eOb#xX~Ob%gO~Ow!nO#w$ZO~OnsX~P%}On%lO~Ob%nO~P'OOw!nOe#tX#w#tXb#tXg#tX~Ob%nO~Og%sO~P(^O!{%tOU!yi]!yi^!yi_!yi`!yia!yid!yie!yih!yii!yij!yik!yil!yim!yip!yir!yi!S!yi!U!yi!a!yi!b!yi!c!yi!e!yi!f!yi!r!yi!s!yi!v!yi!z!yi!}!yi#O!yi#R!yi#T!yi#V!yi#X!yi#Z!yi#h!yi#w!yi$O!yin!yi~OeVO~O$O%vO~P'OO$O%xO~P(^O$O%vO~O$O%zO~Or_O!vnO!zoO!}pO#OqO#RrO#TsO#VtO#XuO#ZvO#w'SO$OaO!r!qi!s!qi#h!qin!qi!{!qi~P5uO#n&OO~OX$|O#o&QO#p$|O~OX$|O#p$|O#q&QO~Og%TOb$Ua~Ou&UO~P8^Og!pi$O!pi~P8^Ow$PO#z$ROg#fa$O#fa~Oe!tO#w!rOb!kXg!kX~Og&WOb$ZX~Ob&YO~OU&ZO~Og%eOb#xa~Og&_O$O$PX~O$O&aO~On&bO~Ow$PO#z'qOU!xae!xag!xap!xa!S!xa!U!xa!a!xa!b!xa!c!xa!e!xa!f!xa#w!xa~Ob&cO~P'OOb&cO~O$O&gO~O$O&iO~P(^O$O&iO~P'OOb&lO~P(^O$O&iO~Or_O!vnO!zoO!}pO#OqO#RrO#TsO#VtO#XuO#ZvO#w'SO$OaO!r!qq!s!qq#h!qqn!qq!{!qq~P5uOgxy$Oxybxy$Sxyuxy~P8^Ob#cag#ca~P8^Ow$POb!kag!ka~Og&WOb$Za~O$O&pO~Og&_O$O$Pa~Ob&sO~P'OOb&sO~O$O&tO~P'OOb&vO~P(^O$O&tO~Ob&vO~P'OOb&vO~Ob&{O~P(^Ob&{O~P'OOb&{O~Ob'OO~P'OOb'OO~OefXgfXwfXwqX!PfX!UfX!WfX!ZfX![fX!^fX!_fX!`fX!afX#zfX$RfX$TfX$VfX$WfX$XfX$YfX$OfX~ObfX$SfXufXUfXpfX!SfX!bfX!cfX!efX!ffX#wfX~P!)zOe!UOw#}X~Oe!UOw!SO!a&yO$T!ROU!gag!gap!ga!S!ga!U!ga!W!ga!Z!ga![!ga!^!ga!_!ga!`!ga!b!ga!c!ga!e!ga!f!ga#w!ga$R!ga$V!ga$W!ga$X!ga$Y!ga~Oe!UOw!SO!W'gO!a&yO$T!RO$V!WOU!Tig!Tip!Ti!S!Ti!Z!Ti![!Ti!^!Ti!_!Ti!`!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$W!Ti$X!Ti$Y!Ti~O!U!Ti~P!-}Oe!UOw!SO!a&yO$T!ROU!Tig!Tip!Ti!S!Ti!Z!Ti![!Ti!^!Ti!_!Ti!`!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$W!Ti$X!Ti$Y!Ti~O!U!Ti!W!Ti$V!Ti~P!/rOe!UOw!SO!U'fO!W'gO!Z'jO!['kO!^'mO!_'nO!`'oO!a&yO$T!RO$V!WO$Y!ZOU!Tig!Tip!Ti!S!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$X!Ti~O$W!Ti~P!1gO$W!XO~P!1gOe!UOw!SO!U'fO!W'gO!^'mO!_'nO!`'oO!a&yO$T!RO$V!WO$Y!ZOU!Tig!Tip!Ti!S!Ti!Z!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$W!Ti$X!Ti~O!['kO~P!3cO![!Ti~P!3cOe!UOw!SO!U'fO!W'gO!_'nO!`'oO!a&yO$T!RO$V!WOU!Tig!Tip!Ti!S!Ti!Z!Ti![!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$W!Ti$X!Ti$Y!Ti~O!^'mO~P!5_O!^!Ti~P!5_Oe!UOw!SO!U'fO!W'gO!a&yO$T!RO$V!WOU!Tig!Tip!Ti!S!Ti!Z!Ti![!Ti!^!Ti!_!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti$W!Ti$X!Ti$Y!Ti~O!`'oO~P!7ZO!U'fO~P!-}Oe!UOw!SO!U'fO!W'gO!Z'jO!['kO!^'mO!_'nO!`'oO!a&yO$T!RO$V!WO$W!XO$X!YO$Y!ZO~OU!Tig!Tip!Ti!S!Ti!b!Ti!c!Ti!e!Ti!f!Ti#w!Ti$R!Ti~P!9VOUyigyipyi!Syi!byi!cyi!eyi!fyi#wyi$Ryi~P!9VO$R'vOU!pig!pip!pi!S!pi!b!pi!c!pi!e!pi!f!pi#w!pi~P!9VO$R'vOUxygxypxy!Sxy!bxy!cxy!exy!fxy#wxy~P!9VOU[OeVOplO!S'TO!U'tO!a'eO!b[O!c[O!e'tO!f'tO#w'RO~O!P'pO#z'pOU$QXp$QX!S$QX!b$QX!c$QX!e$QX!f$QX#w$QX~P)RO$S'rO~P8^OTVYeQR!W#r!UU$TU~",
  goto: "ES$`PPPP$aPPP$dPPP$gPPPPPP$mPP%QPPPPPPPP&wP(hP*[*bP*gP,Y,Y-r/^-r/a0}P,Y2WP,YP3cP4h5]PP6OPPPPPP,YPP,Y6y6|7W7Z7a7a7i8R8b8lPP8z8zP9^9g8zPP8zPP8z8zP8zP8zP8zP8zP9j9r9|:W:o:u:|;S;Y;a;g;nPPPPP;xPPPPP<R<X<m$mP=Q=TP$m=Z=qP?l?rPPPCdPPPPCgCjCzDODnR|PR#fzXeO_g!qsROT_g!q!|#O#T#]$V$_$a$d$u$w%{&W#^WOVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q#O#Q#S#T#]$P$R$i$j$q$u$w%R%T%s%t%v%x%{&i&l&t&v&{'O'vS$[!{%eS%i$`%hQ&q&_o's'e'f'g'h'i'j'k'l'm'n'o'p'q'r't$]^OTVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q!|#O#Q#S#T#]$P$R$V$_$a$d$i$j$q$u$w%R%T%s%t%v%x%{&W&i&l&t&v&{'O'e'f'g'h'i'j'k'l'm'n'o'p'q'r't'v$[^OTVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q!|#O#Q#S#T#]$P$R$V$_$a$d$i$j$q$u$w%R%T%s%t%v%x%{&W&i&l&t&v&{'O'e'f'g'h'i'j'k'l'm'n'o'p'q'r't'vR!}lQ$c!|R%m$dV$b!|$a$d#|XOVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q#O#Q#S#T#]$P$R$i$j$q$u$w%R%T%s%t%v%x%{&i&l&t&v&{'O'e'f'g'h'i'j'k'l'm'n'o'p'q'r't'v_^T!|$V$_$a$d&W#}[OVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q#O#Q#S#T#]$P$R$i$j$q$u$w%R%T%s%t%v%x%{&i&l&t&v&{'O'e'f'g'h'i'j'k'l'm'n'o'p'q'r't'v#^WOVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n!q#O#Q#S#T#]$P$R$i$j$q$u$w%R%T%s%t%v%x%{&i&l&t&v&{'O'vo's'e'f'g'h'i'j'k'l'm'n'o'p'q'r'tR#i!R#[WOVYZ_gpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!k!n!q#O#Q#S#T#]$P$R$i$j$q$u$w%R%T%s%t%v%x%{&i&l&t&v&{'O'vQ%u$mo's'e'f'g'h'i'j'k'l'm'n'o'p'q'r'tpbO_gp!q#Q#S#]$u$w%t%{&l&v&{'OQ!iVQ#WsQ#l!TQ$h#OQ$r#TS%r$i$jQ%y$qQ&e%sQ&j%vQ&m%xQ&w&iR&|&t#c!VUXm!h!l!m#U#[#g#j#k#m#o#p#q#r#s#t#u#v#w#x#y#{#|$e$o%X%[%q%w&R&S&d&h&k&u&z'T'U'V'W'X'Y'Z'[']'^'_'`'a'b'c'd'u!f!]U!h#U#[#g#j#k#m#o#q#r#s#t#u#v#w#x#y#{#|$e$o%X%[%q%w&R&S&d&h&k&u&z'uk'g'V'X'Y'Z'[']'^'_'`'a'b'c'd!U!^U!h#U#[#g#j#k#m#r#y#{#|$e$o%X%[%q%w&R&S&d&h&k&u&z'uZ'h'Y'a'b'c'd!S!_U!h#U#[#g#j#k#m#y#{#|$e$o%X%[%q%w&R&S&d&h&k&u&z'uX'i'a'b'c'd![!bU!h#U#[#g#j#k#m#q#r#s#t#y#{#|$e$o%X%[%q%w&R&S&d&h&k&u&z'ua'l'X'Y'Z'['a'b'c'dR!w`Y!u!t$S$g$p%aR!v`R$W!vQ%b$VR&n&W]!u`!t$S$g$p%apcO_gp!q#Q#S#]$u$w%t%{&l&v&{'OQ$X!wR$k#PWeO_g!qQ$q#TX$v#]$u$w%{S!x`$pQ%^$SR%p$gidO_gp!q#Q#S%t&l&v&{'OqcO_gp!q#Q#S#]$u$w%t%{&l&v&{'OQ#PnQ#QoR#SqR$j#OU#`z#f$xR$y#`Q$}#cQ%P#dT&P$}%PQgOQ!q_T!zg!qhTO_g!q#O#T#]$V$u$w%{&WS}T$_V$_!|$a$dQ%f$]R&]%fS$a!|$dR%k$aQ&`%iR&r&`Q%U#mR&T%UZ$Q!s$U%]%o&VQ&X%bR&o&XS$T!s!xR%_$TQ$w#]Q%{$uT%|$w%{Q#ezQ%Q#fR%}$xXfO_g!qW`O_g!qQ$g#OY$p#T#]$u$w%{T%a$V&WsSOT_g!q!|#O#T#]$V$_$a$d$u$w%{&WR$^!{Q$]!{R&[%erROT_g!q!|#O#T#]$V$_$a$d$u$w%{&WR#ZvW]O_g!qQ!PT#h!jVYZpsw!Q!S!T!U![!]!^!_!`!a!b!c!d!e!f!k!n#Q#S$P$R$i$j$q%R%T%s%t%v%x&i&l&t&v&{'O'e'f'g'h'i'j'k'l'm'n'o'p'q'r't'vU$`!|$a$d`$f#O#T#]$V$u$w%{&WR%h$_Q%j$`R&^%hpUO_gp!q#Q#S#]$u$w%t%{&l&v&{'OQ!hVS!lY'tQ!mZQ#UsQ#[wQ#g!QQ#j!SQ#k!TQ#m!UQ#o![Q#p!]Q#q!^Q#r!_Q#s!`Q#t!aQ#u!bQ#v!cQ#w!dQ#x!eQ#y!fQ#{!kQ#|!nQ$e#OQ$o#TQ%X$PQ%[$RS%q$i$jQ%w$qQ&R%RQ&S%TQ&d%sQ&h%vQ&k%xQ&u&iQ&z&tQ'U'eQ'V'fQ'W'gQ'X'hQ'Y'iQ'Z'jQ'['kQ']'lQ'^'mQ'_'nQ'`'oQ'b'pQ'c'qQ'd'rR'u'vR#n!UR%c$VS!s`$pQ$U!tQ%]$SQ%o$gR&V%aT!y`$pWeO_g!qQ#RpQ$l#QQ$n#SQ&f%tQ&x&lQ&}&vQ'P&{R'Q'OhdO_gp!q#Q#S%t&l&v&{'OX$v#]$u$w%{",
  nodeNames: "⚠ PreprocArg LineComment BlockComment PreprocDirective #version Number #include String EscapeSequence PreprocDirectiveName Program FunctionDefinition const in out centroid uniform ) LayoutQualifier layout ( Identifier , smooth flat invariant highp mediump lowp } StructSpecifier struct TypeIdentifier { StructDeclarationList FieldDeclaration ] ArraySpecifier [ ConditionalExpression AssignmentExpression FieldExpression FieldIdentifier SubscriptExpression ParenthesizedExpression CommaExpression UpdateOp CallExpression ArgumentList PrimitiveType BinaryExpression ArithOp ArithOp ArithOp LogicOp LogicOp BitOp BitOp BitOp CompareOp CompareOp BitOp UpdateOp true false UnaryExpression LogicOp BitOp UpdateExpression FunctionDeclarator IdentifierDefinition ParameterList ParameterDeclaration ArrayDeclarator ParenthesizedDeclarator CompoundStatement Declaration InitDeclarator CaseStatement case default ExpressionStatement SwitchStatement switch ConditionClause Declaration IfStatement if else DoStatement do while WhileStatement ForStatement for ReturnStatement return BreakStatement break ContinueStatement continue PrecisionStatement precision",
  maxTerm: 153,
  nodeProps: [
    ["isolate", -3, 2, 3, 8, ""],
    ["group", -13, 6, 22, 40, 41, 42, 44, 45, 48, 51, 64, 65, 66, 69, "Expression", -4, 31, 33, 38, 50, "Type", -12, 76, 79, 82, 83, 87, 90, 93, 94, 96, 98, 100, 102, "Statement"],
    ["openedBy", 18, "(", 30, "{"],
    ["closedBy", 21, ")", 34, "}"]
  ],
  propSources: [glslHighlighting],
  skippedNodes: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 104, 105],
  repeatNodeCount: 12,
  tokenData: "#2n~R!QOX$XXY$yYZ'vZ]$X]^&s^p$Xpq$yqr(^rs)nst)stu$Xuv=nvw?Owx@cxy@hyzAUz{Ar{|Bf|}C|}!ODj!O!PEd!P!Q!#g!Q!R!,b!R![!9s![!]!La!]!^!L}!^!_!Mk!_!`#!f!`!a##Y!a!b#$P!b!c$X!c!}#$m!}#O#%s#O#P#&a#P#Q#+j#Q#R#,W#R#S#$m#S#T$X#T#X#$m#X#Y#,z#Y#o#$m#o#p#/`#p#q#/|#q#r#1d#r#s#2Q#s;'S$X;'S;=`$s<%lO$XS$^V#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XS$vP;=`<%l$XV%S^#pS#kP#rQOX$XXY$yYZ&OZ]$X]^&s^p$Xpq$yqr$Xsw$Xx#O$X#O#P&d#P;'S$X;'S;=`$s<%lO$XP&TT#kPXY&OYZ&O]^&Opq&O#O#P&dP&gQYZ&O]^&mP&pPYZ&OT&z^#pS#kPOX$XXY&sYZ&OZ]$X]^&s^p$Xpq&sqr$Xsw$Xx#O$X#O#P&d#P;'S$X;'S;=`$s<%lO$XR'}T#nQ#kPXY&OYZ&O]^&Opq&O#O#P&dT(eX!eP#pSOY$XZr$Xsw$Xx!_$X!_!`)Q!`#O$X#P;'S$X;'S;=`$s<%lO$XT)XV!^P#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$X~)sO#o~T)xb#pSOX$XXY)sZp$Xpq)sqr$Xsw$Xx!c$X!c!}+Q!}#O$X#P#T$X#T#]+Q#]#^,W#^#j+Q#j#k4z#k#o+Q#o;'S$X;'S;=`$s<%lO$XT+X_#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#o+Q#o;'S$X;'S;=`$s<%lO$XT,_a#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#b+Q#b#c-d#c#o+Q#o;'S$X;'S;=`$s<%lO$XT-ka#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#V+Q#V#W.p#W#o+Q#o;'S$X;'S;=`$s<%lO$XT.wa#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#`+Q#`#a/|#a#o+Q#o;'S$X;'S;=`$s<%lO$XT0Ta#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#i+Q#i#j1Y#j#o+Q#o;'S$X;'S;=`$s<%lO$XT1aa#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#W+Q#W#X2f#X#o+Q#o;'S$X;'S;=`$s<%lO$XT2ma#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#X+Q#X#Y3r#Y#o+Q#o;'S$X;'S;=`$s<%lO$XT3{_#pSVPYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#o+Q#o;'S$X;'S;=`$s<%lO$XT5Ra#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#X+Q#X#Y6W#Y#o+Q#o;'S$X;'S;=`$s<%lO$XT6_a#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#f+Q#f#g7d#g#o+Q#o;'S$X;'S;=`$s<%lO$XT7ka#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#g+Q#g#h8p#h#o+Q#o;'S$X;'S;=`$s<%lO$XT8wa#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#]+Q#]#^9|#^#o+Q#o;'S$X;'S;=`$s<%lO$XT:Ta#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#c+Q#c#d;Y#d#o+Q#o;'S$X;'S;=`$s<%lO$XT;aa#pSYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#b+Q#b#c<f#c#o+Q#o;'S$X;'S;=`$s<%lO$XT<o_#pSTPYPOY$XZr$Xsw$Xx!Q$X!Q![+Q![!c$X!c!}+Q!}#O$X#P#R$X#R#S+Q#S#T$X#T#o+Q#o;'S$X;'S;=`$s<%lO$XT=uX#pS!WPOY$XZr$Xsw$Xx!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XT>iV!PP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT?VY$YP#pSOY$XZr$Xsv$Xvw?ux!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XT?|V$WP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$X~@hO#q~T@oV#pSePOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XTA]VbP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XTAyX$VP#pSOY$XZr$Xsw$Xx!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XTBmZ#pS!UPOY$XZr$Xsw$Xx{$X{|C`|!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XTCgV!aP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XTDTVgP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XTDqZ#pS!UPOY$XZr$Xsw$Xx}$X}!OC`!O!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XVEkX#pS$TPOY$XZr$Xsw$Xx!Q$X!Q![FW![#O$X#P;'S$X;'S;=`$s<%lO$XVF_l#pSUROY$XZr$Xsw$XwxHVx!Q$X!Q![FW![!g$X!g!hKh!h!i!!T!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#X$X#X#YKh#Y#Z!!T#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XRHYP!Q![H]RHb[URwxHV!Q![H]!g!hIW!h!iKP!n!oKP!r!sIW!w!xKP#X#YIW#Y#ZKP#`#aKP#d#eIW#i#jKPRI]ZUR{|JO}!OJO!Q![J[!c!hJ[!h!iJ[!n!oKP!w!xKP#T#YJ[#Y#ZJ[#`#aKP#i#jKPRJRR!Q![J[!c!iJ[#T#ZJ[RJaYURwxJO!Q![J[!c!hJ[!h!iJ[!n!oKP!w!xKP#T#YJ[#Y#ZJ[#`#aKP#i#jKPRKUUUR!h!iKP!n!oKP!w!xKP#Y#ZKP#`#aKP#i#jKPVKok#pSUROY$XZr$Xsw$Xx{$X{|Md|}$X}!OMd!O!Q$X!Q![Nb![!c$X!c!hNb!h!iNb!i!n$X!n!o!!T!o!w$X!w!x!!T!x#O$X#P#T$X#T#YNb#Y#ZNb#Z#`$X#`#a!!T#a#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XVMi]#pSOY$XZr$Xsw$Xx!Q$X!Q![Nb![!c$X!c!iNb!i#O$X#P#T$X#T#ZNb#Z;'S$X;'S;=`$s<%lO$XVNih#pSUROY$XZr$Xsw$XwxJOx!Q$X!Q![Nb![!c$X!c!hNb!h!iNb!i!n$X!n!o!!T!o!w$X!w!x!!T!x#O$X#P#T$X#T#YNb#Y#ZNb#Z#`$X#`#a!!T#a#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!![c#pSUROY$XZr$Xsw$Xx!h$X!h!i!!T!i!n$X!n!o!!T!o!w$X!w!x!!T!x#O$X#P#Y$X#Y#Z!!T#Z#`$X#`#a!!T#a#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!#n]#pS!WPOY$XZr$Xsw$Xxz$Xz{!$g{!P$X!P!Q!(d!Q!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XV!$l]#pSOY!$gYZ!%eZr!$grs!%esw!$gwx!%exz!$gz{!&l{#O!$g#O#P!%e#P;'S!$g;'S;=`!(^<%lO!$gR!%hTOz!%ez{!%w{;'S!%e;'S;=`!&f<%lO!%eR!%zVOz!%ez{!%w{!P!%e!P!Q!&a!Q;'S!%e;'S;=`!&f<%lO!%eR!&fORRR!&iP;=`<%l!%eV!&q_#pSOY!$gYZ!%eZr!$grs!%esw!$gwx!%exz!$gz{!&l{!P!$g!P!Q!'p!Q#O!$g#O#P!%e#P;'S!$g;'S;=`!(^<%lO!$gV!'wV#pSRROY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XV!(aP;=`<%l!$gV!(kY#pSQROY!(dZr!(drs!)Zsw!(dwx!)Zx#O!(d#O#P!)r#P;'S!(d;'S;=`!,[<%lO!(dR!)`UQROY!)ZZ#O!)Z#O#P!)r#P;'S!)Z;'S;=`!,U<%lO!)ZR!)wUQROY!)ZZ#O!)Z#O#P!*Z#P;'S!)Z;'S;=`!,U<%lO!)ZR!*`YQROY!)ZZ#O!)Z#O#P!*Z#P#b!)Z#b#c!)Z#c#f!)Z#f#g!+O#g;'S!)Z;'S;=`!,U<%lO!)ZR!+TUQROY!)ZZ#O!)Z#O#P!+g#P;'S!)Z;'S;=`!,U<%lO!)ZR!+lWQROY!)ZZ#O!)Z#O#P!*Z#P#b!)Z#b#c!)Z#c;'S!)Z;'S;=`!,U<%lO!)ZR!,XP;=`<%l!)ZV!,_P;=`<%l!(dV!,ir#pSUROY$XZr$Xsw$Xwx!.sx!O$X!O!P!3Z!P!Q$X!Q![!9s![!g$X!g!hKh!h!i!!T!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#U$X#U#V!;x#V#X$X#X#YKh#Y#Z!!T#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j#l$X#l#m!Hq#m;'S$X;'S;=`$s<%lO$XR!.vP!Q![!.yR!/O]URwx!.s!O!P!/w!Q![!.y!g!hIW!h!iKP!n!oKP!r!sIW!w!xKP#X#YIW#Y#ZKP#`#aKP#d#eIW#i#jKPR!/|]UR!Q![!0u!c!g!0u!g!h!2S!h!i!0u!n!oKP!r!sIW!w!xKP#T#X!0u#X#Y!2S#Y#Z!0u#`#aKP#d#eIW#i#jKPR!0z^URwx!1v!Q![!0u!c!g!0u!g!h!2S!h!i!0u!n!oKP!r!sIW!w!xKP#T#X!0u#X#Y!2S#Y#Z!0u#`#aKP#d#eIW#i#jKPR!1yR!Q![!0u!c!i!0u#T#Z!0uR!2X`URwx!1v{|JO}!OJO!Q![!0u!c!g!0u!g!h!2S!h!i!0u!n!oKP!r!sIW!w!xKP#T#X!0u#X#Y!2S#Y#Z!0u#`#aKP#d#eIW#i#jKPV!3bm#pSUROY$XZr$Xsw$Xx!Q$X!Q![!5]![!c$X!c!g!5]!g!h!7b!h!i!5]!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#X!5]#X#Y!7b#Y#Z!5]#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!5dn#pSUROY$XZr$Xsw$Xwx!1vx!Q$X!Q![!5]![!c$X!c!g!5]!g!h!7b!h!i!5]!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#X!5]#X#Y!7b#Y#Z!5]#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!7ir#pSUROY$XZr$Xsw$Xwx!1vx{$X{|Md|}$X}!OMd!O!Q$X!Q![!5]![!c$X!c!g!5]!g!h!7b!h!i!5]!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#X!5]#X#Y!7b#Y#Z!5]#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!9zn#pSUROY$XZr$Xsw$Xwx!.sx!O$X!O!P!3Z!P!Q$X!Q![!9s![!g$X!g!hKh!h!i!!T!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#X$X#X#YKh#Y#Z!!T#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!;}[#pSOY$XZr$Xsw$Xx!O$X!O!P!<s!P!Q$X!Q!R!=e!R![!9s![#O$X#P;'S$X;'S;=`$s<%lO$XV!<xX#pSOY$XZr$Xsw$Xx!Q$X!Q![FW![#O$X#P;'S$X;'S;=`$s<%lO$XV!=lr#pSUROY$XZr$Xsw$Xwx!.sx!O$X!O!P!3Z!P!Q$X!Q![!9s![!g$X!g!hKh!h!i!!T!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#U$X#U#V!?v#V#X$X#X#YKh#Y#Z!!T#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j#l$X#l#m!@h#m;'S$X;'S;=`$s<%lO$XV!?{X#pSOY$XZr$Xsw$Xx!Q$X!Q![!9s![#O$X#P;'S$X;'S;=`$s<%lO$XV!@m]#pSOY$XZr$Xsw$Xx!Q$X!Q![!Af![!c$X!c!i!Af!i#O$X#P#T$X#T#Z!Af#Z;'S$X;'S;=`$s<%lO$XV!Amp#pSUROY$XZr$Xsw$Xwx!Cqx!O$X!O!P!3Z!P!Q$X!Q![!Af![!c$X!c!g!Af!g!h!F]!h!i!Af!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#X!Af#X#Y!F]#Y#Z!Af#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XR!CtR!Q![!C}!c!i!C}#T#Z!C}R!DS_URwx!Cq!O!P!/w!Q![!C}!c!g!C}!g!h!ER!h!i!C}!n!oKP!r!sIW!w!xKP#T#X!C}#X#Y!ER#Y#Z!C}#`#aKP#d#eIW#i#jKPR!EWaURwx!Cq{|JO}!OJO!O!P!/w!Q![!C}!c!g!C}!g!h!ER!h!i!C}!n!oKP!r!sIW!w!xKP#T#X!C}#X#Y!ER#Y#Z!C}#`#aKP#d#eIW#i#jKPV!Fds#pSUROY$XZr$Xsw$Xwx!Cqx{$X{|Md|}$X}!OMd!O!P!3Z!P!Q$X!Q![!Af![!c$X!c!g!Af!g!h!F]!h!i!Af!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#X!Af#X#Y!F]#Y#Z!Af#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j;'S$X;'S;=`$s<%lO$XV!Hv`#pSOY$XZr$Xsw$Xx!O$X!O!P!<s!P!Q$X!Q!R!Ix!R![!Af![!c$X!c!i!Af!i#O$X#P#T$X#T#Z!Af#Z;'S$X;'S;=`$s<%lO$XV!JPt#pSUROY$XZr$Xsw$Xwx!Cqx!O$X!O!P!3Z!P!Q$X!Q![!Af![!c$X!c!g!Af!g!h!F]!h!i!Af!i!n$X!n!o!!T!o!r$X!r!sKh!s!w$X!w!x!!T!x#O$X#P#T$X#T#U!Af#U#V!Af#V#X!Af#X#Y!F]#Y#Z!Af#Z#`$X#`#a!!T#a#d$X#d#eKh#e#i$X#i#j!!T#j#l$X#l#m!@h#m;'S$X;'S;=`$s<%lO$XT!LhV$SP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT!MUV$OP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT!MrY!_P#pSOY$XZr$Xsw$Xx!^$X!^!_!Nb!_!`# U!`#O$X#P;'S$X;'S;=`$s<%lO$XT!NiX!`P#pSOY$XZr$Xsw$Xx!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XT# ]X!_P#pSOY$XZr$Xsw$Xx!`$X!`!a# x!a#O$X#P;'S$X;'S;=`$s<%lO$XT#!PV!_P#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#!mX#zP#pSOY$XZr$Xsw$Xx!_$X!_!`)Q!`#O$X#P;'S$X;'S;=`$s<%lO$XT##aY!_P#pSOY$XZr$Xsw$Xx!_$X!_!`# x!`!a!Nb!a#O$X#P;'S$X;'S;=`$s<%lO$XT#$WV$RP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#$t_#wP#pSOY$XZr$Xsw$Xx!Q$X!Q![#$m![!c$X!c!}#$m!}#O$X#P#R$X#R#S#$m#S#T$X#T#o#$m#o;'S$X;'S;=`$s<%lO$XT#%zVwP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#&d_OY#'cYZ#'hZ]#'c]^#(O^!Q#'c!Q![#(W![!w#'c!w!x#(h!x#i#'c#i#j#)j#j#l#'c#l#m#*l#m;'S#'c;'S;=`#+d<%lO#'cS#'hOXST#'oTXS#kPXY&OYZ&O]^&Opq&O#O#P&dT#(TPXSYZ&OS#(]PXS!Q![#(`S#(ePXS!Q![#'cS#(kR!Q![#(t!c!i#(t#T#Z#(tS#(wR!Q![#)Q!c!i#)Q#T#Z#)QS#)TR!Q![#)^!c!i#)^#T#Z#)^S#)aR!Q![#)j!c!i#)j#T#Z#)jS#)mR!Q![#)v!c!i#)v#T#Z#)vS#)yR!Q![#*S!c!i#*S#T#Z#*SS#*VR!Q![#*`!c!i#*`#T#Z#*`S#*cR!Q![#'c!c!i#'c#T#Z#'cS#*oR!Q![#*x!c!i#*x#T#Z#*xS#*{R!Q![#+U!c!i#+U#T#Z#+US#+ZRXS!Q![#+U!c!i#+U#T#Z#+US#+gP;=`<%l#'cT#+qVuP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#,_X![P#pSOY$XZr$Xsw$Xx!_$X!_!`>b!`#O$X#P;'S$X;'S;=`$s<%lO$XV#-Ra#wP#pSOY$XZr$Xsw$Xx!Q$X!Q![#$m![!c$X!c!}#$m!}#O$X#P#R$X#R#S#$m#S#T$X#T#g#$m#g#h#.W#h#o#$m#o;'S$X;'S;=`$s<%lO$XV#.a_#lQ#wP#pSOY$XZr$Xsw$Xx!Q$X!Q![#$m![!c$X!c!}#$m!}#O$X#P#R$X#R#S#$m#S#T$X#T#o#$m#o;'S$X;'S;=`$s<%lO$XT#/gVrP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#0TZ!ZP#pSOY$XZr$Xsw$Xx!_$X!_!`>b!`#O$X#P#p$X#p#q#0v#q;'S$X;'S;=`$s<%lO$XT#0}V$XP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#1kVnP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$XT#2XV!fP#pSOY$XZr$Xsw$Xx#O$X#P;'S$X;'S;=`$s<%lO$X",
  tokenizers: [preprocArg, 0, 1, 2],
  topRules: { "Program": [0, 11] },
  dynamicPrecedences: { "22": -1, "75": -10 },
  specialized: [{ term: 131, get: (value) => spec_identifier[value] || -1 }],
  tokenPrec: 3486
});

// node_modules/codemirror-lang-glsl/dist/index.js
var glslLanguage = LRLanguage.define({
  name: "glsl",
  parser: parser.configure({
    props: [
      indentNodeProp.add({
        IfStatement: continuedIndent({ except: /^\s*({|else\b)/ }),
        CaseStatement: (context) => context.baseIndent + context.unit,
        BlockComment: () => null,
        CompoundStatement: delimitedIndent({ closing: "}" }),
        Statement: continuedIndent({ except: /^{/ })
      }),
      foldNodeProp.add({
        "StructDeclarationList CompoundStatement": foldInside,
        BlockComment(tree) {
          return { from: tree.from + 2, to: tree.to - 2 };
        }
      })
    ]
  }),
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    indentOnInput: /^\s*(?:case |default:|\{|\})$/,
    closeBrackets: {
      stringPrefixes: ["L", "u", "U", "u8", "LR", "UR", "uR", "u8R", "R"]
    }
  }
});
function glsl() {
  return new LanguageSupport(glslLanguage);
}
export {
  glsl,
  glslLanguage
};
//# sourceMappingURL=codemirror-lang-glsl.js.map
