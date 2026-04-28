// Must run before livekit-client is required — Hermes doesn't have DOMException
if (typeof (global as any).DOMException === 'undefined') {
  (global as any).DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? 'Error';
    }
  };
}
