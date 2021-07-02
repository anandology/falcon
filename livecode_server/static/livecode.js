
// Connection to a LiveCode session
//
// USAGE:
//
//  var livecode = new LiveCodeSession({
//    base_url: "http://livecode.example.com/",
//    runtime: "python",
//    code: "print('hello, world!')",
//    onMessage: (msg) => console.log(msg)
//  })
class LiveCodeSession {
  constructor(options) {
    this.options = options;
    this.base_url = new URL(options.base_url);
    this.runtime = options.runtime;
    this.code = options.code;
    this.files = options.files || [];
    this.env = options.env || {};
    this.command = options.command || null;
    this.onMessage = options.onMessage || null;

    this.ws = this.createWebSocket();
    this.send({
      "msgtype": "exec",
      "runtime": this.runtime,
      "code": this.code,
      "files": this.files,
      "env": this.env,
      "command": this.command
    })
  }

  createWebSocket() {
    let protocol = this.base_url.protocol == "https:" ? "wss:" : "ws:";
    let ws_url = protocol + "//" + this.base_url.host + "/livecode";
    let ws = new WebSocket(ws_url);
    ws.addEventListener("open", (ev) => this.processOpen(ev));
    ws.addEventListener("close", (ev) => this.processClose(ev));
    ws.addEventListener("message", (ev) => this.processMessage(ev));
    ws.addEventListener("error", (ev) => this.processError(ev));
    return ws;
  }

  close() {
    if (this.ws) {
      this.ws.close(1000)
      this.ws =  null;
    }
  }

  processOpen(ev) {
  }
  processClose(ev) {
  }
  processMessage(ev) {
    let msg = JSON.parse(ev.data);
    if (this.onMessage) {
      this.onMessage(msg)
    }
  }
  processError(ev) {
  }

  waitForOpen(ws, func) {
    if (ws.readyState == ws.OPEN) {
      func()
    }
    else {
      setTimeout(() => this.waitForOpen(ws, func), 1)
    }
  }

  send(msg) {
    var ws = this.ws;
    this.waitForOpen(ws, () => {
      ws.send(JSON.stringify(msg))
    })
  }
}

LIVECODE_CODEMIRROR_OPTIONS = {
  common: {
    lineNumbers: true,
    keyMap: "sublime",
    matchBrackets: true,
    indentWithTabs: false,
    tabSize: 4,
    indentUnit: 4,
    extraKeys: {
      Tab: (cm) => {
        cm.somethingSelected()
        ? cm.execCommand('indentMore')
        : cm.execCommand('insertSoftTab');
      }
    }
  },
  python: {
    mode: "python"
  },
  "python-canvas": {
    mode: "python"
  }
}

// Initialized the editor and all controls.
// It is expected that the given element is a parent element
// with textarea, div.output, button.run optionally canvas.canvas
// elements in it.
class LiveCodeEditor {
  constructor(element, options) {
    this.options = options;
    this.parent = element;

    this.base_url = options.base_url;
    this.runtime = options.runtime;

    this.files = options.files || [];
    this.env = options.env || {};
    this.command = options.command || null;

    this.session = null;

    this.elementCode = this.parent.querySelector(".code");
    this.elementOutput = this.parent.querySelector(".output");
    this.elementRun = this.parent.querySelector(".run");
    this.elementClear = this.parent.querySelector(".clear");
    this.elementReset = this.parent.querySelector(".reset");
    this.elementCanvas = this.parent.querySelector(".canvas");
    this.codemirror = null;
    this.autosaveTimeoutId = null;
    this.setupActions()
  }
  reset() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
    this.clearOutput();
  }
  run() {
    this.triggerEvent("beforeRun");
    this.reset();
    this.session = new LiveCodeSession({
      base_url: this.base_url,
      runtime: this.runtime,
      code: this.getCode(),
      files: this.files,
      env: this.env,
      command: this.command,
      onMessage: (msg) => this.onMessage(msg)
    });
  }
  triggerEvent(name) {
      var events = this.options.events;
      if (events && events[name]) {
	events[name](this);
      }
  }
  setupActions() {
    this.elementRun.onclick = () => this.run();
    if (this.elementClear) {
	this.elementClear.onclick = () => this.triggerEvent("clear");
    }
    if (this.elementReset) {
	this.elementReset.onclick = () => this.triggerEvent("reset");
    }

    if (this.options.codemirror) {
      const options = {
        ...LIVECODE_CODEMIRROR_OPTIONS.common,
        ...LIVECODE_CODEMIRROR_OPTIONS[this.runtime]
      }
      if (this.options.codemirror instanceof Object) {
        options = {...options, ...this.options.codemirror}
      }
      options.extraKeys['Cmd-Enter'] = () => this.run()
      options.extraKeys['Ctrl-Enter'] = () => this.run()

      this.codemirror = CodeMirror.fromTextArea(this.elementCode, options)

      if (this.options.autosave) {
        this.codemirror.on('change', (cm, change) => {
          if (this.autosaveTimeoutId) {
            clearTimeout(this.autosaveTimeoutId);
          }
          this.autosaveTimeoutId = setTimeout(() => {
            let code = this.codemirror.doc.getValue();
            this.options.autosave(this, code);
          }, 3000)
        })
      }
    }
  }

  getCode() {
    if (this.codemirror) {
      var code = this.codemirror.doc.getValue()
      return code.replaceAll("\t", " ".repeat(this.codemirror.options.indentUnit))
    }
    else {
      return this.elementCode.value;
    }
  }

  onMessage(msg) {
    if (msg.msgtype == 'write') {
      this.writeOutput(msg.data);
    }
    else {
      if (this.options.onMessage && this.options.onMessage[msg.msgtype]) {
        var func = this.options.onMessage[msg.msgtype];
        func(this, msg)
      }
    }
  }

  clearOutput() {
    if (this.elementOutput) {
      this.elementOutput.innerHTML = "";
    }
  }

  writeOutput(data) {
    // escape HTML
    var html = new Option(data).innerHTML;

    if (this.elementOutput) {
      this.elementOutput.innerHTML += html;
    }
  }
}
