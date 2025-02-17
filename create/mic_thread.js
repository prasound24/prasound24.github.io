class MicRecorder extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'channel', defaultValue: 0 },
    ];
  }

  constructor() {
    super();
    this.channels = [];
    this.port.onmessage = (e) => this.onmessage(e);
  }

  async onmessage(e) {
    if (e.data != 'fetch-all')
      return;
    this.port.postMessage({ channels: this.channels });
    this.channels = [];
  }

  process(inputs, outputs, params) {
    let num_inputs = Math.min(inputs.length, outputs.length);

    for (let k = 0; k < num_inputs; k++) {
      let input = inputs[k];
      let output = outputs[k];
      let nch = Math.min(input.length, output.length);

      for (let ch = 0; ch < nch; ch++) {
        let output_ch = output[ch];
        let input_ch = input[ch];
        for (let i = 0; i < input_ch.length; i++)
          output_ch[i] = input_ch[i];
      }

      if (nch > 0) {
        let channels = [];
        for (let ch = 0; ch < nch; ch++) {
          channels[ch] = input[ch].slice(0);
          this.channels[ch] = this.channels[ch] || [];
          this.channels[ch].push(channels[ch]);
        }
        this.port.postMessage({ channels, type: 'chunk' });
      }
    }

    return true;
  }
}

registerProcessor('mic_thread', MicRecorder);
