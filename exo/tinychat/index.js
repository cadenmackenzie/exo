document.addEventListener("alpine:init", () => {
  Alpine.data("state", () => ({
    // current state
    cstate: {
      time: null,
      messages: [],
      selectedModel: 'llama-3.2-1b',
    },    

    // historical state
    histories: JSON.parse(localStorage.getItem("histories")) || [],

    home: 0,
    generating: false,
    endpoint: `${window.location.origin}/v1`,
    errorMessage: null,

    // performance tracking
    time_till_first: 0,
    tokens_per_second: 0,
    total_tokens: 0,

    // image handling
    imagePreview: null,

    // download progress
    downloadProgress: null,
    downloadProgressInterval: null, // To keep track of the polling interval

    // Pending message storage
    pendingMessage: null,

    // Add these new properties
    downloadedModels: null,

    // Add this new property for model options
    modelOptions: {
      "llama-3.2-1b": { name: "Llama 3.2 1B" },
      "llama-3.2-3b": { name: "Llama 3.2 3B" },
      "llama-3.1-8b": { name: "Llama 3.1 8B" },
      "llama-3.1-70b": { name: "Llama 3.1 70B" },
      "llama-3.1-70b-bf16": { name: "Llama 3.1 70B (BF16)" },
      "llama-3.1-405b": { name: "Llama 3.1 405B" },
      "llama-3.1-405b-8bit": { name: "Llama 3.1 405B (8-bit)" },
      "gemma2-9b": { name: "Gemma2 9B" },
      "gemma2-27b": { name: "Gemma2 27B" },
      "nemotron-70b": { name: "Nemotron 70B" },
      "nemotron-70b-bf16": { name: "Nemotron 70B (BF16)" },
      "mistral-nemo": { name: "Mistral Nemo" },
      "mistral-large": { name: "Mistral Large" },
      "deepseek-coder-v2-lite": { name: "Deepseek Coder V2 Lite" },
      "deepseek-coder-v2.5": { name: "Deepseek Coder V2.5" },
      "llava-1.5-7b-hf": { name: "LLaVa 1.5 7B (Vision Model)" },
      "qwen-2.5-coder-1.5b": { name: "Qwen 2.5 Coder 1.5B" },
      "qwen-2.5-coder-3b": { name: "Qwen 2.5 Coder 3B" },
      "qwen-2.5-coder-7b": { name: "Qwen 2.5 Coder 7B" },
      "qwen-2.5-coder-14b": { name: "Qwen 2.5 Coder 14B" },
      "qwen-2.5-coder-32b": { name: "Qwen 2.5 Coder 32B" },
      "qwen-2.5-7b": { name: "Qwen 2.5 7B" },
      "qwen-2.5-math-7b": { name: "Qwen 2.5 7B (Math)" },
      "qwen-2.5-14b": { name: "Qwen 2.5 14B" },
      "qwen-2.5-72b": { name: "Qwen 2.5 72B" },
      "qwen-2.5-math-72b": { name: "Qwen 2.5 72B (Math)" },
      "llama-3-8b": { name: "Llama 3 8B" },
      "llama-3-70b": { name: "Llama 3 70B" }
    },

    // Add this property
    modelShards: null,

    async init() {
      try {
        console.log('Initializing with endpoint:', this.endpoint);
        
        // Fetch model shards first
        const shardsResponse = await fetch(`${this.endpoint}/models/shards`);
        const shardsData = await shardsResponse.json();
        this.modelShards = shardsData.model_shards;
        console.log('Loaded model shards:', this.modelShards);
        
        // Then fetch downloaded models
        const modelsResponse = await fetch(`${this.endpoint}/models/downloaded`);
        const modelsData = await modelsResponse.json();
        this.downloadedModels = modelsData.models;
        console.log('Loaded downloaded models:', this.downloadedModels);
        
        // Now check all models
        Object.keys(this.modelOptions).forEach(modelId => {
          const isDownloaded = this.isModelDownloaded(modelId);
          console.log(`Model ${modelId} downloaded: ${isDownloaded}`);
        });
      } catch (error) {
        console.error('Error initializing model data:', error);
      }
    },

    removeHistory(cstate) {
      const index = this.histories.findIndex((state) => {
        return state.time === cstate.time;
      });
      if (index !== -1) {
        this.histories.splice(index, 1);
        localStorage.setItem("histories", JSON.stringify(this.histories));
      }
    },

    clearAllHistory() {
      this.histories = [];
      localStorage.setItem("histories", JSON.stringify([]));
    },

    // Utility functions
    formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatDuration(seconds) {
      if (seconds === null || seconds === undefined || isNaN(seconds)) return '';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      if (h > 0) return `${h}h ${m}m ${s}s`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    },

    async handleImageUpload(event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.imagePreview = e.target.result;
          this.imageUrl = e.target.result; // Store the image URL
          // Add image preview to the chat
          this.cstate.messages.push({
            role: "user",
            content: `![Uploaded Image](${this.imagePreview})`,
          });
        };
        reader.readAsDataURL(file);
      }
    },


    async handleSend() {
      try {
        const el = document.getElementById("input-form");
        const value = el.value.trim();
        if (!value && !this.imagePreview) return;

        if (this.generating) return;
        this.generating = true;
        if (this.home === 0) this.home = 1;

        // ensure that going back in history will go back to home
        window.history.pushState({}, "", "/");

        // add message to list
        if (value) {
          this.cstate.messages.push({ role: "user", content: value });
        }

        // clear textarea
        el.value = "";
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";

        localStorage.setItem("pendingMessage", value);
        this.processMessage(value);
      } catch (error) {
        console.error('error', error)
        this.lastErrorMessage = error.message || 'Unknown error on handleSend';
        this.errorMessage = error.message || 'Unknown error on handleSend';
        setTimeout(() => {
          this.errorMessage = null;
        }, 5 * 1000)
        this.generating = false;
      }
    },

    async processMessage(value) {
      try {
        // reset performance tracking
        const prefill_start = Date.now();
        let start_time = 0;
        let tokens = 0;
        this.tokens_per_second = 0;

        // prepare messages for API request
        let apiMessages = this.cstate.messages.map(msg => {
          if (msg.content.startsWith('![Uploaded Image]')) {
            return {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: this.imageUrl
                  }
                },
                {
                  type: "text",
                  text: value // Use the actual text the user typed
                }
              ]
            };
          } else {
            return {
              role: msg.role,
              content: msg.content
            };
          }
        });
        const containsImage = apiMessages.some(msg => Array.isArray(msg.content) && msg.content.some(item => item.type === 'image_url'));
        if (containsImage) {
          // Map all messages with string content to object with type text
          apiMessages = apiMessages.map(msg => {
            if (typeof msg.content === 'string') {
              return {
                ...msg,
                content: [
                  {
                    type: "text",
                    text: msg.content
                  }
                ]
              };
            }
            return msg;
          });
        }


        // start receiving server sent events
        let gottenFirstChunk = false;
        for await (
          const chunk of this.openaiChatCompletion(this.cstate.selectedModel, apiMessages)
        ) {
          if (!gottenFirstChunk) {
            this.cstate.messages.push({ role: "assistant", content: "" });
            gottenFirstChunk = true;
          }

          // add chunk to the last message
          this.cstate.messages[this.cstate.messages.length - 1].content += chunk;

          // calculate performance tracking
          tokens += 1;
          this.total_tokens += 1;
          if (start_time === 0) {
            start_time = Date.now();
            this.time_till_first = start_time - prefill_start;
          } else {
            const diff = Date.now() - start_time;
            if (diff > 0) {
              this.tokens_per_second = tokens / (diff / 1000);
            }
          }
        }

        // Clean the cstate before adding it to histories
        const cleanedCstate = JSON.parse(JSON.stringify(this.cstate));
        cleanedCstate.messages = cleanedCstate.messages.map(msg => {
          if (Array.isArray(msg.content)) {
            return {
              ...msg,
              content: msg.content.map(item =>
                item.type === 'image_url' ? { type: 'image_url', image_url: { url: '[IMAGE_PLACEHOLDER]' } } : item
              )
            };
          }
          return msg;
        });

        // Update the state in histories or add it if it doesn't exist
        const index = this.histories.findIndex((cstate) => cstate.time === cleanedCstate.time);
        cleanedCstate.time = Date.now();
        if (index !== -1) {
          // Update the existing entry
          this.histories[index] = cleanedCstate;
        } else {
          // Add a new entry
          this.histories.push(cleanedCstate);
        }
        console.log(this.histories)
        // update in local storage
        try {
          localStorage.setItem("histories", JSON.stringify(this.histories));
        } catch (error) {
          console.error("Failed to save histories to localStorage:", error);
        }
      } catch (error) {
        console.error('error', error)
        this.lastErrorMessage = error;
        this.errorMessage = error;
        setTimeout(() => {
          this.errorMessage = null;
        }, 5 * 1000)
      } finally {
        this.generating = false;
      }
    },

    async handleEnter(event) {
      // if shift is not pressed
      if (!event.shiftKey) {
        event.preventDefault();
        await this.handleSend();
      }
    },

    updateTotalTokens(messages) {
      fetch(`${this.endpoint}/chat/token/encode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      }).then((response) => response.json()).then((data) => {
        this.total_tokens = data.length;
      }).catch(console.error);
    },

    async *openaiChatCompletion(model, messages) {
      // stream response
      console.log("model", model)
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          "model": model,
          "messages": messages,
          "stream": true,
        }),
      });
      if (!response.ok) {
        const errorResBody = await response.json()
        if (errorResBody?.detail) {
          throw new Error(`Failed to fetch completions: ${errorResBody.detail}`);
        } else {
          throw new Error("Failed to fetch completions: Unknown error");
        }
      }

      const reader = response.body.pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream()).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value.type === "event") {
          const json = JSON.parse(value.data);
          if (json.choices) {
            const choice = json.choices[0];
            if (choice.finish_reason === "stop") {
              break;
            }
            yield choice.delta.content;
          }
        }
      }
    },

    async fetchDownloadProgress() {
      try {
        const response = await fetch(`${this.endpoint}/download/progress`);
        if (response.ok) {
          const data = await response.json();
          const progressArray = Object.values(data);
          if (progressArray.length > 0) {
            this.downloadProgress = progressArray.map(progress => {
              // Check if download is complete
              if (progress.status === "complete") {
                return {
                  ...progress,
                  isComplete: true,
                  percentage: 100
                };
              } else if (progress.status === "failed") {
                return {
                  ...progress,
                  isComplete: false,
                  errorMessage: "Download failed"
                };
              } else {
                return {
                  ...progress,
                  isComplete: false,
                  downloaded_bytes_display: this.formatBytes(progress.downloaded_bytes),
                  total_bytes_display: this.formatBytes(progress.total_bytes),
                  overall_speed_display: progress.overall_speed ? this.formatBytes(progress.overall_speed) + '/s' : '',
                  overall_eta_display: progress.overall_eta ? this.formatDuration(progress.overall_eta) : '',
                  percentage: ((progress.downloaded_bytes / progress.total_bytes) * 100).toFixed(2)
                };
              }
            });
            const allComplete = this.downloadProgress.every(progress => progress.isComplete);
            if (allComplete) {
              // Check for pendingMessage
              const savedMessage = localStorage.getItem("pendingMessage");
              if (savedMessage) {
                // Clear pendingMessage
                localStorage.removeItem("pendingMessage");
                // Call processMessage() with savedMessage
                if (this.lastErrorMessage) {
                  await this.processMessage(savedMessage);
                }
              }
              this.lastErrorMessage = null;
              this.downloadProgress = null;
              await this.fetchDownloadedModels();
            }
          } else {
            // No ongoing download
            this.downloadProgress = null;
          }
        }
      } catch (error) {
        console.error("Error fetching download progress:", error);
        this.downloadProgress = null;
      }
    },

    startDownloadProgressPolling() {
      if (this.downloadProgressInterval) {
        // Already polling
        return;
      }
      this.fetchDownloadProgress(); // Fetch immediately
      this.downloadProgressInterval = setInterval(() => {
        this.fetchDownloadProgress();
      }, 1000); // Poll every second
    },

    // Add this new method
    async fetchDownloadedModels() {
      try {
        const response = await fetch(`${this.endpoint}/models/downloaded`);
        if (response.ok) {
          const data = await response.json();
          this.downloadedModels = data.models;
        }
      } catch (error) {
        console.error("Error fetching downloaded models:", error);
      }
    },

    isModelDownloaded(modelId) {
        if (!this.modelShards || !this.downloadedModels) {
            return false;
        }

        const modelShards = this.modelShards[modelId];
        if (!modelShards) {
            return false;
        }

        const mlxShard = modelShards.MLXDynamicShardInferenceEngine;
        const tinygradShard = modelShards.TinygradDynamicShardInferenceEngine;

        return this.downloadedModels.some(downloadedModel => {
            // Convert models--org--name to org/name
            const normalizedDownloaded = downloadedModel.replace(/^models--/, '').replace(/--/g, '/');
            
            // Check both MLX and Tinygrad shards
            const mlxMatch = mlxShard && normalizedDownloaded === mlxShard.model_id;
            const tinygradMatch = tinygradShard && normalizedDownloaded === tinygradShard.model_id;

            if (mlxMatch || tinygradMatch) {
                console.log(`Found match for ${modelId}:`, normalizedDownloaded);
            }

            return mlxMatch || tinygradMatch;
        });
    }
  }));
});

const { markedHighlight } = globalThis.markedHighlight;
marked.use(markedHighlight({
  langPrefix: "hljs language-",
  highlight(code, lang, _info) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
  },
}));

// **** eventsource-parser ****
class EventSourceParserStream extends TransformStream {
  constructor() {
    let parser;

    super({
      start(controller) {
        parser = createParser((event) => {
          if (event.type === "event") {
            controller.enqueue(event);
          }
        });
      },

      transform(chunk) {
        parser.feed(chunk);
      },
    });
  }
}

function createParser(onParse) {
  let isFirstChunk;
  let buffer;
  let startingPosition;
  let startingFieldLength;
  let eventId;
  let eventName;
  let data;
  reset();
  return {
    feed,
    reset,
  };
  function reset() {
    isFirstChunk = true;
    buffer = "";
    startingPosition = 0;
    startingFieldLength = -1;
    eventId = void 0;
    eventName = void 0;
    data = "";
  }
  function feed(chunk) {
    buffer = buffer ? buffer + chunk : chunk;
    if (isFirstChunk && hasBom(buffer)) {
      buffer = buffer.slice(BOM.length);
    }
    isFirstChunk = false;
    const length = buffer.length;
    let position = 0;
    let discardTrailingNewline = false;
    while (position < length) {
      if (discardTrailingNewline) {
        if (buffer[position] === "\n") {
          ++position;
        }
        discardTrailingNewline = false;
      }
      let lineLength = -1;
      let fieldLength = startingFieldLength;
      let character;
      for (
        let index = startingPosition;
        lineLength < 0 && index < length;
        ++index
      ) {
        character = buffer[index];
        if (character === ":" && fieldLength < 0) {
          fieldLength = index - position;
        } else if (character === "\r") {
          discardTrailingNewline = true;
          lineLength = index - position;
        } else if (character === "\n") {
          lineLength = index - position;
        }
      }
      if (lineLength < 0) {
        startingPosition = length - position;
        startingFieldLength = fieldLength;
        break;
      } else {
        startingPosition = 0;
        startingFieldLength = -1;
      }
      parseEventStreamLine(buffer, position, fieldLength, lineLength);
      position += lineLength + 1;
    }
    if (position === length) {
      buffer = "";
    } else if (position > 0) {
      buffer = buffer.slice(position);
    }
  }
  function parseEventStreamLine(lineBuffer, index, fieldLength, lineLength) {
    if (lineLength === 0) {
      if (data.length > 0) {
        onParse({
          type: "event",
          id: eventId,
          event: eventName || void 0,
          data: data.slice(0, -1),
          // remove trailing newline
        });

        data = "";
        eventId = void 0;
      }
      eventName = void 0;
      return;
    }
    const noValue = fieldLength < 0;
    const field = lineBuffer.slice(
      index,
      index + (noValue ? lineLength : fieldLength),
    );
    let step = 0;
    if (noValue) {
      step = lineLength;
    } else if (lineBuffer[index + fieldLength + 1] === " ") {
      step = fieldLength + 2;
    } else {
      step = fieldLength + 1;
    }
    const position = index + step;
    const valueLength = lineLength - step;
    const value = lineBuffer.slice(position, position + valueLength).toString();
    if (field === "data") {
      data += value ? "".concat(value, "\n") : "\n";
    } else if (field === "event") {
      eventName = value;
    } else if (field === "id" && !value.includes("\0")) {
      eventId = value;
    } else if (field === "retry") {
      const retry = parseInt(value, 10);
      if (!Number.isNaN(retry)) {
        onParse({
          type: "reconnect-interval",
          value: retry,
        });
      }
    }
  }
}
const BOM = [239, 187, 191];
function hasBom(buffer) {
  return BOM.every((charCode, index) => buffer.charCodeAt(index) === charCode);
}
