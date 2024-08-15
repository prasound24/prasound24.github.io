class MicRecorder extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'channel', defaultValue: 0 },
    ];
  }

  constructor() {
    super();
    this.chunks = [];
    this.port.onmessage = (e) => this.onmessage(e);
  }

  async onmessage(e) {
    if (e.data != 'fetch-all')
      return;
    let buffers = this.chunks.map((a) => a.buffer);
    this.port.postMessage({ channels: [buffers] }, buffers);
    this.chunks = [];
  }

  process(inputs, outputs, params) {
    let num_inputs = Math.min(inputs.length, outputs.length);

    for (let k = 0; k < num_inputs; k++) {
      let input = inputs[k];
      let output = outputs[k];
      let num_channels = Math.min(input.length, output.length);

      for (let ch = 0; ch < num_channels; ch++) {
        let output_ch = output[ch];
        let input_ch = input[ch];
        for (let i = 0; i < input_ch.length; i++)
          output_ch[i] = input_ch[i];
      }

      if (num_channels > 0) {
        let chunk = input[0].slice(0);
        this.chunks.push(chunk);
        this.port.postMessage({ chunk });
      }
    }

    return true;
  }
}

registerProcessor('mic_thread', MicRecorder);
